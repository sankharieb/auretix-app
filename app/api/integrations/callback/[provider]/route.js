import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../../lib/auth-context.js";
import {
  buildConnectedAccount,
  getProvider,
  parseIntegrationState,
} from "../../../../../lib/integrations.js";
import { upsertIntegrationAccount } from "../../../../../lib/workspace-store.js";

export async function GET(request, { params }) {
  const requestUrl = new URL(request.url);
  const { provider } = await params;
  const providerConfig = getProvider(provider);

  try {
    if (!providerConfig) {
      throw new Error("Unknown integration provider.");
    }

    const state = parseIntegrationState(requestUrl.searchParams.get("state"));
    const context = await getRequestContext(request);
    const callbackContext =
      context.authenticated || !state?.companyId
        ? context
        : {
            mode: "integration_callback",
            authenticated: true,
            role: "owner",
            company: {
              id: state.companyId,
              name: "Auretix connected company",
              slug: state.companyId.replace(/^company_/, ""),
            },
            user: {
              id: "integration_callback",
              authUserId: null,
              companyId: state.companyId,
              name: "Integration callback",
              email: "integration-callback@auretix.local",
              role: "owner",
            },
            permissions: {
              canReadWorkspace: true,
              canManageWorkspace: true,
              canRunDecisions: true,
              canManageUsers: false,
            },
          };

    if (!callbackContext.authenticated || !state) {
      throw new Error("Sign in to Auretix before completing integration authorization.");
    }

    const account = buildConnectedAccount(provider, requestUrl.searchParams);

    if (!account) {
      throw new Error("Unable to read integration callback.");
    }

    await upsertIntegrationAccount(provider, account, callbackContext, state.workspaceId || null);

    return NextResponse.redirect(
      new URL(
        `/app?integration_connected=${encodeURIComponent(providerConfig.name)}`,
        requestUrl.origin,
      ),
    );
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/app?integration_error=${encodeURIComponent(
          error.message || "Unable to complete integration authorization.",
        )}`,
        requestUrl.origin,
      ),
    );
  }
}
