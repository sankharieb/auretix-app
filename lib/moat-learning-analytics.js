function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Math.round(safeNumber(value));
}

function percent(count, total) {
  return total ? Math.round((safeNumber(count) / safeNumber(total)) * 100) : 0;
}

function normalizeAccuracyStatus(status) {
  if (status === "accurate" || status === "partially accurate" || status === "inaccurate") {
    return status;
  }

  return "pending";
}

function normalizeAction(action) {
  return String(action || "watched").toLowerCase();
}

function latestTimestamp(item) {
  return new Date(item.recordedAt || item.createdAt || item.updatedAt || 0).getTime();
}

function buildLatestOutcomes(outcomes = []) {
  const latest = new Map();

  for (const outcome of [...outcomes].sort((left, right) => latestTimestamp(right) - latestTimestamp(left))) {
    if (!outcome.recommendationId || latest.has(outcome.recommendationId)) {
      continue;
    }

    latest.set(outcome.recommendationId, outcome);
  }

  return [...latest.values()];
}

function createEmptyGroup(key, label) {
  return {
    key,
    label,
    totalRecommendations: 0,
    approvedRecommendations: 0,
    outcomesRecorded: 0,
    accurateOutcomes: 0,
    partiallyAccurateOutcomes: 0,
    inaccurateOutcomes: 0,
    accuracyRate: 0,
    partialAccuracyRate: 0,
    inaccuracyRate: 0,
    estimatedFinancialImpact: 0,
    actualFinancialImpact: 0,
    impactVariance: 0,
    averageConfidence: 0,
  };
}

function finalizeGroup(group) {
  return {
    ...group,
    accuracyRate: percent(group.accurateOutcomes, group.outcomesRecorded),
    partialAccuracyRate: percent(group.partiallyAccurateOutcomes, group.outcomesRecorded),
    inaccuracyRate: percent(group.inaccurateOutcomes, group.outcomesRecorded),
    estimatedFinancialImpact: round(group.estimatedFinancialImpact),
    actualFinancialImpact: round(group.actualFinancialImpact),
    impactVariance: round(group.actualFinancialImpact - group.estimatedFinancialImpact),
    averageConfidence: group.totalRecommendations
      ? round(group.averageConfidence / group.totalRecommendations)
      : 0,
  };
}

function addRecommendationToGroup(groups, key, label, decision) {
  const safeKey = key || "unknown";
  const group = groups.get(safeKey) || createEmptyGroup(safeKey, label || safeKey);

  group.totalRecommendations += 1;
  group.averageConfidence += safeNumber(decision.confidence);

  if (normalizeAction(decision.userAction) === "approved") {
    group.approvedRecommendations += 1;
  }

  groups.set(safeKey, group);
}

function addOutcomeToGroup(groups, key, label, outcome, decision, estimatedImpact) {
  const safeKey = key || "unknown";
  const group = groups.get(safeKey) || createEmptyGroup(safeKey, label || safeKey);
  const status = normalizeAccuracyStatus(outcome.accuracyStatus);
  const actualImpact = safeNumber(outcome.actualFinancialImpact);

  group.outcomesRecorded += 1;
  group.estimatedFinancialImpact += estimatedImpact;
  group.actualFinancialImpact += actualImpact;

  if (decision && !group.totalRecommendations) {
    group.totalRecommendations += 1;
    group.averageConfidence += safeNumber(decision.confidence);
  }

  if (status === "accurate") {
    group.accurateOutcomes += 1;
  } else if (status === "partially accurate") {
    group.partiallyAccurateOutcomes += 1;
  } else if (status === "inaccurate") {
    group.inaccurateOutcomes += 1;
  }

  groups.set(safeKey, group);
}

function latestRiskBySku(riskScores = []) {
  const risks = new Map();

  for (const risk of [...riskScores].sort((left, right) => latestTimestamp(right) - latestTimestamp(left))) {
    if (risk.sku && !risks.has(risk.sku)) {
      risks.set(risk.sku, risk);
    }
  }

  return risks;
}

