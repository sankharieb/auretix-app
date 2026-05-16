import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getWorkspaceBundle } from "./workspace-store.js";

const dataDirectory = path.join(process.cwd(), "data");
const partnerNetworkFile = path.join(dataDirectory, "partner-network-store.json");

const defaultCompany = {
  id: "company_demo",
  name: "Demo Operating Company",
  slug: "demo",
};

const defaultUser = {
  id: "user_demo_owner",
  authUserId: null,
  companyId: "company_demo",
  name: "Demo Owner",
  email: "owner@example.com",
  role: "owner",
};

const defaultPartnerDirectory = [
  {
    id: "partner_freight_expedite",
    partnerType: "freight",
    name: "Expedite lane partner",
    coverage: "Port, warehouse, and parcel expedite quotes",
    fitSummary: "Best when a high-value SKU has low cover and inbound ETA risk.",
    contactMethod: "Founder-introduced quote request",
    status: "candidate",
    disclosure:
      "Auretix may receive a disclosed referral or service fee only after seller approval.",
    metadata: {
      pilotOnly: true,
      serviceLevel: "expedite",
    },
  },
  {
    id: "partner_supplier_backup",
    partnerType: "backup-supplier",
    name: "Backup supplier scout",
    coverage: "Supplier sourcing, backup factory search, and category fit checks",
    fitSummary: "Best when supplier reliability or lead time threatens a seller's active SKU.",
    contactMethod: "Founder-led supplier introduction",
    status: "candidate",
    disclosure:
      "Auretix may receive a disclosed supplier referral or sourcing fee only after seller approval.",
    metadata: {
      pilotOnly: true,
      serviceLevel: "sourcing",
    },
  },
  {
    id: "partner_wholesale_source",
    partnerType: "wholesale",
    name: "Wholesale source desk",
    coverage: "Wholesale lots, MOQ fit, category sourcing, and margin review",
    fitSummary: "Best when Auretix recommends a buy but the seller needs a better source.",
    contactMethod: "Founder-screened wholesale lead",
    status: "candidate",
    disclosure:
      "Auretix may receive a disclosed sourcing fee, referral fee, or negotiated margin only after seller approval.",
    metadata: {
      pilotOnly: true,
      serviceLevel: "wholesale",
    },
  },
  {
    id: "partner_3pl_flow",
    partnerType: "third-party-logistics",
    name: "3PL flow support",
    coverage: "Inventory transfer, channel availability, and fulfillment-node support",
    fitSummary: "Best when stock is in the wrong place or channels are at risk.",
    contactMethod: "Founder-introduced 3PL fit check",
    status: "candidate",
    disclosure:
      "Auretix may receive a disclosed 3PL referral or onboarding fee only after seller approval.",
    metadata: {
      pilotOnly: true,
      serviceLevel: "fulfillment",
    },
  },
];

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeContext(context = {}) {
  const company = context.company || defaultCompany;
  const user = context.user || {
    ...defaultUser,
    companyId: company.id,
  };

  return {
    company,
    user,
    role: context.role || user.role || "owner",
  };
}

