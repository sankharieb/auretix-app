import crypto from "node:crypto";

export const integrationProviders = {
  shopify: {
    id: "shopify",
    name: "Shopify",
    category: "Commerce",
    purpose: "Orders, product catalog, inventory levels, and purchase-order context.",
    docsUrl:
      "https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant",
    requiredEnv: ["SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"],
    optionalEnv: ["SHOPIFY_SCOPES"],
    defaultScopes: "read_products,read_inventory,read_orders,read_purchase_orders",
    dataNeeded: ["Orders", "Products", "Inventory levels", "Purchase orders"],
    roiContribution:
      "Measures stockout risk from real order velocity and validates reorder decisions against actual sell-through.",
  },
  amazon: {
    id: "amazon",
    name: "Amazon Seller Central",
    category: "Marketplace",
    purpose: "Amazon order velocity, catalog exposure, FBA/inbound signals, and seller account demand.",
    docsUrl:
      "https://developer-docs.amazon.com/sp-api/lang-en_US/docs/authorizing-selling-partner-api-applications",
    requiredEnv: ["AMAZON_SP_API_APPLICATION_ID"],
    optionalEnv: ["AMAZON_SP_API_SELLER_CENTRAL_URL", "AMAZON_SP_API_DRAFT_MODE"],
    dataNeeded: ["Orders", "Listings", "Inbound shipments", "Reports"],
    roiContribution:
      "Quantifies protected marketplace revenue and detects channel-specific stockout exposure.",
  },
  quickbooks: {
    id: "quickbooks",
    name: "QuickBooks Online",
    category: "Accounting",
    purpose: "COGS, invoices, bills, vendor spend, cash impact, and purchase-order finance checks.",
    docsUrl:
      "https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0",
    requiredEnv: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"],
    optionalEnv: ["QUICKBOOKS_ENVIRONMENT", "QUICKBOOKS_SCOPES"],
    defaultScopes: "com.intuit.quickbooks.accounting",
    dataNeeded: ["Bills", "Items", "Vendors", "Purchase orders", "Profit and loss"],
    roiContribution:
      "Proves cash preserved, avoided overbuying, vendor exposure, and gross-margin impact.",
  },
};

export function getProvider(providerId) {
  return integrationProviders[providerId] || null;
}

function getEnv(name) {
  return process.env[name] || "";
}

export function getProviderSetupStatus(providerId) {
  const provider = getProvider(providerId);

  if (!provider) {
    return null;
  }

  const missingEnv = provider.requiredEnv.filter((name) => !getEnv(name));
  const configuredEnv = [...provider.requiredEnv, ...provider.optionalEnv].filter((name) =>
    Boolean(getEnv(name)),
  );

  return {
    ...provider,
    configured: missingEnv.length === 0,
    missingEnv,
    configuredEnv,
  };
}

export function getIntegrationAccounts(workspace) {
  return workspace?.metadata?.integrations || {};
}

export function getIntegrationStatuses(workspace) {
  const accounts = getIntegrationAccounts(workspace);

  return Object.values(integrationProviders).map((provider) => {
    const setup = getProviderSetupStatus(provider.id);
    const account = accounts[provider.id] || null;

    return {
      id: provider.id,
      name: provider.name,
      category: provider.category,
      purpose: provider.purpose,
      docsUrl: provider.docsUrl,
      dataNeeded: provider.dataNeeded,
      roiContribution: provider.roiContribution,
      configured: setup.configured,
      missingEnv: setup.missingEnv,
      connectionStatus: account?.status || "not_connected",
      connectedAt: account?.connectedAt || null,
      accountLabel: account?.accountLabel || null,
      lastSyncAt: account?.lastSyncAt || null,
      scopes: account?.scopes || null,
      setupState: setup.configured
        ? account
          ? "Connected"
          : "Ready to connect"
        : "Needs credentials",
    };
  });
}