function profitImpactByRecommendation(profitImpactRecords = []) {
  const impacts = new Map();

  for (const record of profitImpactRecords) {
    if (!record.recommendationId) {
      continue;
    }

    impacts.set(record.recommendationId, record);
  }

  return impacts;
}

function estimatedImpactFor(decision, profitImpactRecord, riskScore) {
  return safeNumber(
    decision?.estimatedFinancialImpact ||
      profitImpactRecord?.expectedBenefit ||
      riskScore?.financialImpact ||
      0,
  );
}

function financialLabel(value) {
  return round(value);
}

export function buildLearningAnalytics({
  decisionRecommendations = [],
  decisionOutcomes = [],
  riskScores = [],
  profitImpactRecords = [],
  auditEvents = [],
} = {}) {
  const decisions = Array.isArray(decisionRecommendations) ? decisionRecommendations : [];
  const outcomes = Array.isArray(decisionOutcomes) ? decisionOutcomes : [];
  const latestOutcomes = buildLatestOutcomes(outcomes);
  const decisionsById = new Map(decisions.map((decision) => [decision.id, decision]));
  const risksBySku = latestRiskBySku(riskScores);
  const profitImpactsByRecommendation = profitImpactByRecommendation(profitImpactRecords);
  const outcomeRecommendationIds = new Set(latestOutcomes.map((outcome) => outcome.recommendationId));
  const recommendationTypeGroups = new Map();
  const skuGroups = new Map();
  const issueTypeGroups = new Map();

  let approvedRecommendations = 0;
  let deferredRecommendations = 0;
  let watchedRecommendations = 0;
  let partnerHelpRequests = 0;
  let estimatedFinancialImpact = 0;
  let actualFinancialImpact = 0;
  let averageApprovedConfidence = 0;

  for (const decision of decisions) {
    const action = normalizeAction(decision.userAction);

    if (action === "approved") {
      approvedRecommendations += 1;
      averageApprovedConfidence += safeNumber(decision.confidence);
    } else if (action === "deferred") {
      deferredRecommendations += 1;
    } else if (action === "request_partner_help") {
      partnerHelpRequests += 1;
    } else {
      watchedRecommendations += 1;
    }

    addRecommendationToGroup(
      recommendationTypeGroups,
      decision.recommendationType,
      decision.recommendationType || "Unknown type",
      decision,
    );
    addRecommendationToGroup(skuGroups, decision.sku, decision.sku || "Unknown SKU", decision);
    addRecommendationToGroup(
      issueTypeGroups,
      decision.issueType,
      decision.issueType || "Unknown issue",
      decision,
    );
  }

  const enrichedOutcomes = latestOutcomes.map((outcome) => {
    const decision = decisionsById.get(outcome.recommendationId) || {};
    const riskScore = risksBySku.get(outcome.sku) || {};
    const profitImpactRecord = profitImpactsByRecommendation.get(outcome.recommendationId) || {};
    const issueType = decision.issueType || riskScore.issueType || "unknown issue";
    const recommendationType = decision.recommendationType || "unknown recommendation";
    const estimatedImpact = estimatedImpactFor(decision, profitImpactRecord, riskScore);
    const actualImpact = safeNumber(outcome.actualFinancialImpact);

    estimatedFinancialImpact += estimatedImpact;
    actualFinancialImpact += actualImpact;

    addOutcomeToGroup(
      recommendationTypeGroups,
      recommendationType,
      recommendationType,
      outcome,
      decision,
      estimatedImpact,
    );
    addOutcomeToGroup(skuGroups, outcome.sku, outcome.sku || "Unknown SKU", outcome, decision, estimatedImpact);
    addOutcomeToGroup(issueTypeGroups, issueType, issueType, outcome, decision, estimatedImpact);

    return {
      id: outcome.id,
      recommendationId: outcome.recommendationId,
      sku: outcome.sku,
      issueType,
      recommendationType,
      recommendedAction: decision.recommendedAction || riskScore.recommendedAction || "Recommendation unavailable",
      actualResult: outcome.actualResult,
      accuracyStatus: normalizeAccuracyStatus(outcome.accuracyStatus),
      estimatedFinancialImpact: financialLabel(estimatedImpact),
      actualFinancialImpact: financialLabel(actualImpact),
      impactVariance: financialLabel(actualImpact - estimatedImpact),
      recordedAt: outcome.recordedAt || outcome.createdAt,
    };
  });

  const outcomesRecorded = latestOutcomes.length;
  const accurateOutcomes = latestOutcomes.filter(
    (outcome) => normalizeAccuracyStatus(outcome.accuracyStatus) === "accurate",
  ).length;
  const partiallyAccurateOutcomes = latestOutcomes.filter(
    (outcome) => normalizeAccuracyStatus(outcome.accuracyStatus) === "partially accurate",
  ).length;
  const inaccurateOutcomes = latestOutcomes.filter(
    (outcome) => normalizeAccuracyStatus(outcome.accuracyStatus) === "inaccurate",
  ).length;
  const lossesPrevented = enrichedOutcomes.reduce((sum, outcome) => {
    if (outcome.accuracyStatus === "inaccurate") {
      return sum;
    }

    return sum + safeNumber(outcome.actualFinancialImpact);
  }, 0);
  const accurateActualImpact = enrichedOutcomes
    .filter((outcome) => outcome.accuracyStatus === "accurate")
    .reduce((sum, outcome) => sum + safeNumber(outcome.actualFinancialImpact), 0);

  const recommendationTypePerformance = [...recommendationTypeGroups.values()]
    .map(finalizeGroup)
    .sort((left, right) => right.actualFinancialImpact - left.actualFinancialImpact);
  const skuPerformance = [...skuGroups.values()]
    .map(finalizeGroup)
    .sort((left, right) => right.actualFinancialImpact - left.actualFinancialImpact);
  const issueTypePerformance = [...issueTypeGroups.values()]
    .map(finalizeGroup)
    .sort((left, right) => right.actualFinancialImpact - left.actualFinancialImpact);

  return {
    totalRecommendations: decisions.length,
    approvedRecommendations,
    deferredRecommendations,
    watchedRecommendations,
    partnerHelpRequests,
    outcomesRecorded,
    accurateOutcomes,
    partiallyAccurateOutcomes,
    inaccurateOutcomes,
    accuracyRate: percent(accurateOutcomes, outcomesRecorded),
    partialAccuracyRate: percent(partiallyAccurateOutcomes, outcomesRecorded),
    inaccuracyRate: percent(inaccurateOutcomes, outcomesRecorded),
    estimatedFinancialImpact: financialLabel(estimatedFinancialImpact),
    actualFinancialImpact: financialLabel(actualFinancialImpact),
    impactVariance: financialLabel(actualFinancialImpact - estimatedFinancialImpact),
    lossesPrevented: financialLabel(lossesPrevented),
    averageApprovedConfidence: approvedRecommendations
      ? round(averageApprovedConfidence / approvedRecommendations)
      : 0,
    averageActualImpactPerAccurateOutcome: accurateOutcomes
      ? round(accurateActualImpact / accurateOutcomes)
      : 0,
    pendingOutcomeCount: decisions.filter(
      (decision) => normalizeAction(decision.userAction) === "approved" && !outcomeRecommendationIds.has(decision.id),
    ).length,
    auditEventCount: Array.isArray(auditEvents) ? auditEvents.length : 0,
    recommendationTypePerformance,
    skuPerformance,
    issueTypePerformance,
    topValueCreatedDecisions: enrichedOutcomes
      .filter((outcome) => outcome.actualFinancialImpact > 0)
      .sort((left, right) => right.actualFinancialImpact - left.actualFinancialImpact)
      .slice(0, 5),
    weakestRecommendationTypes: recommendationTypePerformance
      .filter((group) => group.outcomesRecorded > 0)
      .sort((left, right) => {
        if (left.accuracyRate !== right.accuracyRate) {
          return left.accuracyRate - right.accuracyRate;
        }

        return right.inaccurateOutcomes - left.inaccurateOutcomes;
      })
      .slice(0, 5),
  };
}
