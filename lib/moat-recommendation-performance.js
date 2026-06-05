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

function normalizeAction(action) {
  return String(action || "watched").toLowerCase();
}

function normalizeAccuracyStatus(status) {
  if (status === "accurate" || status === "partially accurate" || status === "inaccurate") {
    return status;
  }

  return "pending";
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

function latestRiskBySku(riskScores = []) {
  const risks = new Map();

  for (const risk of [...riskScores].sort((left, right) => latestTimestamp(right) - latestTimestamp(left))) {
    if (risk.sku && !risks.has(risk.sku)) {
      risks.set(risk.sku, risk);
    }
  }

  return risks;
}

function riskById(riskScores = []) {
  return new Map(riskScores.filter((risk) => risk?.id).map((risk) => [risk.id, risk]));
}

function profitImpactByRecommendation(profitImpactRecords = []) {
  return new Map(
    profitImpactRecords
      .filter((record) => record?.recommendationId)
      .map((record) => [record.recommendationId, record]),
  );
}

function estimateFor(decision, profitImpactRecord, riskScore) {
  return safeNumber(
    decision?.estimatedFinancialImpact ||
      profitImpactRecord?.expectedBenefit ||
      riskScore?.financialImpact ||
      0,
  );
}

function supplierFrom(decision, riskScore) {
  const supplier =
    decision?.metadata?.supplier ||
    decision?.riskIndex?.supplier ||
    riskScore?.metrics?.supplier ||
    {};

  return {
    id: supplier.id || supplier.supplierId || supplier.name || supplier.supplierName || "unknown_supplier",
    name: supplier.name || supplier.supplierName || "Unknown supplier",
    adjustedReliability: supplier.adjustedReliability,
    issueBias: supplier.issueBias,
  };
}

function confidenceSuggestion(accuracyRate, outcomesRecorded) {
  if (outcomesRecorded < 3) {
    return "Need more outcomes";
  }

  if (accuracyRate >= 85) {
    return "Increase future confidence";
  }

  if (accuracyRate >= 65) {
    return "Keep confidence stable";
  }

  if (accuracyRate >= 40) {
    return "Reduce confidence slightly";
  }

  return "Downgrade or require review";
}

function createGroup(key, label, kind) {
  return {
    key,
    label,
    kind,
    totalRecommendations: 0,
    approvedCount: 0,
    outcomesRecorded: 0,
    accurateCount: 0,
    partiallyAccurateCount: 0,
    inaccurateCount: 0,
    accuracyRate: 0,
    actualFinancialImpact: 0,
    estimatedFinancialImpact: 0,
    variance: 0,
    averageConfidence: 0,
    confidenceAdjustmentSuggestion: "Need more outcomes",
    latestAccuracyStatus: "pending",
    averageSupplierReliability: 0,
    riskNotes: [],
  };
}

function ensureGroup(groups, key, label, kind) {
  const safeKey = key || `unknown_${kind}`;
  const group = groups.get(safeKey) || createGroup(safeKey, label || safeKey, kind);

  groups.set(safeKey, group);

  return group;
}

function addDecision(group, decision, supplier = null) {
  group.totalRecommendations += 1;
  group.averageConfidence += safeNumber(decision.confidence);

  if (normalizeAction(decision.userAction) === "approved") {
    group.approvedCount += 1;
  }

  if (supplier?.adjustedReliability !== undefined) {
    group.averageSupplierReliability += safeNumber(supplier.adjustedReliability);
  }

  if (supplier?.issueBias && !group.riskNotes.includes(supplier.issueBias)) {
    group.riskNotes.push(supplier.issueBias);
  }
}

function addOutcome(group, outcome, estimatedImpact) {
  const status = normalizeAccuracyStatus(outcome.accuracyStatus);

  group.outcomesRecorded += 1;
  group.actualFinancialImpact += safeNumber(outcome.actualFinancialImpact);
  group.estimatedFinancialImpact += safeNumber(estimatedImpact);
  group.latestAccuracyStatus = status;

  if (status === "accurate") {
    group.accurateCount += 1;
  } else if (status === "partially accurate") {
    group.partiallyAccurateCount += 1;
  } else if (status === "inaccurate") {
    group.inaccurateCount += 1;
  }
}

function finalizeGroup(group) {
  const accuracyRate = percent(group.accurateCount, group.outcomesRecorded);

  return {
    ...group,
    accuracyRate,
    actualFinancialImpact: round(group.actualFinancialImpact),
    estimatedFinancialImpact: round(group.estimatedFinancialImpact),
    variance: round(group.actualFinancialImpact - group.estimatedFinancialImpact),
    averageConfidence: group.totalRecommendations
      ? round(group.averageConfidence / group.totalRecommendations)
      : 0,
    averageSupplierReliability:
      group.totalRecommendations && group.averageSupplierReliability
        ? round(group.averageSupplierReliability / group.totalRecommendations)
        : 0,
    riskNotes: group.riskNotes.slice(0, 3),
    confidenceAdjustmentSuggestion: confidenceSuggestion(accuracyRate, group.outcomesRecorded),
  };
}

function repeatabilityScore(group) {
  return group.accuracyRate * 2 + group.outcomesRecorded * 8 + Math.min(group.actualFinancialImpact / 1000, 60);
}

function variancePressure(group) {
  return Math.abs(group.variance) + group.inaccurateCount * 25000 + (100 - group.accuracyRate) * 750;
}

function buildSignal(kind, group, reason) {
  return {
    kind,
    key: group.key,
    label: group.label,
    accuracyRate: group.accuracyRate,
    outcomesRecorded: group.outcomesRecorded,
    actualFinancialImpact: group.actualFinancialImpact,
    estimatedFinancialImpact: group.estimatedFinancialImpact,
    variance: group.variance,
    confidenceAdjustmentSuggestion: group.confidenceAdjustmentSuggestion,
    reason,
  };
}

export function buildRecommendationPerformance({
  decisionRecommendations = [],
  decisionOutcomes = [],
  riskScores = [],
  profitImpactRecords = [],
  auditEvents = [],
} = {}) {
  const decisions = Array.isArray(decisionRecommendations) ? decisionRecommendations : [];
  const outcomes = buildLatestOutcomes(Array.isArray(decisionOutcomes) ? decisionOutcomes : []);
  const decisionsById = new Map(decisions.map((decision) => [decision.id, decision]));
  const risksById = riskById(riskScores);
  const risksBySku = latestRiskBySku(riskScores);
  const impactsByRecommendation = profitImpactByRecommendation(profitImpactRecords);
  const recommendationTypeGroups = new Map();
  const supplierGroups = new Map();
  const issueTypeGroups = new Map();
  const skuGroups = new Map();

  for (const decision of decisions) {
    const riskScore = risksById.get(decision.riskScoreId) || risksBySku.get(decision.sku) || {};
    const supplier = supplierFrom(decision, riskScore);
    const recommendationTypeGroup = ensureGroup(
      recommendationTypeGroups,
      decision.recommendationType || "unknown_recommendation",
      decision.recommendationType || "Unknown recommendation",
      "recommendation_type",
    );
    const supplierGroup = ensureGroup(supplierGroups, supplier.id, supplier.name, "supplier");
    const issueTypeGroup = ensureGroup(
      issueTypeGroups,
      decision.issueType || riskScore.issueType || "unknown_issue",
      decision.issueType || riskScore.issueType || "Unknown issue",
      "issue_type",
    );
    const skuGroup = ensureGroup(skuGroups, decision.sku || "unknown_sku", decision.sku || "Unknown SKU", "sku");

    addDecision(recommendationTypeGroup, decision);
    addDecision(supplierGroup, decision, supplier);
    addDecision(issueTypeGroup, decision);
    addDecision(skuGroup, decision);
  }

  for (const outcome of outcomes) {
    const decision = decisionsById.get(outcome.recommendationId) || {};
    const riskScore = risksById.get(decision.riskScoreId) || risksBySku.get(outcome.sku) || {};
    const supplier = supplierFrom(decision, riskScore);
    const estimatedImpact = estimateFor(
      decision,
      impactsByRecommendation.get(outcome.recommendationId),
      riskScore,
    );

    addOutcome(
      ensureGroup(
        recommendationTypeGroups,
        decision.recommendationType || "unknown_recommendation",
        decision.recommendationType || "Unknown recommendation",
        "recommendation_type",
      ),
      outcome,
      estimatedImpact,
    );
    addOutcome(ensureGroup(supplierGroups, supplier.id, supplier.name, "supplier"), outcome, estimatedImpact);
    addOutcome(
      ensureGroup(
        issueTypeGroups,
        decision.issueType || riskScore.issueType || "unknown_issue",
        decision.issueType || riskScore.issueType || "Unknown issue",
        "issue_type",
      ),
      outcome,
      estimatedImpact,
    );
    addOutcome(
      ensureGroup(skuGroups, outcome.sku || "unknown_sku", outcome.sku || "Unknown SKU", "sku"),
      outcome,
      estimatedImpact,
    );
  }

  const recommendationTypeRankings = [...recommendationTypeGroups.values()]
    .map(finalizeGroup)
    .sort((left, right) => repeatabilityScore(right) - repeatabilityScore(left));
  const supplierRankings = [...supplierGroups.values()]
    .map(finalizeGroup)
    .sort((left, right) => repeatabilityScore(right) - repeatabilityScore(left));
  const issueTypeRankings = [...issueTypeGroups.values()]
    .map(finalizeGroup)
    .sort((left, right) => repeatabilityScore(right) - repeatabilityScore(left));
  const skuRankings = [...skuGroups.values()]
    .map(finalizeGroup)
    .sort((left, right) => right.actualFinancialImpact - left.actualFinancialImpact);
  const signalCandidates = [
    ...recommendationTypeRankings.map((group) => ({ kind: "Recommendation type", group })),
    ...issueTypeRankings.map((group) => ({ kind: "Issue type", group })),
  ];

  return {
    recommendationTypeRankings,
    supplierRankings,
    issueTypeRankings,
    skuRankings,
    strongestSignals: signalCandidates
      .filter(({ group }) => group.outcomesRecorded > 0)
      .sort((left, right) => repeatabilityScore(right.group) - repeatabilityScore(left.group))
      .slice(0, 5)
      .map(({ kind, group }) =>
        buildSignal(
          kind,
          group,
          `${group.label} is producing ${group.accuracyRate}% accuracy with ${round(
            group.actualFinancialImpact,
          )} verified actual impact.`,
        ),
      ),
    weakestSignals: signalCandidates
      .filter(({ group }) => group.outcomesRecorded > 0)
      .sort((left, right) => variancePressure(right.group) - variancePressure(left.group))
      .slice(0, 5)
      .map(({ kind, group }) =>
        buildSignal(
          kind,
          group,
          `${group.label} needs review because it has ${group.accuracyRate}% accuracy and ${round(
            group.variance,
          )} estimated-vs-actual variance.`,
        ),
      ),
    confidenceAdjustmentSummary: recommendationTypeRankings.map((group) => ({
      kind: "Recommendation type",
      key: group.key,
      label: group.label,
      outcomesRecorded: group.outcomesRecorded,
      accuracyRate: group.accuracyRate,
      averageConfidence: group.averageConfidence,
      suggestion: group.confidenceAdjustmentSuggestion,
    })),
    auditEventCount: Array.isArray(auditEvents) ? auditEvents.length : 0,
  };
}