export function createIntegrationState(providerId, companyId, workspaceId) {
  const payload = {
    providerId,
    companyId,
    workspaceId,
    nonce: crypto.randomBytes(16).toString("hex"),
    createdAt: new Date().toISOString(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret =
    process.env.INTEGRATION_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "auretix-local-dev-state";
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");

  return `${body}.${signature}`;
}

export function parseIntegrationState(state) {
  if (!state) {
    return null;
  }

  try {
    const [body, signature] = state.split(".");
    const secret =
      process.env.INTEGRATION_STATE_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "auretix-local-dev-state";
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");

    if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }

    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function getAppBaseUrl(request) {
  const requestUrl = new URL(request.url);
  return process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin;
}

function normalizeShopDomain(shop) {
  const value = String(shop || "").trim().toLowerCase();

  if (!value) {
    return "";
  }

  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) {
    return value;
  }

  if (/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    return `${value}.myshopify.com`;
  }

  return "";
}

export function buildProviderAuthorizationUrl(providerId, request, context, workspaceId) {
  const provider = getProviderSetupStatus(providerId);

  if (!provider) {
    return {
      error: "Unknown integration provider.",
      status: 404,
    };
  }

  if (!provider.configured) {
    return {
      error: `${provider.name} credentials are missing: ${provider.missingEnv.join(", ")}.`,
      status: 400,
    };
  }

  const requestUrl = new URL(request.url);
  const appBaseUrl = getAppBaseUrl(request);
  const state = createIntegrationState(providerId, context.company.id, workspaceId);
  const redirectUri = `${appBaseUrl}/api/integrations/callback/${providerId}`;

  if (providerId === "shopify") {
    const shop = normalizeShopDomain(requestUrl.searchParams.get("shop"));

    if (!shop) {
      return {
        error: "Shopify requires a valid shop query parameter, for example ?shop=your-store.",
        status: 400,
      };
    }

    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    authUrl.searchParams.set("client_id", process.env.SHOPIFY_CLIENT_ID);
    authUrl.searchParams.set(
      "scope",
      process.env.SHOPIFY_SCOPES || integrationProviders.shopify.defaultScopes,
    );
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);

    return {
      url: authUrl.toString(),
    };
  }

  if (providerId === "amazon") {
    const sellerCentral =
      process.env.AMAZON_SP_API_SELLER_CENTRAL_URL || "https://sellercentral.amazon.com";
    const authUrl = new URL("/apps/authorize/consent", sellerCentral);
    authUrl.searchParams.set("application_id", process.env.AMAZON_SP_API_APPLICATION_ID);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);

    if (process.env.AMAZON_SP_API_DRAFT_MODE !== "false") {
      authUrl.searchParams.set("version", "beta");
    }

    return {
      url: authUrl.toString(),
    };
  }

  if (providerId === "quickbooks") {
    const authUrl = new URL("https://appcenter.intuit.com/connect/oauth2");
    authUrl.searchParams.set("client_id", process.env.QUICKBOOKS_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set(
      "scope",
      process.env.QUICKBOOKS_SCOPES || integrationProviders.quickbooks.defaultScopes,
    );
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);

    return {
      url: authUrl.toString(),
    };
  }

  return {
    error: "Unsupported integration provider.",
    status: 400,
  };
}

export function buildConnectedAccount(providerId, query) {
  const provider = getProvider(providerId);
  const now = new Date().toISOString();

  if (!provider) {
    return null;
  }

  if (providerId === "shopify") {
    return {
      providerId,
      providerName: provider.name,
      status: "authorized",
      accountLabel: query.get("shop") || "Shopify store",
      connectedAt: now,
      lastSyncAt: null,
      scopes: process.env.SHOPIFY_SCOPES || provider.defaultScopes,
      tokenStatus: query.get("code") ? "authorization_code_received" : "pending",
      externalAccountId: query.get("shop") || null,
    };
  }

  if (providerId === "amazon") {
    return {
      providerId,
      providerName: provider.name,
      status: "authorized",
      accountLabel: query.get("selling_partner_id") || "Amazon seller",
      connectedAt: now,
      lastSyncAt: null,
      scopes: "SP-API role grants",
      tokenStatus: query.get("spapi_oauth_code") ? "authorization_code_received" : "pending",
      externalAccountId: query.get("selling_partner_id") || null,
    };
  }

  if (providerId === "quickbooks") {
    return {
      providerId,
      providerName: provider.name,
      status: "authorized",
      accountLabel: query.get("realmId") || "QuickBooks company",
      connectedAt: now,
      lastSyncAt: null,
      scopes: process.env.QUICKBOOKS_SCOPES || provider.defaultScopes,
      tokenStatus: query.get("code") ? "authorization_code_received" : "pending",
      externalAccountId: query.get("realmId") || null,
    };
  }

  return null;
}
