import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getWorkspaceBundle } from "./workspace-store.js";

const dataDirectory = path.join(process.cwd(), "data");
const guidanceStoreFile = path.join(dataDirectory, "moat-guidance-store.json");
const validRuleTypes = new Set(["recommendation_type", "supplier", "issue_type", "sku"]);
const validStatuses = new Set(["pending", "approved", "rejected"]);

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

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedAdjustment(value) {
  return Math.max(-25, Math.min(25, Math.round(safeNumber(value))));
}

function normalizeRuleType(value) {
  const normalized = String(value || "").trim().toLowerCase().replaceAll("-", "_");

  return validRuleTypes.has(normalized) ? normalized : "recommendation_type";
}

function normalizeTarget(value) {
  return String(value || "Unknown target").trim();
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

async function getSupabaseGuidanceClient() {
  if (!isSupabaseStoreConfigured()) {
    return null;
  }

  const { createSupabaseServerClient, createSupabaseServiceClient } = await import(
    "./supabase/server.js"
  );

  return createSupabaseServiceClient() || (await createSupabaseServerClient());
}

async function ensureGuidanceStore() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(guidanceStoreFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeFile(
        guidanceStoreFile,
        JSON.stringify(
          {
            version: 1,
            rules: [],
            auditEvents: [],
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

async function readGuidanceStore() {
  await ensureGuidanceStore();
  const raw = await readFile(guidanceStoreFile, "utf8");
  const store = JSON.parse(raw);

  return {
    version: 1,
    rules: Array.isArray(store.rules) ? store.rules : [],
    auditEvents: Array.isArray(store.auditEvents) ? store.auditEvents : [],
  };
}

async function writeGuidanceStore(store) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(guidanceStoreFile, JSON.stringify(store, null, 2), "utf8");
}

function appendLocalAudit(store, event) {
  store.auditEvents.unshift({
    id: createId("audit"),
    actorId: "system",
    createdAt: nowIso(),
    ...event,
  });
  store.auditEvents = store.auditEvents.slice(0, 200);
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

  const { error: companyError } = await supabase
    .from("companies")
    .upsert(
      {
        id: resolvedCompanyId,
        name: auth.company.name,
        slug: auth.company.slug,
      },
      { onConflict: "id" },
    );

  if (companyError) {
    throw companyError;
  }

  const { error: userError } = await supabase
    .from("users")
    .upsert(
      {
        id: auth.user.id,
        auth_user_id: auth.user.authUserId,
        company_id: resolvedCompanyId,
        name: auth.user.name,
        email: auth.user.email,
        role: auth.role,
      },
      { onConflict: "id" },
    );

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

function fromDbGuidanceRule(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    ruleType: row.rule_type,
    targetValue: row.target_value,
    suggestedAdjustment: row.suggested_adjustment,
    approvedAdjustment: row.approved_adjustment,
    status: row.status,
    reason: row.reason,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    rejectedBy: row.rejected_by,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
  };
}

function toDbGuidanceRule(rule) {
  return {
    id: rule.id,
    company_id: rule.companyId,
    workspace_id: rule.workspaceId,
    rule_type: rule.ruleType,
    target_value: rule.targetValue,
    suggested_adjustment: rule.suggestedAdjustment,
    approved_adjustment: rule.approvedAdjustment ?? null,
    status: rule.status,
    reason: rule.reason || "",
    created_by: rule.createdBy || null,
    approved_by: rule.approvedBy || null,
    rejected_by: rule.rejectedBy || null,
    created_at: rule.createdAt,
    approved_at: rule.approvedAt || null,
    rejected_at: rule.rejectedAt || null,
  };
}

function isMissingGuidanceTable(error) {
  return /model_guidance_rules|relation .* does not exist|schema cache/i.test(error?.message || "");
}

async function getResolvedWorkspace(workspaceId, auth) {
  const targetWorkspaceId = workspaceId || getDefaultWorkspaceId(auth.company);
  const workspaceBundle = await getWorkspaceBundle(targetWorkspaceId, auth);

  return workspaceBundle.workspace.id;
}

async function getSupabaseRuleRows(workspaceId, context = {}, options = {}) {
  const supabase = options.supabase || (await getSupabaseGuidanceClient());

  if (!supabase) {
    return null;
  }

  const auth = options.skipTenantEnsure
    ? normalizeContext(context)
    : await ensureTenantRecordsInSupabase(supabase, context);

  try {
    const { data, error } = await supabase
      .from("model_guidance_rules")
      .select("*")
      .eq("company_id", auth.company.id)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return {
      auth,
      supabase,
      rules: (data || []).map(fromDbGuidanceRule),
    };
  } catch (error) {
    if (isMissingGuidanceTable(error)) {
      return {
        auth,
        supabase,
        rules: [],
        migrationRequired: true,
      };
    }

    throw error;
  }
}

function activeRuleMatch(rule, candidate) {
  return (
    rule.status === "approved" &&
    rule.ruleType === candidate.ruleType &&
    rule.targetValue.toLowerCase() === candidate.targetValue.toLowerCase()
  );
}

function createRulePayload(payload = {}, auth, workspaceId) {
  return {
    id: createId("guidance_rule"),
    companyId: auth.company.id,
    workspaceId,
    ruleType: normalizeRuleType(payload.ruleType),
    targetValue: normalizeTarget(payload.targetValue),
    suggestedAdjustment: boundedAdjustment(payload.suggestedAdjustment),
    approvedAdjustment: null,
    status: "pending",
    reason: payload.reason || "Auretix generated a model guidance proposal from outcome history.",
    createdBy: auth.user?.id || "system",
    approvedBy: null,
    rejectedBy: null,
    createdAt: nowIso(),
    approvedAt: null,
    rejectedAt: null,
  };
}

function buildHumanGovernanceSummary(rules = []) {
  const safeRules = Array.isArray(rules) ? rules : [];
  const pendingRules = safeRules.filter((rule) => rule.status === "pending");
  const activeRules = safeRules.filter((rule) => rule.status === "approved");
  const rejectedRules = safeRules.filter((rule) => rule.status === "rejected");
  const approvedAdjustments = activeRules.map((rule) => safeNumber(rule.approvedAdjustment));
  const totalApprovedAdjustments = approvedAdjustments.reduce((sum, value) => sum + value, 0);

  return {
    pendingRules: pendingRules.length,
    activeRules: activeRules.length,
    rejectedRules: rejectedRules.length,
    totalApprovedAdjustments,
    averageApprovedAdjustment: approvedAdjustments.length
      ? Math.round(totalApprovedAdjustments / approvedAdjustments.length)
      : 0,
    guidanceRulesInfluencingConfidence: activeRules.filter(
      (rule) => safeNumber(rule.approvedAdjustment) !== 0,
    ).length,
  };
}

export function summarizeModelGuidance(rules = []) {
  return {
    rules: Array.isArray(rules) ? rules : [],
    humanGovernance: buildHumanGovernanceSummary(rules),
  };
}

export async function loadModelGuidanceRules(workspaceId = "workspace_demo", context = {}, options = {}) {
  const auth = normalizeContext(context);
  const resolvedWorkspaceId = workspaceId || getDefaultWorkspaceId(auth.company);

  try {
    const supabaseRows = await getSupabaseRuleRows(resolvedWorkspaceId, auth, options);

    if (supabaseRows) {
      return {
        rules: supabaseRows.rules,
        humanGovernance: buildHumanGovernanceSummary(supabaseRows.rules),
        migrationRequired: Boolean(supabaseRows.migrationRequired),
      };
    }
  } catch {
    // Fall back to local guidance state.
  }

  const store = await readGuidanceStore();
  const rules = store.rules.filter(
    (rule) => rule.companyId === auth.company.id && rule.workspaceId === resolvedWorkspaceId,
  );

  return {
    rules,
    humanGovernance: buildHumanGovernanceSummary(rules),
    migrationRequired: false,
  };
}

export async function proposeModelGuidanceRule(payload = {}, context = {}) {
  let auth = normalizeContext(context);
  const workspaceId = await getResolvedWorkspace(payload.workspaceId, auth);
  const supabase = await getSupabaseGuidanceClient();

  if (supabase) {
    try {
      auth = await ensureTenantRecordsInSupabase(supabase, auth);
      const rule = createRulePayload(payload, auth, workspaceId);

      const { data, error } = await supabase
        .from("model_guidance_rules")
        .insert(toDbGuidanceRule(rule))
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      await appendSupabaseAudit(supabase, {
        companyId: auth.company.id,
        workspaceId,
        actorId: auth.user?.id || "system",
        action: "guidance_rule.created",
        detail: `${rule.ruleType} guidance proposed for ${rule.targetValue}: ${rule.suggestedAdjustment}.`,
      });

      return {
        rule: fromDbGuidanceRule(data),
        source: "supabase",
      };
    } catch {
      // Fall through to local persistence.
    }
  }

  const store = await readGuidanceStore();
  const rule = createRulePayload(payload, auth, workspaceId);
  store.rules.unshift(rule);
  store.rules = store.rules.slice(0, 300);
  appendLocalAudit(store, {
    companyId: auth.company.id,
    workspaceId,
    actorId: auth.user?.id || "system",
    action: "guidance_rule.created",
    detail: `${rule.ruleType} guidance proposed for ${rule.targetValue}: ${rule.suggestedAdjustment}.`,
  });
  await writeGuidanceStore(store);

  return {
    rule,
    source: "json",
  };
}

export async function approveModelGuidanceRule(payload = {}, context = {}) {
  let auth = normalizeContext(context);
  const workspaceId = await getResolvedWorkspace(payload.workspaceId, auth);
  const supabase = await getSupabaseGuidanceClient();
  const now = nowIso();

  if (supabase) {
    try {
      auth = await ensureTenantRecordsInSupabase(supabase, auth);
      const { data: ruleRow, error: ruleError } = await supabase
        .from("model_guidance_rules")
        .select("*")
        .eq("company_id", auth.company.id)
        .eq("workspace_id", workspaceId)
        .eq("id", payload.ruleId)
        .maybeSingle();

      if (ruleError) {
        throw ruleError;
      }

      const existingRule = fromDbGuidanceRule(ruleRow);

      if (!existingRule) {
        throw new Error("Guidance rule not found.");
      }

      const { data: duplicateRows, error: duplicateError } = await supabase
        .from("model_guidance_rules")
        .select("*")
        .eq("company_id", auth.company.id)
        .eq("workspace_id", workspaceId)
        .eq("rule_type", existingRule.ruleType)
        .ilike("target_value", existingRule.targetValue)
        .eq("status", "approved");

      if (duplicateError) {
        throw duplicateError;
      }

      const duplicate = (duplicateRows || [])
        .map(fromDbGuidanceRule)
        .find((rule) => rule.id !== existingRule.id);

      if (duplicate) {
        return {
          rule: duplicate,
          source: "supabase",
          duplicateBlocked: true,
          message: "An active guidance rule already exists for this target.",
        };
      }

      const approvedAdjustment = boundedAdjustment(
        payload.approvedAdjustment ?? existingRule.suggestedAdjustment,
      );
      const { data, error } = await supabase
        .from("model_guidance_rules")
        .update({
          approved_adjustment: approvedAdjustment,
          status: "approved",
          approved_by: auth.user?.id || "system",
          approved_at: now,
          rejected_by: null,
          rejected_at: null,
        })
        .eq("id", existingRule.id)
        .eq("company_id", auth.company.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      await appendSupabaseAudit(supabase, {
        companyId: auth.company.id,
        workspaceId,
        actorId: auth.user?.id || "system",
        action: "guidance_rule.approved",
        detail: `${existingRule.ruleType} guidance approved for ${existingRule.targetValue}: ${approvedAdjustment}.`,
      });

      return {
        rule: fromDbGuidanceRule(data),
        source: "supabase",
      };
    } catch {
      // Fall through to local persistence.
    }
  }

  const store = await readGuidanceStore();
  const existingRule = store.rules.find(
    (rule) => rule.id === payload.ruleId && rule.companyId === auth.company.id && rule.workspaceId === workspaceId,
  );

  if (!existingRule) {
    throw new Error("Guidance rule not found.");
  }

  const duplicate = store.rules.find(
    (rule) => rule.id !== existingRule.id && activeRuleMatch(rule, existingRule),
  );

  if (duplicate) {
    return {
      rule: duplicate,
      source: "json",
      duplicateBlocked: true,
      message: "An active guidance rule already exists for this target.",
    };
  }

  const approvedAdjustment = boundedAdjustment(payload.approvedAdjustment ?? existingRule.suggestedAdjustment);
  const nextRule = {
    ...existingRule,
    approvedAdjustment,
    status: "approved",
    approvedBy: auth.user?.id || "system",
    approvedAt: now,
    rejectedBy: null,
    rejectedAt: null,
  };

  store.rules = store.rules.map((rule) => (rule.id === existingRule.id ? nextRule : rule));
  appendLocalAudit(store, {
    companyId: auth.company.id,
    workspaceId,
    actorId: auth.user?.id || "system",
    action: "guidance_rule.approved",
    detail: `${nextRule.ruleType} guidance approved for ${nextRule.targetValue}: ${approvedAdjustment}.`,
  });
  await writeGuidanceStore(store);

  return {
    rule: nextRule,
    source: "json",
  };
}

export async function rejectModelGuidanceRule(payload = {}, context = {}) {
  let auth = normalizeContext(context);
  const workspaceId = await getResolvedWorkspace(payload.workspaceId, auth);
  const supabase = await getSupabaseGuidanceClient();
  const now = nowIso();

  if (supabase) {
    try {
      auth = await ensureTenantRecordsInSupabase(supabase, auth);

      const { data: ruleRow, error: ruleError } = await supabase
        .from("model_guidance_rules")
        .select("*")
        .eq("company_id", auth.company.id)
        .eq("workspace_id", workspaceId)
        .eq("id", payload.ruleId)
        .maybeSingle();

      if (ruleError) {
        throw ruleError;
      }

      const existingRule = fromDbGuidanceRule(ruleRow);

      if (!existingRule) {
        throw new Error("Guidance rule not found.");
      }

      const { data, error } = await supabase
        .from("model_guidance_rules")
        .update({
          status: "rejected",
          approved_adjustment: null,
          rejected_by: auth.user?.id || "system",
          rejected_at: now,
        })
        .eq("id", existingRule.id)
        .eq("company_id", auth.company.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      await appendSupabaseAudit(supabase, {
        companyId: auth.company.id,
        workspaceId,
        actorId: auth.user?.id || "system",
        action: "guidance_rule.rejected",
        detail: `${existingRule.ruleType} guidance rejected for ${existingRule.targetValue}: ${existingRule.suggestedAdjustment}.`,
      });

      return {
        rule: fromDbGuidanceRule(data),
        source: "supabase",
      };
    } catch {
      // Fall through to local persistence.
    }
  }

  const store = await readGuidanceStore();
  const existingRule = store.rules.find(
    (rule) => rule.id === payload.ruleId && rule.companyId === auth.company.id && rule.workspaceId === workspaceId,
  );

  if (!existingRule) {
    throw new Error("Guidance rule not found.");
  }

  const nextRule = {
    ...existingRule,
    approvedAdjustment: null,
    status: "rejected",
    rejectedBy: auth.user?.id || "system",
    rejectedAt: now,
  };

  store.rules = store.rules.map((rule) => (rule.id === existingRule.id ? nextRule : rule));
  appendLocalAudit(store, {
    companyId: auth.company.id,
    workspaceId,
    actorId: auth.user?.id || "system",
    action: "guidance_rule.rejected",
    detail: `${nextRule.ruleType} guidance rejected for ${nextRule.targetValue}: ${nextRule.suggestedAdjustment}.`,
  });
  await writeGuidanceStore(store);

  return {
    rule: nextRule,
    source: "json",
  };
}
