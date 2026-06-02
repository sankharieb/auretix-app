import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildMoatEngineSnapshot,
  modelVersion,
} from "./moat-engine.js";
import { getWorkspaceBundle } from "./workspace-store.js";

const dataDirectory = path.join(process.cwd(), "data");
const moatStoreFile = path.join(dataDirectory, "moat-engine-store.json");

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

function todayDate() {
  return new Date().toISOString().slice(0, 10);
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

function isSupabaseStoreConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

async function getSupabaseMoatClient() {
  if (!isSupabaseStoreConfigured()) {
    return null;
  }

  const { createSupabaseServerClient, createSupabaseServiceClient } = await import(
    "./supabase/server.js"
  );

  return createSupabaseServiceClient() || (await createSupabaseServerClient());
}

async function ensureMoatStore() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(moatStoreFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeFile(
        moatStoreFile,
        JSON.stringify(
          {
            version: 1,
            decisions: [],
            outcomes: [],
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

async function readMoatStore() {
  await ensureMoatStore();
  const raw = await readFile(moatStoreFile, "utf8");
  const store = JSON.parse(raw);

  return {
    version: 1,
    decisions: Array.isArray(store.decisions) ? store.decisions : [],
    outcomes: Array.isArray(store.outcomes) ? store.outcomes : [],
  };
}

async function writeMoatStore(store) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(moatStoreFile, JSON.stringify(store, null, 2), "utf8");
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

function fromDbDecision(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    riskScoreId: row.risk_score_id,
    sku: row.sku,
    issueType: row.issue_type,
    recommendationType: row.recommendation_type,
    recommendedAction: row.recommended_action,
    userAction: row.user_action,
    status: row.status,
    estimatedFinancialImpact: row.estimated_financial_impact,
    confidence: row.confidence,
    reasonSummary: row.reason_summary,
    accuracyStatus: row.accuracy_status,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromDbOutcome(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    recommendationId: row.recommendation_id,
    sku: row.sku,
    actualResult: row.actual_result,
    actualFinancialImpact: row.actual_financial_impact,
    accuracyStatus: row.accuracy_status,
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
  };
}

function buildDecisionPayload(payload, auth, workspaceId) {
  const riskIndex = payload.riskIndex || {};
  const profitImpact = payload.profitImpact || {};
  const id = createId("moat_decision");
  const userAction = payload.userAction || "watched";

  return {
    id,
    companyId: auth.company.id,
    workspaceId,
    riskScoreId: createId("risk_score"),
    sku: payload.sku,
    product: payload.product || payload.sku,
    issueType: payload.issueType || riskIndex.issueType || "watch",
    recommendationType: payload.recommendationType || payload.recommendedMove || "Watch",
    recommendedAction: payload.recommendedAction || riskIndex.recommendedAction || "Watch",
    userAction,
    status: userAction === "approved" ? "Approved" : userAction === "deferred" ? "Deferred" : "Watched",
    estimatedFinancialImpact:
      payload.estimatedFinancialImpact ||
      payload.financialImpact ||
      riskIndex.financialImpactEstimate ||
      profitImpact.expectedBenefit ||
      0,
    confidence: payload.confidence || riskIndex.confidence || 70,
    reasonSummary: payload.reasonSummary || riskIndex.reasonSummary || "",
    accuracyStatus: "pending",
    riskIndex,
    profitImpact,
    metadata: {
      modelVersion,
      source: "auretix-moat-engine",
      partnerSupport: payload.partnerSupport || riskIndex.partnerSupport || null,
      supplier: payload.supplier || riskIndex.supplier || null,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function dbRiskScore(decision) {
  return {
    id: decision.riskScoreId,
    company_id: decision.companyId,
    workspace_id: decision.workspaceId,
    sku: decision.sku,
    issue_type: decision.issueType,
    score: decision.riskIndex.score || 0,
    risk_level: decision.riskIndex.riskLevel || "Watch",
    reason_summary: decision.reasonSummary,
    recommended_action: decision.recommendedAction,
    financial_impact: decision.estimatedFinancialImpact,
    metrics: {
      scoreParts: decision.riskIndex.scoreParts || {},
      partnerSupport: decision.riskIndex.partnerSupport || null,
      supplier: decision.riskIndex.supplier || null,
    },
    model_version: modelVersion,
    created_at: decision.createdAt,
  };
}

function dbDecision(decision) {
  return {
    id: decision.id,
    company_id: decision.companyId,
    workspace_id: decision.workspaceId,
    risk_score_id: decision.riskScoreId,
    sku: decision.sku,
    issue_type: decision.issueType,
    recommendation_type: decision.recommendationType,
    recommended_action: decision.recommendedAction,
    user_action: decision.userAction,
    status: decision.status,
    estimated_financial_impact: Math.round(decision.estimatedFinancialImpact || 0),
    confidence: Math.round(decision.confidence || 0),
    reason_summary: decision.reasonSummary,
    accuracy_status: decision.accuracyStatus,
    metadata: decision.metadata,
    created_at: decision.createdAt,
    updated_at: decision.updatedAt,
  };
}

function dbProfitImpact(decision) {
  const impact = decision.profitImpact || {};

  return {
    id: createId("profit_impact"),
    company_id: decision.companyId,
    workspace_id: decision.workspaceId,
    recommendation_id: decision.id,
    sku: decision.sku,
    revenue_at_risk: Math.round(impact.revenueAtRisk || 0),
    margin_at_risk: Math.round(impact.marginAtRisk || 0),
    cash_tied_up: Math.round(impact.cashTiedUp || 0),
    potential_stockout_loss: Math.round(impact.potentialStockoutLoss || 0),
    overstock_exposure: Math.round(impact.overstockExposure || 0),
    cost_of_delay: Math.round(impact.costOfDelay || 0),
    expected_benefit: Math.round(impact.expectedBenefit || 0),
    assumptions: impact.assumptions || {},
    created_at: decision.createdAt,
  };
}

function dbDailyQueue(decision) {
  return {
    id: createId("daily_queue"),
    company_id: decision.companyId,
    workspace_id: decision.workspaceId,
    recommendation_id: decision.id,
    sku: decision.sku,
    priority_score: decision.riskIndex.score || 0,
    problem: decision.product,
    why_it_matters: decision.reasonSummary,
    financial_impact: Math.round(decision.estimatedFinancialImpact || 0),
    recommended_action: decision.recommendedAction,
    confidence: Math.round(decision.confidence || 0),
    status: decision.status,
    queue_date: todayDate(),
    created_at: decision.createdAt,
    updated_at: decision.updatedAt,
  };
}

async function getSupabaseDecisionHistory(supabase, auth, workspaceId) {
  const { data: decisions, error: decisionsError } = await supabase
    .from("decision_recommendations")
    .select("*")
    .eq("company_id", auth.company.id)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (decisionsError) {
    throw decisionsError;
  }

  const { data: outcomes, error: outcomesError } = await supabase
    .from("decision_outcomes")
    .select("*")
    .eq("company_id", auth.company.id)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (outcomesError) {
    throw outcomesError;
  }

  return {
    decisions: (decisions || []).map(fromDbDecision),
    outcomes: (outcomes || []).map(fromDbOutcome),
  };
}

async function getLocalDecisionHistory(auth, workspaceId) {
  const store = await readMoatStore();

  return {
    decisions: store.decisions
      .filter((decision) => decision.companyId === auth.company.id && decision.workspaceId === workspaceId)
      .slice(0, 100),
    outcomes: store.outcomes
      .filter((outcome) => outcome.companyId === auth.company.id && outcome.workspaceId === workspaceId)
      .slice(0, 100),
  };
}

export async function getMoatEngineBundle(workspaceId = "workspace_demo", context = {}) {
  let auth = normalizeContext(context);
  const targetWorkspaceId = workspaceId || getDefaultWorkspaceId(auth.company);
  const workspaceBundle = await getWorkspaceBundle(targetWorkspaceId, auth);
  const resolvedWorkspaceId = workspaceBundle.workspace.id;
  const supabase = await getSupabaseMoatClient();

  if (supabase) {
    try {
      auth = await ensureTenantRecordsInSupabase(supabase, auth);
      const history = await getSupabaseDecisionHistory(supabase, auth, resolvedWorkspaceId);
      const snapshot = buildMoatEngineSnapshot({
        decisionHistory: history.decisions,
      });

      return {
        ...snapshot,
        workspaceId: resolvedWorkspaceId,
        source: "supabase",
        migrationRequired: false,
        decisionHistory: history.decisions,
        decisionOutcomes: history.outcomes,
      };
    } catch (error) {
      const history = await getLocalDecisionHistory(auth, resolvedWorkspaceId);
      const snapshot = buildMoatEngineSnapshot({
        decisionHistory: history.decisions,
      });

      return {
        ...snapshot,
        workspaceId: resolvedWorkspaceId,
        source: "json-fallback",
        migrationRequired: true,
        migrationMessage: error.message,
        decisionHistory: history.decisions,
        decisionOutcomes: history.outcomes,
      };
    }
  }

  const history = await getLocalDecisionHistory(auth, resolvedWorkspaceId);
  const snapshot = buildMoatEngineSnapshot({
    decisionHistory: history.decisions,
  });

  return {
    ...snapshot,
    workspaceId: resolvedWorkspaceId,
    source: "json",
    migrationRequired: false,
    decisionHistory: history.decisions,
    decisionOutcomes: history.outcomes,
  };
}

async function createLocalDecision(decision) {
  const store = await readMoatStore();
  store.decisions.unshift(decision);
  store.decisions = store.decisions.slice(0, 200);
  await writeMoatStore(store);
  return decision;
}

export async function createMoatDecisionAction(payload = {}, context = {}) {
  let auth = normalizeContext(context);
  const targetWorkspaceId = payload.workspaceId || getDefaultWorkspaceId(auth.company);
  const workspaceBundle = await getWorkspaceBundle(targetWorkspaceId, auth);
  const workspaceId = workspaceBundle.workspace.id;
  const supabase = await getSupabaseMoatClient();

  if (supabase) {
    try {
      auth = await ensureTenantRecordsInSupabase(supabase, auth);
      const decision = buildDecisionPayload(payload, auth, workspaceId);

      const { error: scoreError } = await supabase.from("risk_scores").insert(dbRiskScore(decision));
      if (scoreError) {
        throw scoreError;
      }

      const { data, error: decisionError } = await supabase
        .from("decision_recommendations")
        .insert(dbDecision(decision))
        .select("*")
        .single();

      if (decisionError) {
        throw decisionError;
      }

      const { error: impactError } = await supabase
        .from("profit_impact_records")
        .insert(dbProfitImpact(decision));
      if (impactError) {
        throw impactError;
      }

      const { error: queueError } = await supabase
        .from("daily_decision_queue")
        .insert(dbDailyQueue(decision));
      if (queueError) {
        throw queueError;
      }

      await appendSupabaseAudit(supabase, {
        companyId: auth.company.id,
        workspaceId,
        actorId: auth.user?.id || "system",
        action: `recommendation.${decision.userAction}`,
        detail: `${decision.userAction} recorded for ${decision.sku}: ${decision.recommendedAction}.`,
      });

      return {
        ...fromDbDecision(data),
        riskIndex: decision.riskIndex,
        profitImpact: decision.profitImpact,
      };
    } catch {
      const decision = buildDecisionPayload(payload, auth, workspaceId);

      return createLocalDecision({
        ...decision,
        source: "json-fallback",
      });
    }
  }

  const decision = buildDecisionPayload(payload, auth, workspaceId);

  return createLocalDecision({
    ...decision,
    source: "json",
  });
}

export async function recordMoatDecisionOutcome(payload = {}, context = {}) {
  let auth = normalizeContext(context);
  const targetWorkspaceId = payload.workspaceId || getDefaultWorkspaceId(auth.company);
  const workspaceBundle = await getWorkspaceBundle(targetWorkspaceId, auth);
  const workspaceId = workspaceBundle.workspace.id;
  const outcome = {
    id: createId("decision_outcome"),
    companyId: auth.company.id,
    workspaceId,
    recommendationId: payload.recommendationId,
    sku: payload.sku,
    actualResult: payload.actualResult || `${payload.accuracyStatus || "pending"} outcome recorded.`,
    actualFinancialImpact: Math.round(payload.actualFinancialImpact || 0),
    accuracyStatus: payload.accuracyStatus || "pending",
    recordedAt: nowIso(),
    createdAt: nowIso(),
  };
  const supabase = await getSupabaseMoatClient();

  if (supabase) {
    try {
      auth = await ensureTenantRecordsInSupabase(supabase, auth);

      const dbOutcome = {
        ...outcome,
        companyId: auth.company.id,
      };

      const { data, error } = await supabase
        .from("decision_outcomes")
        .insert({
          id: dbOutcome.id,
          company_id: dbOutcome.companyId,
          workspace_id: dbOutcome.workspaceId,
          recommendation_id: dbOutcome.recommendationId,
          sku: dbOutcome.sku,
          actual_result: dbOutcome.actualResult,
          actual_financial_impact: dbOutcome.actualFinancialImpact,
          accuracy_status: dbOutcome.accuracyStatus,
          recorded_at: dbOutcome.recordedAt,
          created_at: dbOutcome.createdAt,
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      await supabase
        .from("decision_recommendations")
        .update({
          accuracy_status: dbOutcome.accuracyStatus,
          updated_at: nowIso(),
        })
        .eq("id", dbOutcome.recommendationId)
        .eq("company_id", auth.company.id);

      await appendSupabaseAudit(supabase, {
        companyId: auth.company.id,
        workspaceId,
        actorId: auth.user?.id || "system",
        action: "decision_outcome.recorded",
        detail: `${dbOutcome.accuracyStatus} outcome recorded for ${dbOutcome.sku}.`,
      });

      return fromDbOutcome(data);
    } catch {
      // Fall through to JSON persistence.
    }
  }

  const store = await readMoatStore();
  store.outcomes.unshift(outcome);
  store.outcomes = store.outcomes.slice(0, 200);
  store.decisions = store.decisions.map((decision) =>
    decision.id === outcome.recommendationId
      ? {
          ...decision,
          accuracyStatus: outcome.accuracyStatus,
          updatedAt: nowIso(),
        }
      : decision,
  );
  await writeMoatStore(store);

  return outcome;
}