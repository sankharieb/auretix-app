import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDecisionQueue } from "./decision-queue.js";
import { buildDecision, defaultScenario } from "./engine.js";
import { getSeededWorkspace } from "./seeded-workspace.js";

const dataDirectory = path.join(process.cwd(), "data");
const storeFile = path.join(dataDirectory, "auretix-store.json");

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

function ensureTenantRecords(store, context = {}) {
  const auth = normalizeContext(context);

  if (!store.companies.some((company) => company.id === auth.company.id)) {
    store.companies.unshift({
      ...auth.company,
      createdAt: nowIso(),
    });
  }

  if (auth.user && !store.users.some((user) => user.id === auth.user.id)) {
    store.users.unshift({
      ...auth.user,
      companyId: auth.company.id,
      role: auth.role,
      createdAt: nowIso(),
    });
  }
}

function getDefaultWorkspaceId(company) {
  if (!company || company.id === defaultCompany.id) {
    return "workspace_demo";
  }

  const slug = company.slug || company.id;
  return `workspace_${slug.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function buildSeedWorkspace(context = {}) {
  const auth = normalizeContext(context);
  const workspaceState = getSeededWorkspace(defaultScenario.businessType);

  return {
    id: getDefaultWorkspaceId(auth.company),
    companyId: auth.company.id,
    name: "Auretix demo workspace",
    businessType: defaultScenario.businessType,
    scenario: defaultScenario,
    workspaceState,
    draftPurchaseOrders: [],
    supplierPackets: [],
    supplierStrategyMemory: {},
    approvedReallocationPlans: {},
    metadata: {
      source: "seeded",
      note: "Default workspace created before a customer integration is connected.",
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function buildDecisionRun(workspace, trigger = "seed") {
  const decision = buildDecision(workspace.scenario);
  const queue = buildDecisionQueue(workspace.scenario, {
    workspaceOverride: workspace.workspaceState,
    supplierStrategyMemory: workspace.supplierStrategyMemory || {},
  });

  return {
    id: createId("run"),
    companyId: workspace.companyId,
    workspaceId: workspace.id,
    trigger,
    scenario: workspace.scenario,
    decision,
    queue,
    summary: {
      badgeText: decision.badgeText,
      badgeLevel: decision.badgeLevel,
      supportTier: decision.supportTier?.name || null,
      highestRiskSku: queue.overview.highestRiskSku,
      highestRiskScore: queue.overview.highestRiskScore,
      totalImmediateCash: queue.overview.totalImmediateCash,
      playbookSummary: queue.playbookSummary,
    },
    createdAt: nowIso(),
  };
}

function createSeedStore() {
  const workspace = buildSeedWorkspace();
  const decisionRun = buildDecisionRun(workspace);

  return {
    version: 1,
    companies: [
      {
        ...defaultCompany,
        createdAt: nowIso(),
      },
    ],
    users: [
      {
        ...defaultUser,
        createdAt: nowIso(),
      },
    ],
    workspaces: [workspace],
    decisionRuns: [decisionRun],
    auditEvents: [
      {
        id: createId("audit"),
        companyId: "company_demo",
        workspaceId: workspace.id,
        actorId: "system",
        action: "workspace.seeded",
        detail: "Auretix created the first demo workspace and decision run.",
        createdAt: nowIso(),
      },
    ],
  };
}

async function ensureStore() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(storeFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeFile(storeFile, JSON.stringify(createSeedStore(), null, 2), "utf8");
      return;
    }

    throw error;
  }
}

async function readStore() {
  await ensureStore();
  const raw = await readFile(storeFile, "utf8");
  const store = JSON.parse(raw);

  return {
    version: 1,
    companies: Array.isArray(store.companies) ? store.companies : [],
    users: Array.isArray(store.users) ? store.users : [],
    workspaces: Array.isArray(store.workspaces) ? store.workspaces : [],
    decisionRuns: Array.isArray(store.decisionRuns) ? store.decisionRuns : [],
    auditEvents: Array.isArray(store.auditEvents) ? store.auditEvents : [],
  };
}

async function writeStore(store) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(storeFile, JSON.stringify(store, null, 2), "utf8");
}

function appendAudit(store, event) {
  store.auditEvents.unshift({
    id: createId("audit"),
    actorId: "system",
    createdAt: nowIso(),
    ...event,
  });
  store.auditEvents = store.auditEvents.slice(0, 200);
}

function isSupabaseStoreConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

async function getSupabaseStoreClient() {
  if (!isSupabaseStoreConfigured()) {
    return null;
  }

  const { createSupabaseServerClient, createSupabaseServiceClient } = await import(
    "./supabase/server.js"
  );

  return createSupabaseServiceClient() || (await createSupabaseServerClient());
}

function fromDbWorkspace(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    businessType: row.business_type,
    scenario: row.scenario,
    workspaceState: row.workspace_state,
    draftPurchaseOrders: row.draft_purchase_orders || [],
    supplierPackets: row.supplier_packets || [],
    supplierStrategyMemory: row.supplier_strategy_memory || {},
    approvedReallocationPlans: row.approved_reallocation_plans || {},
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDbWorkspace(workspace) {
  return {
    id: workspace.id,
    company_id: workspace.companyId,
    name: workspace.name,
    business_type: workspace.businessType,
    scenario: workspace.scenario,
    workspace_state: workspace.workspaceState,
    draft_purchase_orders: workspace.draftPurchaseOrders || [],
    supplier_packets: workspace.supplierPackets || [],
    supplier_strategy_memory: workspace.supplierStrategyMemory || {},
    approved_reallocation_plans: workspace.approvedReallocationPlans || {},
    metadata: workspace.metadata || {},
    updated_at: workspace.updatedAt || nowIso(),
  };
}

function fromDbDecisionRun(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    trigger: row.trigger,
    scenario: row.scenario,
    decision: row.decision,
    queue: row.queue,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

function toDbDecisionRun(run) {
  return {
    id: run.id,
    company_id: run.companyId,
    workspace_id: run.workspaceId,
    trigger: run.trigger,
    scenario: run.scenario,
    decision: run.decision,
    queue: run.queue,
    summary: run.summary,
    created_at: run.createdAt,
  };
}

function fromDbAuditEvent(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

async function ensureTenantRecordsInSupabase(supabase, context = {}) {
  const auth = normalizeContext(context);

  const { data: existingCompany, error: existingCompanyError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", auth.company.slug)
    .maybeSingle();

  if (existingCompanyError) {
    throw existingCompanyError;
  }

  const resolvedCompanyId = existingCompany?.id || auth.company.id;

  const companyPayload = {
    id: resolvedCompanyId,
    name: auth.company.name,
    slug: auth.company.slug,
  };

  const userPayload = {
    id: auth.user.id,
    auth_user_id: auth.user.authUserId,
    company_id: resolvedCompanyId,
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

  return {
    ...auth,
    company: {
      ...auth.company,
      id: resolvedCompanyId,
    },
    user: {
      ...auth.user,
      companyId: resolvedCompanyId,
    },
  };
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

async function getSupabaseWorkspaceBundle(workspaceId, context = {}) {
  const supabase = await getSupabaseStoreClient();
  if (!supabase) {
    return null;
  }

  let auth = normalizeContext(context);
  auth = await ensureTenantRecordsInSupabase(supabase, auth);

  let { data: workspaceRow, error: workspaceError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("company_id", auth.company.id)
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError) {
    throw workspaceError;
  }

  if (!workspaceRow) {
    const { data: fallbackWorkspace, error: fallbackError } = await supabase
      .from("workspaces")
      .select("*")
      .eq("company_id", auth.company.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackError) {
      throw fallbackError;
    }

    workspaceRow = fallbackWorkspace;
  }

  if (!workspaceRow) {
    const seededWorkspace = buildSeedWorkspace(auth);
    const { data: insertedWorkspace, error: insertError } = await supabase
      .from("workspaces")
      .insert(toDbWorkspace(seededWorkspace))
      .select("*")
      .single();

    if (insertError) {
      throw insertError;
    }

    const seedRun = buildDecisionRun(seededWorkspace, "tenant_seed");
    const { error: runError } = await supabase
      .from("decision_runs")
      .insert(toDbDecisionRun(seedRun));

    if (runError) {
      throw runError;
    }

    await appendSupabaseAudit(supabase, {
      companyId: seededWorkspace.companyId,
      workspaceId: seededWorkspace.id,
      actorId: auth.user?.id || "system",
      action: "workspace.seeded",
      detail: "Auretix created a seeded workspace for this company.",
    });

    workspaceRow = insertedWorkspace;
  }

  const workspace = fromDbWorkspace(workspaceRow);
  const { data: decisionRunRows, error: decisionRunsError } = await supabase
    .from("decision_runs")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (decisionRunsError) {
    throw decisionRunsError;
  }

  const { data: auditRows, error: auditError } = await supabase
    .from("audit_events")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (auditError) {
    throw auditError;
  }

  return {
    company: auth.company,
    workspace,
    decisionRuns: (decisionRunRows || []).map(fromDbDecisionRun),
    auditEvents: (auditRows || []).map(fromDbAuditEvent),
  };
}

async function upsertSupabaseWorkspaceSnapshot(payload, context = {}) {
  const supabase = await getSupabaseStoreClient();
  if (!supabase) {
    return null;
  }

  let auth = normalizeContext(context);
  auth = await ensureTenantRecordsInSupabase(supabase, auth);

  const requestedWorkspace = payload.workspace || payload;
  const workspaceId = requestedWorkspace.id || getDefaultWorkspaceId(auth.company);
  const currentBundle = await getSupabaseWorkspaceBundle(workspaceId, auth);
  const current = currentBundle.workspace;
  const nextWorkspace = {
    ...current,
    ...requestedWorkspace,
    id: workspaceId,
    companyId: auth.company.id,
    businessType:
      requestedWorkspace.businessType ||
      requestedWorkspace.scenario?.businessType ||
      current.businessType,
    scenario: requestedWorkspace.scenario || current.scenario,
    workspaceState: requestedWorkspace.workspaceState || current.workspaceState,
    draftPurchaseOrders:
      requestedWorkspace.draftPurchaseOrders || current.draftPurchaseOrders || [],
    supplierPackets: requestedWorkspace.supplierPackets || current.supplierPackets || [],
    supplierStrategyMemory:
      requestedWorkspace.supplierStrategyMemory || current.supplierStrategyMemory || {},
    approvedReallocationPlans:
      requestedWorkspace.approvedReallocationPlans || current.approvedReallocationPlans || {},
    updatedAt: nowIso(),
  };

  const { data, error } = await supabase
    .from("workspaces")
    .upsert(toDbWorkspace(nextWorkspace), { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await appendSupabaseAudit(supabase, {
    companyId: nextWorkspace.companyId,
    workspaceId: nextWorkspace.id,
    actorId: auth.user?.id || "system",
    action: "workspace.saved",
    detail: payload.reason || "Workspace snapshot saved.",
  });

  return fromDbWorkspace(data);
}

async function createSupabaseDecisionRun(payload = {}, context = {}) {
  const supabase = await getSupabaseStoreClient();
  if (!supabase) {
    return null;
  }

  let auth = normalizeContext(context);
  auth = await ensureTenantRecordsInSupabase(supabase, auth);

  const workspaceId = payload.workspaceId || getDefaultWorkspaceId(auth.company);
  const currentBundle = await getSupabaseWorkspaceBundle(workspaceId, auth);
  const current = currentBundle.workspace;
  const nextWorkspace = {
    ...current,
    scenario: payload.scenario || current.scenario,
    workspaceState: payload.workspaceState || current.workspaceState,
    supplierStrategyMemory:
      payload.supplierStrategyMemory || current.supplierStrategyMemory || {},
    updatedAt: nowIso(),
  };
  const run = buildDecisionRun(nextWorkspace, payload.trigger || "manual");

  const { error: workspaceError } = await supabase
    .from("workspaces")
    .upsert(toDbWorkspace(nextWorkspace), { onConflict: "id" });

  if (workspaceError) {
    throw workspaceError;
  }

  const { data, error } = await supabase
    .from("decision_runs")
    .insert(toDbDecisionRun(run))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await appendSupabaseAudit(supabase, {
    companyId: nextWorkspace.companyId,
    workspaceId: nextWorkspace.id,
    actorId: auth.user?.id || "system",
    action: "decision_run.created",
    detail: `Decision run saved with highest risk ${run.summary.highestRiskSku}.`,
  });

  return fromDbDecisionRun(data);
}

export async function getWorkspaceBundle(workspaceId = "workspace_demo", context = {}) {
  const supabaseBundle = await getSupabaseWorkspaceBundle(workspaceId, context);
  if (supabaseBundle) {
    return supabaseBundle;
  }

  const store = await readStore();
  const auth = normalizeContext(context);
  ensureTenantRecords(store, auth);

  const workspace =
    store.workspaces.find(
      (entry) => entry.id === workspaceId && entry.companyId === auth.company.id,
    ) ||
    store.workspaces.find((entry) => entry.companyId === auth.company.id) ||
    buildSeedWorkspace(auth);

  if (!store.workspaces.some((entry) => entry.id === workspace.id)) {
    store.workspaces.unshift(workspace);
    const decisionRun = buildDecisionRun(workspace, "tenant_seed");
    store.decisionRuns.unshift(decisionRun);
    appendAudit(store, {
      companyId: workspace.companyId,
      workspaceId: workspace.id,
      actorId: auth.user?.id || "system",
      action: "workspace.seeded",
      detail: "Auretix created a seeded workspace for this company.",
    });
    await writeStore(store);
  }

  const decisionRuns = store.decisionRuns
    .filter((run) => run.workspaceId === workspace.id)
    .slice(0, 20);
  const auditEvents = store.auditEvents
    .filter((event) => event.workspaceId === workspace.id)
    .slice(0, 50);

  return {
    company: store.companies.find((company) => company.id === workspace.companyId) || null,
    workspace,
    decisionRuns,
    auditEvents,
  };
}

export async function upsertWorkspaceSnapshot(payload, context = {}) {
  const supabaseWorkspace = await upsertSupabaseWorkspaceSnapshot(payload, context);
  if (supabaseWorkspace) {
    return supabaseWorkspace;
  }

  const store = await readStore();
  const auth = normalizeContext(context);
  ensureTenantRecords(store, auth);
  const requestedWorkspace = payload.workspace || payload;
  const workspaceId = requestedWorkspace.id || getDefaultWorkspaceId(auth.company);
  const current =
    store.workspaces.find(
      (entry) => entry.id === workspaceId && entry.companyId === auth.company.id,
    ) || buildSeedWorkspace(auth);

  const nextWorkspace = {
    ...current,
    ...requestedWorkspace,
    id: workspaceId,
    companyId: auth.company.id,
    businessType:
      requestedWorkspace.businessType ||
      requestedWorkspace.scenario?.businessType ||
      current.businessType,
    scenario: requestedWorkspace.scenario || current.scenario,
    workspaceState: requestedWorkspace.workspaceState || current.workspaceState,
    draftPurchaseOrders:
      requestedWorkspace.draftPurchaseOrders || current.draftPurchaseOrders || [],
    supplierPackets: requestedWorkspace.supplierPackets || current.supplierPackets || [],
    supplierStrategyMemory:
      requestedWorkspace.supplierStrategyMemory || current.supplierStrategyMemory || {},
    approvedReallocationPlans:
      requestedWorkspace.approvedReallocationPlans || current.approvedReallocationPlans || {},
    updatedAt: nowIso(),
  };

  const existingIndex = store.workspaces.findIndex(
    (entry) => entry.id === workspaceId && entry.companyId === auth.company.id,
  );
  if (existingIndex >= 0) {
    store.workspaces[existingIndex] = nextWorkspace;
  } else {
    store.workspaces.unshift(nextWorkspace);
  }

  appendAudit(store, {
    companyId: nextWorkspace.companyId,
    workspaceId: nextWorkspace.id,
    actorId: auth.user?.id || "system",
    action: "workspace.saved",
    detail: payload.reason || "Workspace snapshot saved.",
  });

  await writeStore(store);
  return nextWorkspace;
}

export async function createDecisionRun(payload = {}, context = {}) {
  const supabaseRun = await createSupabaseDecisionRun(payload, context);
  if (supabaseRun) {
    return supabaseRun;
  }

  const store = await readStore();
  const auth = normalizeContext(context);
  ensureTenantRecords(store, auth);
  const workspaceId = payload.workspaceId || getDefaultWorkspaceId(auth.company);
  const current =
    store.workspaces.find(
      (entry) => entry.id === workspaceId && entry.companyId === auth.company.id,
    ) || buildSeedWorkspace(auth);

  const nextWorkspace = {
    ...current,
    scenario: payload.scenario || current.scenario,
    workspaceState: payload.workspaceState || current.workspaceState,
    supplierStrategyMemory:
      payload.supplierStrategyMemory || current.supplierStrategyMemory || {},
    updatedAt: nowIso(),
  };

  const run = buildDecisionRun(nextWorkspace, payload.trigger || "manual");
  const existingIndex = store.workspaces.findIndex(
    (entry) => entry.id === workspaceId && entry.companyId === auth.company.id,
  );
  if (existingIndex >= 0) {
    store.workspaces[existingIndex] = nextWorkspace;
  } else {
    store.workspaces.unshift(nextWorkspace);
  }

  store.decisionRuns.unshift(run);
  store.decisionRuns = store.decisionRuns.slice(0, 200);
  appendAudit(store, {
    companyId: nextWorkspace.companyId,
    workspaceId: nextWorkspace.id,
    actorId: auth.user?.id || "system",
    action: "decision_run.created",
    detail: `Decision run saved with highest risk ${run.summary.highestRiskSku}.`,
  });

  await writeStore(store);
  return run;
}

export async function upsertIntegrationAccount(providerId, account, context = {}, workspaceId = null) {
  const targetWorkspaceId = workspaceId || getDefaultWorkspaceId(normalizeContext(context).company);
  const bundle = await getWorkspaceBundle(targetWorkspaceId, context);
  const workspace = bundle.workspace;
  const metadata = workspace.metadata || {};
  const integrations = {
    ...(metadata.integrations || {}),
    [providerId]: {
      ...(metadata.integrations?.[providerId] || {}),
      ...account,
      providerId,
      updatedAt: new Date().toISOString(),
    },
  };

  return upsertWorkspaceSnapshot(
    {
      reason: `${account.providerName || providerId} integration account saved.`,
      workspace: {
        ...workspace,
        metadata: {
          ...metadata,
          integrations,
        },
      },
    },
    context,
  );
}