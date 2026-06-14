"use client";

import { useEffect, useMemo, useState } from "react";
import AppNavigation from "./app-navigation";
import { buildDailyExecutiveBriefing } from "../lib/auretix-advisor-briefing";
import { buildConfidenceFeedback } from "../lib/moat-confidence-engine";
import { buildMoatEngineSnapshot, buildOutcomeLearningSummary } from "../lib/moat-engine";
import { buildLearningAnalytics } from "../lib/moat-learning-analytics";
import { buildRecommendationPerformance } from "../lib/moat-recommendation-performance";
import { money, priorityClass } from "../lib/sku-risk-model";

function sourceLabel(source, migrationRequired) {
  if (migrationRequired) {
    return "Schema migration needed";
  }

  if (source === "supabase") {
    return "Supabase learning mode";
  }

  if (source === "json") {
    return "Server JSON learning mode";
  }

  return "Preview learning mode";
}

function actionLabel(action) {
  if (action === "approved") {
    return "Approved";
  }

  if (action === "deferred") {
    return "Deferred";
  }

  if (action === "request_partner_help") {
    return "Partner help";
  }

  return "Watched";
}

function formatTime(value) {
  if (!value) {
    return "Not yet";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function accuracyLabel(status) {
  if (status === "accurate") {
    return "Accurate";
  }

  if (status === "partially accurate") {
    return "Partially accurate";
  }

  if (status === "inaccurate") {
    return "Inaccurate";
  }

  return "Pending";
}

function percentLabel(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

function signedPercentLabel(value) {
  const rounded = Math.round(Number(value) || 0);

  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function plainLabel(value) {
  return value || "Unknown";
}

function confidenceSummaryLabel(item, fallback = "No signal yet") {
  if (!item) {
    return fallback;
  }

  return `${item.sku || item.product || "Recommendation"} | ${percentLabel(item.finalConfidence)}`;
}

function confidenceAdjustmentLabel(item, fallback = "No adjustment yet") {
  if (!item) {
    return fallback;
  }

  return `${item.sku || item.product || "Recommendation"} | ${signedPercentLabel(item.adjustment)}`;
}

function ruleTypeLabel(ruleType) {
  if (ruleType === "recommendation_type") {
    return "Recommendation type";
  }

  if (ruleType === "issue_type") {
    return "Issue type";
  }

  if (ruleType === "sku") {
    return "SKU";
  }

  return "Supplier";
}

function guidanceRuleKey(rule) {
  return `${rule.ruleType}:${String(rule.targetValue || "").trim().toLowerCase()}`;
}

function buildHumanGovernanceSummary(rules = []) {
  const safeRules = Array.isArray(rules) ? rules : [];
  const activeRules = safeRules.filter((rule) => rule.status === "approved");
  const approvedAdjustments = activeRules.map((rule) => Number(rule.approvedAdjustment || 0));
  const totalApprovedAdjustments = approvedAdjustments.reduce((sum, value) => sum + value, 0);

  return {
    pendingRules: safeRules.filter((rule) => rule.status === "pending").length,
    activeRules: activeRules.length,
    rejectedRules: safeRules.filter((rule) => rule.status === "rejected").length,
    totalApprovedAdjustments,
    averageApprovedAdjustment: approvedAdjustments.length
      ? Math.round(totalApprovedAdjustments / approvedAdjustments.length)
      : 0,
    guidanceRulesInfluencingConfidence: activeRules.filter(
      (rule) => Number(rule.approvedAdjustment || 0) !== 0,
    ).length,
  };
}

function localGuidanceRuleFrom(candidate, workspaceId) {
  return {
    id: `local_guidance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    ruleType: candidate.ruleType,
    targetValue: candidate.targetValue,
    suggestedAdjustment: candidate.suggestedAdjustment,
    approvedAdjustment: null,
    status: "pending",
    reason: candidate.reason,
    createdBy: "preview",
    approvedBy: null,
    rejectedBy: null,
    createdAt: new Date().toISOString(),
    approvedAt: null,
    rejectedAt: null,
  };
}

function accuracySentence(item) {
  if (!item?.outcomesRecorded) {
    return "No outcome-backed results yet.";
  }

  return `${item.label} has ${item.accuracyRate}% accuracy across ${item.outcomesRecorded} recorded outcome${
    item.outcomesRecorded === 1 ? "" : "s"
  }.`;
}

function defaultOutcomeFormFor(decision) {
  return {
    actualResult: decision
      ? `${decision.sku} outcome: record what actually happened after this recommendation was approved.`
      : "",
    actualFinancialImpact: decision?.estimatedFinancialImpact
      ? String(Math.round(decision.estimatedFinancialImpact))
      : "",
    accuracyStatus: "accurate",
  };
}

function localDecisionFrom(recommendation, userAction, workspaceId) {
  return {
    id: `local_${recommendation.id}_${Date.now()}`,
    workspaceId,
    sku: recommendation.sku,
    issueType: recommendation.issueType,
    recommendationType: recommendation.recommendationType,
    recommendedAction: recommendation.recommendedAction,
    userAction,
    status: actionLabel(userAction),
    estimatedFinancialImpact: recommendation.financialImpact,
    confidence: recommendation.confidence,
    reasonSummary: recommendation.whyItMatters,
    accuracyStatus: "pending",
    createdAt: new Date().toISOString(),
  };
}

export default function MoatCommandCenter() {
  const localSnapshot = useMemo(() => buildMoatEngineSnapshot(), []);
  const [snapshot, setSnapshot] = useState(localSnapshot);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(
    localSnapshot.recommendations[0]?.id || null,
  );
  const [decisionHistory, setDecisionHistory] = useState(localSnapshot.decisionHistory || []);
  const [decisionOutcomes, setDecisionOutcomes] = useState([]);
  const [modelGuidanceRules, setModelGuidanceRules] = useState(localSnapshot.modelGuidanceRules || []);
  const [serverLearningAnalytics, setServerLearningAnalytics] = useState(
    buildLearningAnalytics({
      decisionRecommendations: localSnapshot.decisionHistory || [],
      decisionOutcomes: localSnapshot.decisionOutcomes || [],
    }),
  );
  const [serverRecommendationPerformance, setServerRecommendationPerformance] = useState(
    buildRecommendationPerformance({
      decisionRecommendations: localSnapshot.decisionHistory || [],
      decisionOutcomes: localSnapshot.decisionOutcomes || [],
    }),
  );
  const [workspaceId, setWorkspaceId] = useState("workspace_demo");
  const [source, setSource] = useState("preview");
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedOutcomeDecisionId, setSelectedOutcomeDecisionId] = useState(null);
  const [outcomeForm, setOutcomeForm] = useState(defaultOutcomeFormFor(null));

  const executiveSummary = snapshot.executiveSummary;
  const approvedDecisions = useMemo(
    () => decisionHistory.filter((decision) => decision.userAction === "approved"),
    [decisionHistory],
  );
  const selectedOutcomeDecision =
    approvedDecisions.find((decision) => decision.id === selectedOutcomeDecisionId) ||
    approvedDecisions[0] ||
    null;
  const latestOutcomeByRecommendation = useMemo(() => {
    const latest = new Map();

    for (const outcome of [...decisionOutcomes].sort(
      (left, right) =>
        new Date(right.recordedAt || right.createdAt || 0).getTime() -
        new Date(left.recordedAt || left.createdAt || 0).getTime(),
    )) {
      if (!latest.has(outcome.recommendationId)) {
        latest.set(outcome.recommendationId, outcome);
      }
    }

    return latest;
  }, [decisionOutcomes]);
  const outcomeSummary = useMemo(
    () => buildOutcomeLearningSummary(decisionHistory, decisionOutcomes),
    [decisionHistory, decisionOutcomes],
  );
  const learningAnalytics = useMemo(() => {
    const liveAnalytics = buildLearningAnalytics({
      decisionRecommendations: decisionHistory,
      decisionOutcomes,
    });

    return {
      ...serverLearningAnalytics,
      ...liveAnalytics,
      auditEventCount: serverLearningAnalytics.auditEventCount || liveAnalytics.auditEventCount,
    };
  }, [decisionHistory, decisionOutcomes, serverLearningAnalytics]);
  const recommendationPerformance = useMemo(() => {
    const livePerformance = buildRecommendationPerformance({
      decisionRecommendations: decisionHistory,
      decisionOutcomes,
    });

    return {
      ...serverRecommendationPerformance,
      ...livePerformance,
      auditEventCount: serverRecommendationPerformance.auditEventCount || livePerformance.auditEventCount,
    };
  }, [decisionHistory, decisionOutcomes, serverRecommendationPerformance]);
  const confidenceBundle = useMemo(
    () =>
      buildConfidenceFeedback({
        recommendations: snapshot.recommendations || [],
        decisionRecommendations: decisionHistory,
        decisionOutcomes,
        recommendationPerformance,
        modelGuidanceRules,
      }),
    [snapshot.recommendations, decisionHistory, decisionOutcomes, recommendationPerformance, modelGuidanceRules],
  );
  const confidenceFeedback = confidenceBundle.confidenceFeedback;
  const humanGovernance = buildHumanGovernanceSummary(modelGuidanceRules);
  const activeRecommendations = confidenceBundle.recommendations.length
    ? confidenceBundle.recommendations
    : snapshot.recommendations;
  const dailyBriefing = useMemo(
    () =>
      buildDailyExecutiveBriefing({
        recommendations: activeRecommendations,
        rows: snapshot.rows || [],
        ownerName: snapshot.auth?.user?.name || snapshot.auth?.user?.email,
      }),
    [activeRecommendations, snapshot.auth?.user?.email, snapshot.auth?.user?.name, snapshot.rows],
  );
  const selectedRecommendation =
    activeRecommendations.find((item) => item.id === selectedRecommendationId) ||
    activeRecommendations[0];
  const selectedConfidence = selectedRecommendation?.confidenceAnalysis || {
    baseConfidence: selectedRecommendation?.confidence || 0,
    recommendationAdjustment: 0,
    supplierAdjustment: 0,
    issueAdjustment: 0,
    skuAdjustment: 0,
    varianceAdjustment: 0,
    finalConfidence: selectedRecommendation?.confidence || 0,
    confidenceReasoning: [],
  };
  const criticalQueue = activeRecommendations.slice(0, 5);
  const bestRecommendationTypes = recommendationPerformance.recommendationTypeRankings
    .filter((item) => item.outcomesRecorded > 0)
    .slice(0, 5);
  const weakestRecommendationTypes = [...recommendationPerformance.recommendationTypeRankings]
    .filter((item) => item.outcomesRecorded > 0)
    .sort((left, right) => {
      if (left.accuracyRate !== right.accuracyRate) {
        return left.accuracyRate - right.accuracyRate;
      }

      return Math.abs(right.variance) - Math.abs(left.variance);
    })
    .slice(0, 5);
  const supplierOutcomeRankings = recommendationPerformance.supplierRankings.slice(0, 5);
  const issueTypeRankings = recommendationPerformance.issueTypeRankings.slice(0, 5);
  const skuOutcomeRankings = recommendationPerformance.skuRankings.slice(0, 5);
  const confidenceAdjustmentSummary =
    recommendationPerformance.confidenceAdjustmentSummary.slice(0, 6);
  const existingGuidanceKeys = new Set(
    modelGuidanceRules
      .filter((rule) => rule.status === "pending" || rule.status === "approved")
      .map(guidanceRuleKey),
  );
  const guidanceCandidates = (confidenceFeedback.guidanceCandidates || [])
    .filter((candidate) => !existingGuidanceKeys.has(guidanceRuleKey(candidate)))
    .slice(0, 6);
  const pendingGuidanceRules = modelGuidanceRules.filter((rule) => rule.status === "pending");
  const activeGuidanceRules = modelGuidanceRules.filter((rule) => rule.status === "approved");
  const rejectedGuidanceRules = modelGuidanceRules.filter((rule) => rule.status === "rejected");

  useEffect(() => {
    let isActive = true;

    async function loadMoatEngine() {
      try {
        const response = await fetch("/api/moat-engine?workspaceId=workspace_demo");

        if (!response.ok) {
          throw new Error("Learning API is not available in preview mode.");
        }

        const data = await response.json();

        if (!isActive) {
          return;
        }

        setSnapshot(data);
        setWorkspaceId(data.workspaceId || "workspace_demo");
        setDecisionHistory(data.decisionHistory || []);
        setDecisionOutcomes(data.decisionOutcomes || []);
        setModelGuidanceRules(data.modelGuidanceRules || []);
        setServerLearningAnalytics(
          data.learningAnalytics ||
            buildLearningAnalytics({
              decisionRecommendations: data.decisionHistory || [],
              decisionOutcomes: data.decisionOutcomes || [],
            }),
        );
        setServerRecommendationPerformance(
          data.recommendationPerformance ||
            buildRecommendationPerformance({
              decisionRecommendations: data.decisionHistory || [],
              decisionOutcomes: data.decisionOutcomes || [],
            }),
        );
        setSource(data.source || "supabase");
        setMigrationRequired(Boolean(data.migrationRequired));
        setSelectedRecommendationId(data.recommendations?.[0]?.id || null);
      } catch {
        if (!isActive) {
          return;
        }

        setSource("preview");
        setMigrationRequired(false);
      }
    }

    loadMoatEngine();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!approvedDecisions.length) {
      setSelectedOutcomeDecisionId(null);
      setOutcomeForm(defaultOutcomeFormFor(null));
      return;
    }

    const selectedStillExists = approvedDecisions.some(
      (decision) => decision.id === selectedOutcomeDecisionId,
    );

    if (!selectedOutcomeDecisionId || !selectedStillExists) {
      setSelectedOutcomeDecisionId(approvedDecisions[0].id);
      setOutcomeForm(defaultOutcomeFormFor(approvedDecisions[0]));
    }
  }, [approvedDecisions, selectedOutcomeDecisionId]);

  function selectOutcomeDecision(decision) {
    setSelectedOutcomeDecisionId(decision.id);
    setOutcomeForm(defaultOutcomeFormFor(decision));
  }

  function updateOutcomeForm(field, value) {
    setOutcomeForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function upsertGuidanceRule(rule) {
    setModelGuidanceRules((current) => {
      const existingIndex = current.findIndex((entry) => entry.id === rule.id);

      if (existingIndex >= 0) {
        return current.map((entry) => (entry.id === rule.id ? rule : entry));
      }

      return [rule, ...current];
    });
  }

  async function postGuidanceAction(payload) {
    const response = await fetch("/api/moat-engine", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Guidance action could not be saved to the server.");
    }

    return response.json();
  }

  async function proposeGuidanceRule(candidate) {
    setIsSaving(true);

    const payload = {
      action: "propose_guidance_rule",
      workspaceId,
      ruleType: candidate.ruleType,
      targetValue: candidate.targetValue,
      suggestedAdjustment: candidate.suggestedAdjustment,
      reason: candidate.reason,
    };

    try {
      const data = await postGuidanceAction(payload);
      upsertGuidanceRule(data.rule);
      setMessage(
        `Guidance proposal created for ${candidate.targetValue}: ${signedPercentLabel(candidate.suggestedAdjustment)}. Human approval is still required.`,
      );
    } catch {
      const localRule = localGuidanceRuleFrom(candidate, workspaceId);
      upsertGuidanceRule(localRule);
      setSource("preview");
      setMessage(
        `Guidance proposal created in preview mode for ${candidate.targetValue}. Approve it to test guided confidence locally.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function approveGuidanceRule(rule) {
    const duplicate = modelGuidanceRules.find(
      (entry) => entry.id !== rule.id && entry.status === "approved" && guidanceRuleKey(entry) === guidanceRuleKey(rule),
    );

    if (duplicate) {
      setMessage(`An active guidance rule already exists for ${rule.targetValue}.`);
      return;
    }

    setIsSaving(true);

    try {
      const data = await postGuidanceAction({
        action: "approve_guidance_rule",
        workspaceId,
        ruleId: rule.id,
      });

      if (data.duplicateBlocked) {
        setMessage(data.message || `An active guidance rule already exists for ${rule.targetValue}.`);
      } else {
        upsertGuidanceRule(data.rule);
        setMessage(
          `Guidance rule approved for ${rule.targetValue}. Approved adjustment: ${signedPercentLabel(data.rule.approvedAdjustment)}.`,
        );
      }
    } catch {
      const nextRule = {
        ...rule,
        status: "approved",
        approvedAdjustment: rule.suggestedAdjustment,
        approvedBy: "preview",
        approvedAt: new Date().toISOString(),
        rejectedBy: null,
        rejectedAt: null,
      };

      upsertGuidanceRule(nextRule);
      setSource("preview");
      setMessage(
        `Guidance rule approved locally for ${rule.targetValue}. Approved adjustment: ${signedPercentLabel(nextRule.approvedAdjustment)}.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function rejectGuidanceRule(rule) {
    setIsSaving(true);

    try {
      const data = await postGuidanceAction({
        action: "reject_guidance_rule",
        workspaceId,
        ruleId: rule.id,
      });

      upsertGuidanceRule(data.rule);
      setMessage(`Guidance rule rejected for ${rule.targetValue}.`);
    } catch {
      const nextRule = {
        ...rule,
        status: "rejected",
        approvedAdjustment: null,
        rejectedBy: "preview",
        rejectedAt: new Date().toISOString(),
      };

      upsertGuidanceRule(nextRule);
      setSource("preview");
      setMessage(`Guidance rule rejected locally for ${rule.targetValue}.`);
    } finally {
      setIsSaving(false);
    }
  }

  async function recordDecision(recommendation, userAction) {
    if (!recommendation) {
      setMessage("No recommendation is selected yet.");
      return;
    }

    setSelectedRecommendationId(recommendation.id);
    setIsSaving(true);

    const payload = {
      workspaceId,
      sku: recommendation.sku,
      product: recommendation.product,
      issueType: recommendation.issueType,
      recommendationType: recommendation.recommendationType,
      recommendedAction: recommendation.recommendedAction,
      userAction,
      estimatedFinancialImpact: recommendation.financialImpact,
      confidence: recommendation.confidence,
      reasonSummary: recommendation.whyItMatters,
      riskIndex: recommendation.riskIndex,
      profitImpact: recommendation.profitImpact,
      partnerSupport: recommendation.partnerSupport,
      supplier: recommendation.supplier,
    };

    try {
      const response = await fetch("/api/moat-engine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Decision could not be saved to the server.");
      }

      const data = await response.json();
      setDecisionHistory((current) => [data.decision, ...current]);
      setMessage(
        `${actionLabel(userAction)} recorded for ${recommendation.sku}. Audit-ready financial impact: ${money(recommendation.financialImpact)}.`,
      );
    } catch {
      const localDecision = localDecisionFrom(recommendation, userAction, workspaceId);
      setDecisionHistory((current) => [localDecision, ...current]);
      setSource("preview");
      setMessage(
        `${actionLabel(userAction)} recorded in preview mode for ${recommendation.sku}. Run the Moat Engine migration for Supabase learning history.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function recordOutcome(event) {
    event.preventDefault();

    if (!selectedOutcomeDecision) {
      setMessage("Approve a recommendation before recording an outcome.");
      return;
    }

    const actualResult = outcomeForm.actualResult.trim();
    const actualFinancialImpact = Number(outcomeForm.actualFinancialImpact);

    if (!actualResult) {
      setMessage("Add a short actual result summary before saving the outcome.");
      return;
    }

    if (!Number.isFinite(actualFinancialImpact)) {
      setMessage("Add a valid actual financial impact amount before saving the outcome.");
      return;
    }

    setIsSaving(true);

    const payload = {
      workspaceId,
      recommendationId: selectedOutcomeDecision.id,
      sku: selectedOutcomeDecision.sku,
      accuracyStatus: outcomeForm.accuracyStatus,
      actualResult,
      actualFinancialImpact,
    };

    try {
      const response = await fetch("/api/moat-engine", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Outcome could not be saved.");
      }

      const data = await response.json();
      setDecisionOutcomes((current) => [data.outcome, ...current]);
      setDecisionHistory((current) =>
        current.map((entry) =>
          entry.id === selectedOutcomeDecision.id
            ? {
                ...entry,
                accuracyStatus: outcomeForm.accuracyStatus,
              }
            : entry,
        ),
      );
      setMessage(
        `${accuracyLabel(outcomeForm.accuracyStatus)} outcome recorded for ${selectedOutcomeDecision.sku}. Actual impact: ${money(actualFinancialImpact)}.`,
      );
    } catch {
      setDecisionOutcomes((current) => [
        {
          id: `local_outcome_${Date.now()}`,
          recommendationId: selectedOutcomeDecision.id,
          sku: selectedOutcomeDecision.sku,
          accuracyStatus: outcomeForm.accuracyStatus,
          actualResult,
          actualFinancialImpact,
          recordedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      setDecisionHistory((current) =>
        current.map((entry) =>
          entry.id === selectedOutcomeDecision.id
            ? {
                ...entry,
                accuracyStatus: outcomeForm.accuracyStatus,
              }
            : entry,
        ),
      );
      setMessage(
        `${accuracyLabel(outcomeForm.accuracyStatus)} outcome recorded locally for ${selectedOutcomeDecision.sku}.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  function reviewBriefingItem(item) {
    if (item?.recommendationId) {
      setSelectedRecommendationId(item.recommendationId);
    }

    window.requestAnimationFrame(() => {
      document
        .getElementById("moat-recommendation-detail")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="app-shell seller-risk-shell moat-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Learning and accuracy</div>
          <h1>Turn every rescue decision into operating intelligence.</h1>
          <p className="hero-text">
            The moat layer tracks risk scores, expected profit impact, supplier behavior,
            partner match outcomes, and whether each recommendation was right over time.
          </p>
        </div>
        <AppNavigation />
      </header>

      <section className="lab-card advisor-briefing">
        <div className="advisor-briefing-header">
          <div>
            <span className="result-label">Daily Executive Briefing</span>
            <h2>{dailyBriefing.greeting}</h2>
            <p>{dailyBriefing.summary}</p>
          </div>
          <span className="tier-chip">Generated {formatTime(dailyBriefing.generatedAt)}</span>
        </div>

        <div className="advisor-briefing-grid">
          {dailyBriefing.items.map((item, index) => (
            <article className="advisor-briefing-card" key={item.id}>
              <div className="advisor-card-head">
                <span className="advisor-category-badge">{item.category}</span>
                <span className={`sku-priority ${priorityClass(item.severity)}`}>
                  {item.severity}
                </span>
              </div>
              <h3>
                <span>{index + 1}.</span> {item.title}
              </h3>

              <div className="advisor-impact-row">
                <div>
                  <span>Potential impact</span>
                  <strong>{money(item.financialImpact)}</strong>
                </div>
                <div>
                  <span>Recommended action</span>
                  <strong>{item.recommendedAction}</strong>
                </div>
              </div>

              <div className="advisor-briefing-columns">
                <div>
                  <span className="result-label">{item.reasonIntro}</span>
                  <ul>
                    {item.evidence.map((evidence) => (
                      <li key={evidence}>{evidence}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="result-label">{item.consequenceIntro}</span>
                  <ul>
                    {item.consequences.map((consequence) => (
                      <li key={consequence}>{consequence}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="advisor-confidence-strip">
                <div>
                  <span>Confidence</span>
                  <strong>{percentLabel(item.confidence)}</strong>
                </div>
                <ul>
                  {item.confidenceReasoning.slice(0, 4).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>

              <div className="advisor-next-step">
                <p>{item.nextStep}</p>
                <button
                  className="button button-secondary"
                  onClick={() => reviewBriefingItem(item)}
                  type="button"
                >
                  Review Recommendation
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`moat-status-card ${migrationRequired ? "moat-status-warning" : ""}`}>
        <div>
          <span className="result-label">Learning layer</span>
          <strong>{sourceLabel(source, migrationRequired)}</strong>
          <p>
            {migrationRequired
              ? "The UI is usable now, but Supabase needs the Moat Engine migration before persisted learning tables are available."
              : "Decisions can be recorded now and attached to risk, profit, supplier, and outcome context."}
          </p>
        </div>
        <span className="tier-chip">{snapshot.modelVersion}</span>
      </section>

      <section className="seller-risk-metric-grid moat-metric-grid">
        <div className="result-block">
          <div className="result-label">Revenue at risk</div>
          <div className="result-value">{money(executiveSummary.totalRevenueAtRisk)}</div>
          <div className="result-meta">Potential sales exposure across active risk items.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Margin at risk</div>
          <div className="result-value">{money(executiveSummary.totalMarginAtRisk)}</div>
          <div className="result-meta">Modeled gross margin exposed by poor timing or flow.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Critical SKUs</div>
          <div className="result-value">{executiveSummary.criticalSkus}</div>
          <div className="result-meta">{executiveSummary.inboundRisks} inbound or stockout risks.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Losses prevented</div>
          <div className="result-value">
            {money(outcomeSummary.lossesPrevented || executiveSummary.estimatedLossesPrevented)}
          </div>
          <div className="result-meta">
            {outcomeSummary.totalOutcomes
              ? `${outcomeSummary.totalOutcomes} outcome-backed result(s).`
              : `${executiveSummary.recommendationsApproved} approved recommendations.`}
          </div>
        </div>
      </section>

      <section className="moat-command-grid">
        <div className="lab-card moat-queue-card">
          <div className="results-header">
            <h3>What needs action today</h3>
            <span className="tier-chip">{activeRecommendations.length} ranked</span>
          </div>
          <div className="moat-decision-list">
            {criticalQueue.map((item) => (
              <button
                className={`moat-decision-item ${
                  selectedRecommendation?.id === item.id ? "active" : ""
                }`}
                key={item.id}
                onClick={() => setSelectedRecommendationId(item.id)}
                type="button"
              >
                <span className={`sku-priority ${priorityClass(item.riskIndex.riskLevel)}`}>
                  {item.riskIndex.riskLevel}
                </span>
                <strong>{item.problem}</strong>
                <small>{item.whyItMatters}</small>
                <em>
                  {money(item.financialImpact)} impact |{" "}
                  {percentLabel(item.confidenceAnalysis?.finalConfidence || item.confidence)} tuned confidence
                </em>
              </button>
            ))}
          </div>
        </div>

        <div className="lab-card moat-focus-card" id="moat-recommendation-detail">
          <div className="results-header">
            <h3>Recommended move</h3>
            <span className={`sku-priority ${priorityClass(selectedRecommendation?.riskIndex.riskLevel || "watch")}`}>
              {selectedRecommendation?.riskIndex.score}/100
            </span>
          </div>
          <div className="moat-risk-index">
            <div>
              <span className="result-label">Auretix Risk Index</span>
              <strong>{selectedRecommendation?.riskIndex.riskLevel}</strong>
              <p>{selectedRecommendation?.riskIndex.reasonSummary}</p>
            </div>
            <div>
              <span className="result-label">Financial impact estimate</span>
              <strong>{money(selectedRecommendation?.financialImpact || 0)}</strong>
              <p>{selectedRecommendation?.profitImpact.expectedBenefitCopy}</p>
            </div>
          </div>
          <div className="moat-selected-body">
            <div>
              <span className="result-label">Why this is risky</span>
              <p>{selectedRecommendation?.whyItMatters}</p>
            </div>
            <div>
              <span className="result-label">Expected outcome</span>
              <p>
                {selectedRecommendation?.recommendedAction} should protect about{" "}
                {money(selectedRecommendation?.profitImpact.expectedBenefit || 0)} in modeled benefit.
              </p>
            </div>
          </div>
          <div className="moat-confidence-intelligence">
            <div className="results-header">
              <h4>Confidence Intelligence</h4>
              <span className="tier-chip">Human approval required</span>
            </div>
            <div className="moat-confidence-grid">
              <div>
                <span>Base Confidence</span>
                <strong>{percentLabel(selectedConfidence.baseConfidence)}</strong>
              </div>
              <div>
                <span>Recommendation History</span>
                <strong>{signedPercentLabel(selectedConfidence.recommendationAdjustment)}</strong>
              </div>
              <div>
                <span>Supplier History</span>
                <strong>{signedPercentLabel(selectedConfidence.supplierAdjustment)}</strong>
              </div>
              <div>
                <span>Issue History</span>
                <strong>{signedPercentLabel(selectedConfidence.issueAdjustment)}</strong>
              </div>
              <div>
                <span>SKU History</span>
                <strong>{signedPercentLabel(selectedConfidence.skuAdjustment)}</strong>
              </div>
              <div>
                <span>Variance</span>
                <strong>{signedPercentLabel(selectedConfidence.varianceAdjustment)}</strong>
              </div>
              <div className="moat-confidence-final">
                <span>Final Confidence</span>
                <strong>{percentLabel(selectedConfidence.finalConfidence)}</strong>
              </div>
            </div>
            <div className="moat-confidence-reasoning">
              <span className="result-label">Why Confidence Changed</span>
              <ul>
                {selectedConfidence.confidenceReasoning.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="button-row moat-action-row">
            <button
              className="button button-primary"
              disabled={isSaving}
              onClick={() => recordDecision(selectedRecommendation, "approved")}
              type="button"
            >
              Approve
            </button>
            <button
              className="button button-secondary"
              disabled={isSaving}
              onClick={() => recordDecision(selectedRecommendation, "deferred")}
              type="button"
            >
              Defer
            </button>
            <button
              className="button button-secondary"
              disabled={isSaving}
              onClick={() => recordDecision(selectedRecommendation, "watched")}
              type="button"
            >
              Watch
            </button>
            <button
              className="button button-secondary"
              disabled={isSaving}
              onClick={() => recordDecision(selectedRecommendation, "request_partner_help")}
              type="button"
            >
              Request partner help
            </button>
          </div>
          {message ? <div className="flow-run-result moat-run-result">{message}</div> : null}
        </div>
      </section>

      <section className="moat-profit-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Money at risk</h3>
            <span className="tier-chip">Profit Impact Engine</span>
          </div>
          <div className="moat-impact-strip">
            <div>
              <span>Revenue at risk</span>
              <strong>{money(selectedRecommendation?.profitImpact.revenueAtRisk || 0)}</strong>
            </div>
            <div>
              <span>Margin at risk</span>
              <strong>{money(selectedRecommendation?.profitImpact.marginAtRisk || 0)}</strong>
            </div>
            <div>
              <span>Cash tied up</span>
              <strong>{money(selectedRecommendation?.profitImpact.cashTiedUp || 0)}</strong>
            </div>
            <div>
              <span>Cost of delay</span>
              <strong>{money(selectedRecommendation?.profitImpact.costOfDelay || 0)}</strong>
            </div>
          </div>
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Decision status</h3>
            <span className="tier-chip">Outcome loop</span>
          </div>
          <div className="moat-impact-strip">
            <div>
              <span>Pending</span>
              <strong>{executiveSummary.recommendationsPending}</strong>
            </div>
            <div>
              <span>Approved</span>
              <strong>{executiveSummary.recommendationsApproved}</strong>
            </div>
            <div>
              <span>Supplier risks</span>
              <strong>{executiveSummary.supplierRisks}</strong>
            </div>
            <div>
              <span>Partner opens</span>
              <strong>{executiveSummary.partnerRequestsOpen}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="moat-learning-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Outcome learning scorecard</h3>
            <span className="tier-chip">{outcomeSummary.totalOutcomes} outcomes</span>
          </div>
          <div className="moat-learning-metrics">
            <div>
              <span>Accurate</span>
              <strong>{outcomeSummary.accuratePercent}%</strong>
              <small>{outcomeSummary.accurateCount} latest outcome(s)</small>
            </div>
            <div>
              <span>Partially accurate</span>
              <strong>{outcomeSummary.partiallyAccuratePercent}%</strong>
              <small>{outcomeSummary.partiallyAccurateCount} latest outcome(s)</small>
            </div>
            <div>
              <span>Inaccurate</span>
              <strong>{outcomeSummary.inaccuratePercent}%</strong>
              <small>{outcomeSummary.inaccurateCount} latest outcome(s)</small>
            </div>
            <div>
              <span>Estimated vs actual</span>
              <strong>{money(outcomeSummary.estimatedFinancialImpact)}</strong>
              <small>
                Actual {money(outcomeSummary.actualFinancialImpact)} | variance{" "}
                {money(outcomeSummary.impactVariance)}
              </small>
            </div>
            <div>
              <span>Losses prevented</span>
              <strong>{money(outcomeSummary.lossesPrevented)}</strong>
              <small>Accurate and partially accurate outcomes.</small>
            </div>
            <div>
              <span>Awaiting result</span>
              <strong>{outcomeSummary.pendingOutcomeCount}</strong>
              <small>Approved decisions still need actual results.</small>
            </div>
          </div>
        </div>

        <form className="lab-card moat-outcome-form" onSubmit={recordOutcome}>
          <div className="results-header">
            <h3>Record actual outcome</h3>
            <span className="tier-chip">Learning loop</span>
          </div>
          {approvedDecisions.length ? (
            <>
              <label className="moat-field">
                Approved recommendation
                <select
                  value={selectedOutcomeDecision?.id || ""}
                  onChange={(event) => {
                    const nextDecision = approvedDecisions.find(
                      (decision) => decision.id === event.target.value,
                    );

                    if (nextDecision) {
                      selectOutcomeDecision(nextDecision);
                    }
                  }}
                >
                  {approvedDecisions.map((decision) => (
                    <option key={decision.id} value={decision.id}>
                      {decision.sku} - {decision.recommendedAction}
                    </option>
                  ))}
                </select>
              </label>

              <div className="moat-outcome-reference">
                <div>
                  <span>Recommendation ID</span>
                  <strong>{selectedOutcomeDecision?.id}</strong>
                </div>
                <div>
                  <span>SKU</span>
                  <strong>{selectedOutcomeDecision?.sku}</strong>
                </div>
                <div>
                  <span>Estimated impact</span>
                  <strong>{money(selectedOutcomeDecision?.estimatedFinancialImpact || 0)}</strong>
                </div>
                <div>
                  <span>Recorded timestamp</span>
                  <strong>Captured on submit</strong>
                </div>
              </div>

              <label className="moat-field">
                Actual result summary
                <textarea
                  rows={4}
                  value={outcomeForm.actualResult}
                  onChange={(event) => updateOutcomeForm("actualResult", event.target.value)}
                />
              </label>

              <div className="moat-field-grid">
                <label className="moat-field">
                  Actual financial impact
                  <input
                    type="number"
                    value={outcomeForm.actualFinancialImpact}
                    onChange={(event) =>
                      updateOutcomeForm("actualFinancialImpact", event.target.value)
                    }
                  />
                </label>
                <label className="moat-field">
                  Accuracy status
                  <select
                    value={outcomeForm.accuracyStatus}
                    onChange={(event) => updateOutcomeForm("accuracyStatus", event.target.value)}
                  >
                    <option value="accurate">Accurate</option>
                    <option value="partially accurate">Partially accurate</option>
                    <option value="inaccurate">Inaccurate</option>
                  </select>
                </label>
              </div>

              <button className="button button-primary" disabled={isSaving} type="submit">
                Save outcome
              </button>
            </>
          ) : (
            <p className="result-meta">
              Approve a recommendation first. Auretix records outcomes only after a human decision
              exists, so the learning loop stays auditable.
            </p>
          )}
        </form>
      </section>

      <section className="lab-card moat-learning-intelligence">
        <div className="results-header">
          <div>
            <span className="result-label">Learning Intelligence</span>
            <h3>Proof that Auretix is learning from real decisions.</h3>
          </div>
          <span className="tier-chip">{learningAnalytics.totalRecommendations} recommendations</span>
        </div>
        <p className="result-meta">
          Auretix has recorded {learningAnalytics.outcomesRecorded} outcome
          {learningAnalytics.outcomesRecorded === 1 ? "" : "s"} with{" "}
          {percentLabel(learningAnalytics.accuracyRate)} accuracy. Approved recommendations have
          {learningAnalytics.outcomesRecorded
            ? ` created ${money(learningAnalytics.lossesPrevented)} in verified prevented loss.`
            : " not been outcome-verified yet."}
        </p>

        <div className="moat-intelligence-summary">
          <div>
            <span>Recommendation Accuracy</span>
            <strong>{percentLabel(learningAnalytics.accuracyRate)}</strong>
            <small>
              {learningAnalytics.accurateOutcomes} accurate,{" "}
              {learningAnalytics.partiallyAccurateOutcomes} partial,{" "}
              {learningAnalytics.inaccurateOutcomes} inaccurate.
            </small>
          </div>
          <div>
            <span>Outcomes Recorded</span>
            <strong>{learningAnalytics.outcomesRecorded}</strong>
            <small>
              {learningAnalytics.pendingOutcomeCount} approved recommendation
              {learningAnalytics.pendingOutcomeCount === 1 ? "" : "s"} still need results.
            </small>
          </div>
          <div>
            <span>Actual Impact</span>
            <strong>{money(learningAnalytics.actualFinancialImpact)}</strong>
            <small>
              Avg accurate outcome:{" "}
              {money(learningAnalytics.averageActualImpactPerAccurateOutcome)}.
            </small>
          </div>
          <div>
            <span>Losses Prevented</span>
            <strong>{money(learningAnalytics.lossesPrevented)}</strong>
            <small>
              Avg approved confidence: {percentLabel(learningAnalytics.averageApprovedConfidence)}.
            </small>
          </div>
        </div>

        <div className="moat-intelligence-grid">
          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Estimated vs Actual Impact</h4>
              <span className="tier-chip">Variance</span>
            </div>
            <div className="moat-impact-strip moat-impact-strip-compact">
              <div>
                <span>Estimated</span>
                <strong>{money(learningAnalytics.estimatedFinancialImpact)}</strong>
              </div>
              <div>
                <span>Actual</span>
                <strong>{money(learningAnalytics.actualFinancialImpact)}</strong>
              </div>
              <div>
                <span>Variance</span>
                <strong>{money(learningAnalytics.impactVariance)}</strong>
              </div>
            </div>
            <p className="result-meta">
              This compares outcome-backed estimated impact against the actual result entered by
              the operator.
            </p>
          </div>

          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Accuracy by Recommendation Type</h4>
              <span className="tier-chip">Model behavior</span>
            </div>
            {learningAnalytics.recommendationTypePerformance.length ? (
              <div className="moat-performance-list">
                {learningAnalytics.recommendationTypePerformance.slice(0, 5).map((item) => (
                  <div className="moat-performance-row" key={item.key}>
                    <span>
                      <strong>{plainLabel(item.label)}</strong>
                      <small>{item.outcomesRecorded} outcome-backed result(s)</small>
                    </span>
                    <span>{percentLabel(item.accuracyRate)} accurate</span>
                    <span>{money(item.actualFinancialImpact)} actual</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">Record outcomes to compare recommendation types.</p>
            )}
          </div>

          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Top Value-Created Decisions</h4>
              <span className="tier-chip">Top 5</span>
            </div>
            {learningAnalytics.topValueCreatedDecisions.length ? (
              <div className="moat-value-list">
                {learningAnalytics.topValueCreatedDecisions.map((decision) => (
                  <div className="moat-value-row" key={decision.id}>
                    <span>
                      <strong>{decision.sku}</strong>
                      <small>{decision.recommendedAction}</small>
                    </span>
                    <span>{accuracyLabel(decision.accuracyStatus)}</span>
                    <span>{money(decision.actualFinancialImpact)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">
                Save an actual outcome to show which decisions created measurable value.
              </p>
            )}
          </div>

          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Weakest Recommendation Types</h4>
              <span className="tier-chip">Improve next</span>
            </div>
            {learningAnalytics.weakestRecommendationTypes.length ? (
              <div className="moat-performance-list">
                {learningAnalytics.weakestRecommendationTypes.map((item) => (
                  <div className="moat-performance-row" key={item.key}>
                    <span>
                      <strong>{plainLabel(item.label)}</strong>
                      <small>
                        {item.inaccurateOutcomes} inaccurate of {item.outcomesRecorded} outcome(s).
                      </small>
                    </span>
                    <span>{percentLabel(item.accuracyRate)} accurate</span>
                    <span>{money(item.impactVariance)} variance</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">
                Weak spots appear after outcomes are marked partially accurate or inaccurate.
              </p>
            )}
          </div>
        </div>

        <div className="moat-intelligence-grid moat-intelligence-grid-secondary">
          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Accuracy by SKU</h4>
              <span className="tier-chip">SKU learning</span>
            </div>
            {learningAnalytics.skuPerformance.length ? (
              <div className="moat-performance-list">
                {learningAnalytics.skuPerformance.slice(0, 5).map((item) => (
                  <div className="moat-performance-row" key={item.key}>
                    <span>
                      <strong>{plainLabel(item.label)}</strong>
                      <small>{item.totalRecommendations} recommendation(s)</small>
                    </span>
                    <span>{percentLabel(item.accuracyRate)} accurate</span>
                    <span>{money(item.actualFinancialImpact)} actual</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">SKU-level learning appears after recommendations are saved.</p>
            )}
          </div>

          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Accuracy by Issue Type</h4>
              <span className="tier-chip">Risk pattern</span>
            </div>
            {learningAnalytics.issueTypePerformance.length ? (
              <div className="moat-performance-list">
                {learningAnalytics.issueTypePerformance.slice(0, 5).map((item) => (
                  <div className="moat-performance-row" key={item.key}>
                    <span>
                      <strong>{plainLabel(item.label)}</strong>
                      <small>{item.outcomesRecorded} outcome-backed result(s)</small>
                    </span>
                    <span>{percentLabel(item.accuracyRate)} accurate</span>
                    <span>{money(item.actualFinancialImpact)} actual</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">Issue-type learning appears after outcomes are recorded.</p>
            )}
          </div>
        </div>

        <div className="moat-learning-counts">
          <span>Approved: {learningAnalytics.approvedRecommendations}</span>
          <span>Deferred: {learningAnalytics.deferredRecommendations}</span>
          <span>Watched: {learningAnalytics.watchedRecommendations}</span>
          <span>Partner help: {learningAnalytics.partnerHelpRequests}</span>
          <span>Audit events loaded: {learningAnalytics.auditEventCount}</span>
        </div>
      </section>

      <section className="lab-card moat-confidence-feedback">
        <div className="results-header">
          <div>
            <span className="result-label">Confidence Feedback Loop</span>
            <h3>Using outcome history to tune future confidence.</h3>
          </div>
          <span className="tier-chip">{confidenceFeedback.safetyMode.replaceAll("_", " ")}</span>
        </div>
        <p className="result-meta">
          Confidence tuning is display-only in this phase. Auretix adjusts the confidence signal
          from history, but it never approves, defers, watches, or requests partner help without a
          human action.
        </p>

        <div className="moat-intelligence-summary moat-confidence-summary">
          <div>
            <span>Average Adjustment</span>
            <strong>{signedPercentLabel(confidenceFeedback.averageConfidenceAdjustment)}</strong>
            <small>Average movement from base to final confidence.</small>
          </div>
          <div>
            <span>Recommendations Upgraded</span>
            <strong>{confidenceFeedback.recommendationsUpgraded}</strong>
            <small>Recommendations with confidence improved by history.</small>
          </div>
          <div>
            <span>Recommendations Downgraded</span>
            <strong>{confidenceFeedback.recommendationsDowngraded}</strong>
            <small>Recommendations with confidence reduced by history.</small>
          </div>
          <div>
            <span>Highest Confidence</span>
            <strong>
              {confidenceSummaryLabel(confidenceFeedback.highestConfidenceRecommendation)}
            </strong>
            <small>Top final confidence after learning adjustments.</small>
          </div>
        </div>

        <div className="moat-feedback-grid">
          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Confidence Range</h4>
              <span className="tier-chip">
                {confidenceFeedback.confidenceBounds.minimum}-{confidenceFeedback.confidenceBounds.maximum}%
              </span>
            </div>
            <div className="moat-confidence-list">
              <div className="moat-confidence-row">
                <span>
                  <strong>Lowest confidence recommendation</strong>
                  <small>Most cautious final confidence score after history.</small>
                </span>
                <strong>
                  {confidenceSummaryLabel(confidenceFeedback.lowestConfidenceRecommendation)}
                </strong>
              </div>
              <div className="moat-confidence-row">
                <span>
                  <strong>Largest positive adjustment</strong>
                  <small>Recommendation most improved by historical evidence.</small>
                </span>
                <strong>
                  {confidenceAdjustmentLabel(confidenceFeedback.largestPositiveAdjustment)}
                </strong>
              </div>
              <div className="moat-confidence-row">
                <span>
                  <strong>Largest negative adjustment</strong>
                  <small>Recommendation most reduced by historical evidence.</small>
                </span>
                <strong>
                  {confidenceAdjustmentLabel(confidenceFeedback.largestNegativeAdjustment)}
                </strong>
              </div>
            </div>
          </div>

          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Model Learning Progress</h4>
              <span className="tier-chip">Outcome memory</span>
            </div>
            <div className="moat-learning-progress-grid">
              <div>
                <span>Total outcomes used</span>
                <strong>{confidenceFeedback.modelLearningProgress.totalOutcomesUsed}</strong>
              </div>
              <div>
                <span>Recommendation types learned</span>
                <strong>{confidenceFeedback.modelLearningProgress.recommendationTypesLearned}</strong>
              </div>
              <div>
                <span>Suppliers learned</span>
                <strong>{confidenceFeedback.modelLearningProgress.suppliersLearned}</strong>
              </div>
              <div>
                <span>SKUs learned</span>
                <strong>{confidenceFeedback.modelLearningProgress.skusLearned}</strong>
              </div>
              <div>
                <span>Average confidence uplift</span>
                <strong>
                  {signedPercentLabel(confidenceFeedback.modelLearningProgress.averageConfidenceUplift)}
                </strong>
              </div>
              <div>
                <span>Average confidence reduction</span>
                <strong>
                  {signedPercentLabel(confidenceFeedback.modelLearningProgress.averageConfidenceReduction)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lab-card moat-performance-rankings">
        <div className="results-header">
          <div>
            <span className="result-label">Recommendation Performance Rankings</span>
            <h3>Which Auretix moves are actually working?</h3>
          </div>
          <span className="tier-chip">
            {recommendationPerformance.recommendationTypeRankings.length} signal groups
          </span>
        </div>
        <p className="result-meta">
          Auretix now ranks recommendation types, suppliers, SKUs, and issue categories by
          recorded outcomes, accuracy, financial impact, variance, and confidence-adjustment
          suggestions.
        </p>

        <div className="moat-ranking-grid">
          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Best Performing Recommendation Types</h4>
              <span className="tier-chip">Repeatable wins</span>
            </div>
            {bestRecommendationTypes.length ? (
              <div className="moat-performance-list">
                {bestRecommendationTypes.map((item) => (
                  <div className="moat-performance-row moat-performance-row-wide" key={item.key}>
                    <span>
                      <strong>{plainLabel(item.label)}</strong>
                      <small>{accuracySentence(item)}</small>
                    </span>
                    <span>{money(item.actualFinancialImpact)} actual</span>
                    <span>{item.confidenceAdjustmentSuggestion}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">
                Record outcomes to rank which recommendation types perform best.
              </p>
            )}
          </div>

          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Weakest Recommendation Types</h4>
              <span className="tier-chip">Needs review</span>
            </div>
            {weakestRecommendationTypes.length ? (
              <div className="moat-performance-list">
                {weakestRecommendationTypes.map((item) => (
                  <div className="moat-performance-row moat-performance-row-wide" key={item.key}>
                    <span>
                      <strong>{plainLabel(item.label)}</strong>
                      <small>
                        {item.inaccurateCount} inaccurate, {item.partiallyAccurateCount} partial,
                        variance {money(item.variance)}.
                      </small>
                    </span>
                    <span>{percentLabel(item.accuracyRate)} accurate</span>
                    <span>{item.confidenceAdjustmentSuggestion}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">
                Weak recommendation types appear after partially accurate or inaccurate outcomes.
              </p>
            )}
          </div>

          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Supplier Outcome Rankings</h4>
              <span className="tier-chip">Supplier signal</span>
            </div>
            {supplierOutcomeRankings.length ? (
              <div className="moat-performance-list">
                {supplierOutcomeRankings.map((item) => (
                  <div className="moat-performance-row moat-performance-row-wide" key={item.key}>
                    <span>
                      <strong>{plainLabel(item.label)}</strong>
                      <small>
                        {item.outcomesRecorded} outcome(s), {item.totalRecommendations} linked
                        recommendation(s)
                        {item.riskNotes.length ? `; ${item.riskNotes[0]}` : "."}
                      </small>
                    </span>
                    <span>{percentLabel(item.accuracyRate)} accurate</span>
                    <span>{money(item.actualFinancialImpact)} actual</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">Supplier rankings appear when decisions carry supplier metadata.</p>
            )}
          </div>

          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Issue Type Accuracy</h4>
              <span className="tier-chip">Risk pattern</span>
            </div>
            {issueTypeRankings.length ? (
              <div className="moat-performance-list">
                {issueTypeRankings.map((item) => (
                  <div className="moat-performance-row moat-performance-row-wide" key={item.key}>
                    <span>
                      <strong>{plainLabel(item.label)}</strong>
                      <small>
                        {item.totalRecommendations} total recommendation(s), {item.outcomesRecorded} outcome(s).
                      </small>
                    </span>
                    <span>{percentLabel(item.accuracyRate)} accurate</span>
                    <span>{money(item.variance)} variance</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">Issue type rankings appear after recommendations are recorded.</p>
            )}
          </div>

          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>SKU Outcome Performance</h4>
              <span className="tier-chip">SKU memory</span>
            </div>
            {skuOutcomeRankings.length ? (
              <div className="moat-performance-list">
                {skuOutcomeRankings.map((item) => (
                  <div className="moat-performance-row moat-performance-row-wide" key={item.key}>
                    <span>
                      <strong>{plainLabel(item.label)}</strong>
                      <small>
                        Latest status: {accuracyLabel(item.latestAccuracyStatus)};{" "}
                        {item.outcomesRecorded} outcome(s).
                      </small>
                    </span>
                    <span>{money(item.actualFinancialImpact)} actual</span>
                    <span>{money(item.estimatedFinancialImpact)} estimated</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">SKU rankings appear after recorded recommendations.</p>
            )}
          </div>

          <div className="moat-intelligence-card">
            <div className="results-header">
              <h4>Confidence Adjustment Suggestions</h4>
              <span className="tier-chip">Display only</span>
            </div>
            {confidenceAdjustmentSummary.length ? (
              <div className="moat-confidence-list">
                {confidenceAdjustmentSummary.map((item) => (
                  <div className="moat-confidence-row" key={item.key}>
                    <span>
                      <strong>{plainLabel(item.label)}</strong>
                      <small>
                        {item.outcomesRecorded} outcome(s), {percentLabel(item.accuracyRate)} accuracy,
                        current avg confidence {percentLabel(item.averageConfidence)}.
                      </small>
                    </span>
                    <strong>{item.suggestion}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="result-meta">
                Confidence suggestions appear after recommendation types have history.
              </p>
            )}
          </div>
        </div>

        <div className="moat-signal-grid">
          <div>
            <span className="result-label">Best Performing Signals</span>
            {recommendationPerformance.strongestSignals.length ? (
              recommendationPerformance.strongestSignals.slice(0, 3).map((signal) => (
                <p key={`${signal.kind}-${signal.key}`}>
                  <strong>{`${signal.kind}: ${signal.label}`}</strong>{" "}
                  {signal.reason}
                </p>
              ))
            ) : (
              <p>Record more outcomes to identify repeatable winning signals.</p>
            )}
          </div>
          <div>
            <span className="result-label">Weakest Recommendation Signals</span>
            {recommendationPerformance.weakestSignals.length ? (
              recommendationPerformance.weakestSignals.slice(0, 3).map((signal) => (
                <p key={`${signal.kind}-${signal.key}`}>
                  <strong>{`${signal.kind}: ${signal.label}`}</strong>{" "}
                  {signal.reason}
                </p>
              ))
            ) : (
              <p>Low-accuracy or high-variance signals will surface here once outcomes are recorded.</p>
            )}
          </div>
        </div>
      </section>

      <section className="seller-risk-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Supplier Intelligence Graph</h3>
            <span className="tier-chip">Feeds Risk Index</span>
          </div>
          <div className="moat-supplier-list">
            {snapshot.supplierIntelligence.map((supplier) => (
              <div key={supplier.id}>
                <strong>{supplier.supplierName}</strong>
                <span>{supplier.reliabilityScore}/100 reliability</span>
                <small>
                  Expected {supplier.expectedLeadTime}d, actual {supplier.actualLeadTime}d,
                  average delay {supplier.averageDelay}d, on-time {supplier.onTimePercentage}%.
                </small>
                <small>
                  {supplier.skuRelationships.length} SKU links | {supplier.issueHistory.length} issue events.
                </small>
              </div>
            ))}
          </div>
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Partner Network Intelligence</h3>
            <span className="tier-chip">Resolution moat</span>
          </div>
          <div className="moat-partner-grid">
            {snapshot.partnerIntelligence.map((partner) => (
              <div key={partner.partnerType}>
                <strong>{partner.matchRequestType}</strong>
                <span>{partner.matchedPartnerSentStatus}</span>
                <small>
                  {partner.consentStatus}; {partner.referralDisclosureStatus}.
                </small>
                <small>
                  {partner.partnerSuccessRating}/100 partner fit | {partner.timeToResponseHours}h response target.
                </small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lab-card moat-history-card">
        <div className="results-header">
          <h3>Decision history</h3>
          <span className="tier-chip">{decisionHistory.length} saved</span>
        </div>
        {decisionHistory.length ? (
          <div className="moat-history-list">
            {decisionHistory.slice(0, 8).map((decision) => {
              const latestOutcome = latestOutcomeByRecommendation.get(decision.id);

              return (
                <div className="moat-history-item" key={decision.id}>
                  <span>
                    <strong>{decision.sku}</strong>
                    <small>{formatTime(decision.createdAt)}</small>
                  </span>
                  <span>{decision.recommendedAction}</span>
                  <span>{decision.status || actionLabel(decision.userAction)}</span>
                  <span>{money(decision.estimatedFinancialImpact || 0)}</span>
                  <span>{accuracyLabel(latestOutcome?.accuracyStatus || decision.accuracyStatus)}</span>
                  <span className="partner-status-actions moat-outcome-actions">
                    {decision.userAction === "approved" ? (
                      <button
                        disabled={isSaving}
                        onClick={() => selectOutcomeDecision(decision)}
                        type="button"
                      >
                        Record outcome
                      </button>
                    ) : (
                      <small>Approve first</small>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="result-meta">
            No decisions have been recorded yet. Approve, defer, watch, or request partner help
            from Today&apos;s Decisions to start building the learning history.
          </p>
        )}
        {decisionOutcomes.length ? (
          <p className="result-meta moat-outcome-note">
            {decisionOutcomes.length} outcome record(s) attached to this workspace.
          </p>
        ) : null}
      </section>

      <section className="lab-card moat-history-card">
        <div className="results-header">
          <h3>Outcome history</h3>
          <span className="tier-chip">{decisionOutcomes.length} recorded</span>
        </div>
        {outcomeSummary.recentOutcomes.length ? (
          <div className="moat-outcome-list">
            {outcomeSummary.recentOutcomes.slice(0, 8).map((outcome) => (
              <div className="moat-outcome-item" key={outcome.id}>
                <span>
                  <strong>{outcome.sku}</strong>
                  <small>{formatTime(outcome.recordedAt || outcome.createdAt)}</small>
                </span>
                <span>{accuracyLabel(outcome.accuracyStatus)}</span>
                <span>{money(outcome.estimatedFinancialImpact || 0)} estimated</span>
                <span>{money(outcome.actualFinancialImpact || 0)} actual</span>
                <span>{money(outcome.impactVariance || 0)} variance</span>
                <p>{outcome.actualResult}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="result-meta">
            No outcomes have been recorded yet. Save an actual result from the Learning loop card
            to prove whether Auretix was right.
          </p>
        )}
      </section>
    </div>
  );
}