function getDefaultWorkspaceId(company) {
  if (!company || company.id === defaultCompany.id) {
    return "workspace_demo";
  }

  const slug = company.slug || company.id;
  return `workspace_${slug.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function partnerWithTenant(partner, auth, workspaceId) {
  return {
    ...partner,
    id: `${partner.id}_${auth.company.id}`.replace(/[^a-zA-Z0-9_/-]/g, "_"),
    companyId: auth.company.id,
    workspaceId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function isSupabaseStoreConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

async function getSupabaseNetworkClient() {
  if (!isSupabaseStoreConfigured()) {
    return null;
  }

  const { createSupabaseServerClient, createSupabaseServiceClient } = await import(
    "./supabase/server.js"
  );

  return createSupabaseServiceClient() || (await createSupabaseServerClient());
}

async function ensurePartnerNetworkStore() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(partnerNetworkFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeFile(
        partnerNetworkFile,
        JSON.stringify(
          {
            version: 1,
            partners: [],
            requests: [],
          },
          null,
          2,
        ),
        "utf8",
      );
      return;
    }

    throw error;
  }
}

async function readPartnerNetworkStore() {
  await ensurePartnerNetworkStore();
  const raw = await readFile(partnerNetworkFile, "utf8");
  const store = JSON.parse(raw);

  return {
    version: 1,
    partners: Array.isArray(store.partners) ? store.partners : [],
    requests: Array.isArray(store.requests) ? store.requests : [],
  };
}

async function writePartnerNetworkStore(store) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(partnerNetworkFile, JSON.stringify(store, null, 2), "utf8");
}

async function ensureTenantRecordsInSupabase(supabase, context = {}) {
  const auth = normalizeContext(context);
  const companyPayload = {
    id: auth.company.id,
    name: auth.company.name,
    slug: auth.company.slug,
  };
  const userPayload = {
    id: auth.user.id,
    auth_user_id: auth.user.authUserId,
    company_id: auth.company.id,
    name: auth.user.name,
    email: auth.user.email,
    role: auth.role,
  };

  const { error: companyError } = await supabase
    .from("companies")
    .upsert(companyPayload, { onConflict: "id" });

  if (companyError) {
    throw companyError;
  }

  const { error: userError } = await supabase
    .from("users")
    .upsert(userPayload, { onConflict: "id" });

  if (userError) {
    throw userError;
  }
}

async function appendSupabaseAudit(supabase, event) {
  const { error } = await supabase.from("audit_events").insert({
    id: createId("audit"),
    company_id: event.companyId,
    workspace_id: event.workspaceId || null,
    actor_id: event.actorId || "system",
    action: event.action,
    detail: event.detail,
    created_at: nowIso(),
  });

  if (error) {
    throw error;
  }
}

function fromDbPartner(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    partnerType: row.partner_type,
    name: row.name,
    coverage: row.coverage,
    fitSummary: row.fit_summary,
    contactMethod: row.contact_method,
    status: row.status,
    disclosure: row.disclosure,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDbPartner(partner) {
  return {
    id: partner.id,
    company_id: partner.companyId,
    workspace_id: partner.workspaceId || null,
    partner_type: partner.partnerType,
    name: partner.name,
    coverage: partner.coverage,
    fit_summary: partner.fitSummary,
    contact_method: partner.contactMethod || null,
    status: partner.status || "candidate",
    disclosure: partner.disclosure,
    metadata: partner.metadata || {},
    updated_at: partner.updatedAt || nowIso(),
  };
}

function fromDbRequest(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    partnerType: row.partner_type,
    service: row.service,
    sku: row.sku,
    product: row.product,
    problem: row.problem,
    estimatedValue: row.estimated_value || 0,
    deadline: row.deadline,
    dataPreview: row.data_preview || [],
    contactEmail: row.contact_email,
    notes: row.notes || "",
    status: row.status,
    selectedPartnerId: row.selected_partner_id,
    matchedPartnerSnapshot: row.matched_partner_snapshot || null,
    disclosure: row.disclosure,
    metadata: row.metadata || {},
    matchedAt: row.matched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDbRequest(request) {
  return {
    id: request.id,
    company_id: request.companyId,
    workspace_id: request.workspaceId || null,
    partner_type: request.partnerType,
    service: request.service,
    sku: request.sku,
    product: request.product,
    problem: request.problem,
    estimated_value: Math.round(Number(request.estimatedValue) || 0),
    deadline: request.deadline || null,
    data_preview: request.dataPreview || [],
    contact_email: request.contactEmail,
    notes: request.notes || null,
    status: request.status || "Pending match",
    selected_partner_id: request.selectedPartnerId || null,
    matched_partner_snapshot: request.matchedPartnerSnapshot || null,
    disclosure: request.disclosure,
    metadata: request.metadata || {},
    matched_at: request.matchedAt || null,
    updated_at: request.updatedAt || nowIso(),
  };
}

async function ensureSupabasePartnerDirectory(supabase, auth, workspaceId) {
  const { data: existingRows, error: existingError } = await supabase
    .from("partner_directory")
    .select("*")
    .eq("company_id", auth.company.id)
    .order("partner_type", { ascending: true });

  if (existingError) {
    throw existingError;
  }

  if (existingRows?.length) {
    return existingRows.map(fromDbPartner);
  }

  const seededPartners = defaultPartnerDirectory.map((partner) =>
    partnerWithTenant(partner, auth, workspaceId),
  );
  const { data: insertedRows, error: insertError } = await supabase
    .from("partner_directory")
    .insert(seededPartners.map(toDbPartner))
    .select("*");

  if (insertError) {
    throw insertError;
  }

  await appendSupabaseAudit(supabase, {
    companyId: auth.company.id,
    workspaceId,
    actorId: auth.user?.id || "system",
    action: "partner_directory.seeded",
    detail: "Auretix seeded the first partner directory candidates.",
  });

  return (insertedRows || []).map(fromDbPartner);
}

function ensureLocalPartnerDirectory(store, auth, workspaceId) {
  const existingPartners = store.partners.filter(
    (partner) => partner.companyId === auth.company.id,
  );

  if (existingPartners.length) {
    return existingPartners;
  }

  const seededPartners = defaultPartnerDirectory.map((partner) =>
    partnerWithTenant(partner, auth, workspaceId),
  );
  store.partners.unshift(...seededPartners);
  return seededPartners;
}

export async function getPartnerNetworkBundle(workspaceId = "workspace_demo", context = {}) {
  const auth = normalizeContext(context);
  const targetWorkspaceId = workspaceId || getDefaultWorkspaceId(auth.company);
  const workspaceBundle = await getWorkspaceBundle(targetWorkspaceId, auth);
  const resolvedWorkspaceId = workspaceBundle.workspace.id;
  const supabase = await getSupabaseNetworkClient();

  if (supabase) {
    await ensureTenantRecordsInSupabase(supabase, auth);
    const partners = await ensureSupabasePartnerDirectory(supabase, auth, resolvedWorkspaceId);
    const { data: requestRows, error: requestError } = await supabase
      .from("partner_match_requests")
      .select("*")
      .eq("company_id", auth.company.id)
      .eq("workspace_id", resolvedWorkspaceId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (requestError) {
      throw requestError;
    }

    return {
      workspaceId: resolvedWorkspaceId,
      partners,
      requests: (requestRows || []).map(fromDbRequest),
      source: "supabase",
    };
  }

  const store = await readPartnerNetworkStore();
  const partners = ensureLocalPartnerDirectory(store, auth, resolvedWorkspaceId);
  const requests = store.requests
    .filter(
      (request) =>
        request.companyId === auth.company.id && request.workspaceId === resolvedWorkspaceId,
    )
    .slice(0, 100);

  await writePartnerNetworkStore(store);

  return {
    workspaceId: resolvedWorkspaceId,
    partners,
    requests,
    source: "json",
  };
}

export async function createPartnerMatchRequest(payload = {}, context = {}) {
  const auth = normalizeContext(context);
  const workspaceId = payload.workspaceId || getDefaultWorkspaceId(auth.company);
  const networkBundle = await getPartnerNetworkBundle(workspaceId, auth);
  const selectedPartner =
    networkBundle.partners.find((partner) => partner.id === payload.selectedPartnerId) || null;
  const request = {
    id: createId("partner_request"),
    companyId: auth.company.id,
    workspaceId: networkBundle.workspaceId,
    partnerType: payload.partnerType,
    service: payload.service,
    sku: payload.sku,
    product: payload.product,
    problem: payload.problem,
    estimatedValue: payload.estimatedValue,
    deadline: payload.deadline,
    dataPreview: Array.isArray(payload.dataPreview) ? payload.dataPreview : [],
    contactEmail: String(payload.contactEmail || "").trim(),
    notes: String(payload.notes || "").trim(),
    status: "Pending match",
    selectedPartnerId: selectedPartner?.id || null,
    matchedPartnerSnapshot: null,
    disclosure:
      "Seller approved sharing the listed risk summary and acknowledged Auretix may receive a referral or service fee.",
    metadata: {
      requestSource: "auretix-network",
      consent: payload.consent || {},
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (!request.partnerType || !request.service || !request.sku || !request.contactEmail) {
    throw new Error("Partner type, service, SKU, and seller contact email are required.");
  }

  const supabase = await getSupabaseNetworkClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("partner_match_requests")
      .insert(toDbRequest(request))
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await appendSupabaseAudit(supabase, {
      companyId: auth.company.id,
      workspaceId: networkBundle.workspaceId,
      actorId: auth.user?.id || "system",
      action: "partner_request.created",
      detail: `${request.service} request created for ${request.sku}.`,
    });

    return fromDbRequest(data);
  }

  const store = await readPartnerNetworkStore();
  ensureLocalPartnerDirectory(store, auth, networkBundle.workspaceId);
  store.requests.unshift(request);
  store.requests = store.requests.slice(0, 200);
  await writePartnerNetworkStore(store);

  return request;
}

export async function updatePartnerMatchRequest(payload = {}, context = {}) {
  const auth = normalizeContext(context);
  const requestId = payload.requestId;

  if (!requestId) {
    throw new Error("Request id is required.");
  }

  const workspaceId = payload.workspaceId || getDefaultWorkspaceId(auth.company);
  const networkBundle = await getPartnerNetworkBundle(workspaceId, auth);
  const nextStatus = payload.status || "Pending match";
  const selectedPartner =
    networkBundle.partners.find((partner) => partner.id === payload.partnerId) || null;
  const isMatchSent = nextStatus === "Matched partner sent";
  const matchedPartnerSnapshot =
    isMatchSent && selectedPartner
      ? {
          id: selectedPartner.id,
          name: selectedPartner.name,
          partnerType: selectedPartner.partnerType,
          coverage: selectedPartner.coverage,
          disclosure: selectedPartner.disclosure,
          sentAt: nowIso(),
        }
      : null;

  const supabase = await getSupabaseNetworkClient();
  if (supabase) {
    const updatePayload = {
      status: nextStatus,
      updated_at: nowIso(),
    };

    if (selectedPartner) {
      updatePayload.selected_partner_id = selectedPartner.id;
    }

    if (matchedPartnerSnapshot) {
      updatePayload.matched_partner_snapshot = matchedPartnerSnapshot;
      updatePayload.matched_at = matchedPartnerSnapshot.sentAt;
    }

    const { data, error } = await supabase
      .from("partner_match_requests")
      .update(updatePayload)
      .eq("id", requestId)
      .eq("company_id", auth.company.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    await appendSupabaseAudit(supabase, {
      companyId: auth.company.id,
      workspaceId: networkBundle.workspaceId,
      actorId: auth.user?.id || "system",
      action: isMatchSent ? "partner_request.match_sent" : "partner_request.status_updated",
      detail: isMatchSent
        ? `Matched partner ${selectedPartner?.name || "candidate"} sent for ${data.sku}.`
        : `Partner request ${data.sku} updated to ${nextStatus}.`,
    });

    return fromDbRequest(data);
  }

  const store = await readPartnerNetworkStore();
  const existingIndex = store.requests.findIndex(
    (request) => request.id === requestId && request.companyId === auth.company.id,
  );

  if (existingIndex < 0) {
    throw new Error("Partner request not found.");
  }

  const current = store.requests[existingIndex];
  const nextRequest = {
    ...current,
    status: nextStatus,
    selectedPartnerId: selectedPartner?.id || current.selectedPartnerId || null,
    matchedPartnerSnapshot: matchedPartnerSnapshot || current.matchedPartnerSnapshot || null,
    matchedAt: matchedPartnerSnapshot?.sentAt || current.matchedAt || null,
    updatedAt: nowIso(),
  };

  store.requests[existingIndex] = nextRequest;
  await writePartnerNetworkStore(store);

  return nextRequest;
}
