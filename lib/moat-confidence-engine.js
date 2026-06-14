import { buildRecommendationPerformance } from "./moat-recommendation-performance.js";

const MIN_CONFIDENCE = 25;
const MAX_CONFIDENCE = 95;

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Math.round(safeNumber(value));
}

function clamp(value, min = MIN_CONFIDENCE, max = MAX_CONFIDENCE) {
  return Math.min(max, Math.max(min, round(value)));
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function plural(value, noun) {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function signed(value) {
  const rounded = round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function indexGroups(groups = []) {
  const index = new Map();

  for (const group of Array.isArray(groups) ? groups : []) {
    if (!group) {
      continue;
    }

    for (const key of [group.key, group.label]) {
      const normalized = normalizeKey(key);

      if (normalized && !index.has(normalized)) {
        index.set(normalized, group);
      }
    }
  }

  return index;
}

function findGroup(index, keys = []) {
  for (const key of keys) {
    const group = index.get(normalizeKey(key));

    if (group) {
      return group;
    }
  }

  return null;
}

function supplierFrom(recommendation = {}) {
  const supplier =
    recommendation.supplier ||
    recommendation.metadata?.supplier ||
    recommendation.riskIndex?.supplier ||
    {};

  return {
    id: supplier.id || supplier.supplierId || supplier.name || supplier.supplierName,
    name: supplier.name || supplier.supplierName || supplier.id || "Unknown supplier",
  };
}

function normalizeRuleType(value) {
  return String(value || "").trim().toLowerCase().replaceAll("-", "_");
}

function activeGuidanceRules(rules = []) {
  return (Array.isArray(rules) ? rules : []).filter(
    (rule) => rule?.status === "approved" && rule.ruleType && rule.targetValue,
  );
}

function guidanceRuleKey(ruleType, targetValue) {
  return `${normalizeRuleType(ruleType)}:${normalizeKey(targetValue)}`;
}

function indexGuidanceRules(rules = []) {
  const index = new Map();

  for (const rule of activeGuidanceRules(rules)) {
    const targets = [rule.targetValue, rule.targetKey, rule.label].filter(Boolean);

    for (const target of targets) {
      const key = guidanceRuleKey(rule.ruleType, target);
      const current = index.get(key) || [];
      current.push(rule);
      index.set(key, current);
    }
  }

  return index;
}

function findGuidanceRules(index, ruleType, targets = []) {
  const matches = [];
  const seen = new Set();

  for (const target of targets) {
    const rules = index.get(guidanceRuleKey(ruleType, target)) || [];

    for (const rule of rules) {
      if (!seen.has(rule.id)) {
        seen.add(rule.id);
        matches.push(rule);
      }
    }
  }

  return matches;
}

function guidanceAdjustmentFromRules(rules = []) {
  return rules.reduce(
    (sum, rule) => sum + safeNumber(rule.approvedAdjustment ?? rule.suggestedAdjustment),
    0,
  );
}

function latestOutcomeCount(decisionOutcomes = []) {
  const latest = new Map();

  for (const outcome of Array.isArray(decisionOutcomes) ? decisionOutcomes : []) {
    if (!outcome?.recommendationId || latest.has(outcome.recommendationId)) {
      continue;
    }

    latest.set(outcome.recommendationId, outcome);
  }

  return latest.size;
}

function recommendationTypeAdjustment(group) {
  if (!group?.outcomesRecorded) {
    return 0;
  }

  if (group.accuracyRate >= 95 && group.outcomesRecorded >= 5) {
    return 15;
  }

  if (group.accuracyRate >= 85 && group.outcomesRecorded >= 5) {
    return 12;
  }

  if (group.accuracyRate >= 70) {
    return 5;
  }

  if (group.accuracyRate >= 50) {
    return 0;
  }

  if (group.accuracyRate >= 35) {
    return -5;
  }

  return -10;
}

function supplierAdjustment(group) {
  if (!group?.outcomesRecorded) {
    return 0;
  }

  if (group.accuracyRate >= 85) {
    return 5;
  }

  if (group.accuracyRate >= 70) {
    return 2;
  }

  if (group.accuracyRate >= 50) {
    return 0;
  }

  if (group.accuracyRate >= 35) {
    return -2;
  }

  return -5;
}

function issueAdjustment(group) {
  if (!group?.outcomesRecorded) {
    return 0;
  }

  if (group.accuracyRate >= 80) {
    return 3;
  }

  if (group.accuracyRate >= 50) {
    return 0;
  }

  return -3;
}

function skuAdjustment(group) {
  if (!group?.outcomesRecorded) {
    return 0;
  }

  if (group.accurateCount >= 2 && group.inaccurateCount === 0) {
    return 2;
  }

  if (group.inaccurateCount >= 2) {
    return -2;
  }

  return 0;
}

function varianceAdjustment(...groups) {
  const group = groups
    .filter((candidate) => candidate?.outcomesRecorded && candidate?.estimatedFinancialImpact)
    .sort((left, right) => right.outcomesRecorded - left.outcomesRecorded)[0];

  if (!group) {
    return {
      adjustment: 0,
      varianceRate: 0,
      group: null,
    };
  }

  const varianceRate = Math.abs(safeNumber(group.variance)) / Math.max(1, safeNumber(group.estimatedFinancialImpact));

  if (varianceRate <= 0.1) {
    return {
      adjustment: 2,
      varianceRate,
      group,
    };
  }

  if (varianceRate <= 0.35) {
    return {
      adjustment: 0,
      varianceRate,
      group,
    };
  }

  return {
    adjustment: -2,
    varianceRate,
    group,
  };
}

function recommendationReason(group, adjustment, recommendationType) {
  if (!group?.outcomesRecorded) {
    return `${recommendationType || "This recommendation type"} has no recorded outcomes yet, so recommendation history stayed neutral.`;
  }

  const early = group.outcomesRecorded < 5 ? " early" : "";

  if (adjustment > 0) {
    return `${group.label} recommendations have ${group.accuracyRate}%${early} historical accuracy across ${plural(group.outcomesRecorded, "outcome")}, raising confidence by ${adjustment} points.`;
  }

  if (adjustment < 0) {
    return `${group.label} recommendations have ${group.accuracyRate}% historical accuracy across ${plural(group.outcomesRecorded, "outcome")}, lowering confidence by ${Math.abs(adjustment)} points.`;
  }

  return `${group.label} recommendations have ${group.accuracyRate}% historical accuracy, so recommendation history stayed neutral.`;
}

function supplierReason(group, adjustment, supplier) {
  const label = group?.label || supplier?.name || "Supplier";

  if (!group?.outcomesRecorded) {
    return `${label} does not have enough outcome-backed supplier history yet, so supplier confidence stayed neutral.`;
  }

  if (adjustment > 0) {
    return `${label} has ${group.accuracyRate}% outcome accuracy, improving supplier confidence by ${adjustment} points.`;
  }

  if (adjustment < 0) {
    return `${label} has ${group.accuracyRate}% outcome accuracy, reducing supplier confidence by ${Math.abs(adjustment)} points.`;
  }

  return `${label} has ${group.accuracyRate}% outcome accuracy, keeping supplier confidence stable.`;
}

function issueReason(group, adjustment, issueType) {
  const label = group?.label || issueType || "This issue category";

  if (!group?.outcomesRecorded) {
    return `${label} has no outcome-backed issue history yet, so issue confidence stayed neutral.`;
  }

  if (adjustment > 0) {
    return `${label} issue history is ${group.accuracyRate}% accurate, raising confidence by ${adjustment} points.`;
  }

  if (adjustment < 0) {
    return `${label} issue history is ${group.accuracyRate}% accurate, lowering confidence by ${Math.abs(adjustment)} points.`;
  }

  return `${label} issue history is ${group.accuracyRate}% accurate, so issue confidence stayed neutral.`;
}

function skuReason(group, adjustment, sku) {
  if (!group?.outcomesRecorded) {
    return `${sku || "This SKU"} has no repeated outcome pattern yet, so SKU history stayed neutral.`;
  }

  if (adjustment > 0) {
    return `${group.label} has repeated accurate outcomes, adding ${adjustment} points of SKU-specific confidence.`;
  }

  if (adjustment < 0) {
    return `${group.label} has repeated inaccurate outcomes, subtracting ${Math.abs(adjustment)} points of SKU-specific confidence.`;
  }

  return `${group.label} has ${plural(group.outcomesRecorded, "outcome")} without a repeated pattern, so SKU history stayed neutral.`;
}

function varianceReason(varianceResult) {
  if (!varianceResult.group) {
    return "Estimated-vs-actual impact variance is not mature enough yet, so variance confidence stayed neutral.";
  }

  const variancePercent = round(varianceResult.varianceRate * 100);

  if (varianceResult.adjustment > 0) {
    return `${varianceResult.group.label} estimates have low actual-vs-estimated variance (${variancePercent}%), adding ${varianceResult.adjustment} points.`;
  }

  if (varianceResult.adjustment < 0) {
    return `${varianceResult.group.label} estimates have high actual-vs-estimated variance (${variancePercent}%), subtracting ${Math.abs(varianceResult.adjustment)} points.`;
  }

  return `${varianceResult.group.label} estimates have medium actual-vs-estimated variance (${variancePercent}%), so variance stayed neutral.`;
}

function guidanceReason(appliedRules = []) {
  if (!appliedRules.length) {
    return "No approved model guidance rule matched this recommendation, so human governance stayed neutral.";
  }

  return appliedRules
    .map(
      (rule) =>
        `Approved ${rule.ruleType.replaceAll("_", " ")} guidance for ${rule.targetValue} applied ${signed(
          rule.approvedAdjustment ?? rule.suggestedAdjustment,
        )} confidence points.`,
    )
    .join(" ");
}

function summarizeRecommendation(recommendation, analysis) {
  return {
    id: recommendation.id,
    sku: recommendation.sku,
    product: recommendation.product || recommendation.problem || recommendation.sku,
    recommendationType: recommendation.recommendationType,
    issueType: recommendation.issueType,
    baseConfidence: analysis.baseConfidence,
    finalConfidence: analysis.finalConfidence,
    adjustment: analysis.finalConfidence - analysis.baseConfidence,
  };
}

function average(values = []) {
  const usable = values.filter((value) => Number.isFinite(Number(value)));

  return usable.length ? round(usable.reduce((sum, value) => sum + safeNumber(value), 0) / usable.length) : 0;
}

function buildModelLearningProgress(performance, analyses, decisionOutcomes) {
  const positiveAdjustments = analyses
    .map((item) => item.finalConfidence - item.baseConfidence)
    .filter((value) => value > 0);
  const negativeAdjustments = analyses
    .map((item) => item.finalConfidence - item.baseConfidence)
    .filter((value) => value < 0);

  return {
    totalOutcomesUsed: latestOutcomeCount(decisionOutcomes),
    recommendationTypesLearned: performance.recommendationTypeRankings.filter(
      (item) => item.outcomesRecorded > 0,
    ).length,
    suppliersLearned: performance.supplierRankings.filter((item) => item.outcomesRecorded > 0).length,
    skusLearned: performance.skuRankings.filter((item) => item.outcomesRecorded > 0).length,
    averageConfidenceUplift: average(positiveAdjustments),
    averageConfidenceReduction: average(negativeAdjustments),
  };
}

function guidanceCandidateReason(group, adjustment, ruleType) {
  const typeLabel = ruleType.replaceAll("_", " ");

  return `${group.label} has ${group.accuracyRate}% accuracy across ${plural(
    group.outcomesRecorded,
    "outcome",
  )}; Auretix suggests ${signed(adjustment)} ${typeLabel} guidance points for human review.`;
}

function buildGuidanceCandidate(ruleType, group, adjustment) {
  return {
    id: `candidate_${ruleType}_${normalizeKey(group.key || group.label).replace(/[^a-z0-9]+/g, "_")}`,
    ruleType,
    targetValue: group.label || group.key,
    targetKey: group.key,
    suggestedAdjustment: adjustment,
    reason: guidanceCandidateReason(group, adjustment, ruleType),
    outcomesRecorded: group.outcomesRecorded,
    accuracyRate: group.accuracyRate,
  };
}

function buildGuidanceCandidates(performance) {
  const candidates = [];

  for (const group of performance.recommendationTypeRankings || []) {
    const adjustment = recommendationTypeAdjustment(group);

    if (group.outcomesRecorded > 0 && adjustment !== 0) {
      candidates.push(buildGuidanceCandidate("recommendation_type", group, adjustment));
    }
  }

  for (const group of performance.supplierRankings || []) {
    const adjustment = supplierAdjustment(group);

    if (group.outcomesRecorded > 0 && adjustment !== 0) {
      candidates.push(buildGuidanceCandidate("supplier", group, adjustment));
    }
  }

  for (const group of performance.issueTypeRankings || []) {
    const adjustment = issueAdjustment(group);

    if (group.outcomesRecorded > 0 && adjustment !== 0) {
      candidates.push(buildGuidanceCandidate("issue_type", group, adjustment));
    }
  }

  for (const group of performance.skuRankings || []) {
    const adjustment = skuAdjustment(group);

    if (group.outcomesRecorded > 0 && adjustment !== 0) {
      candidates.push(buildGuidanceCandidate("sku", group, adjustment));
    }
  }

  return candidates
    .sort((left, right) => {
      const adjustmentDelta = Math.abs(right.suggestedAdjustment) - Math.abs(left.suggestedAdjustment);

      if (adjustmentDelta) {
        return adjustmentDelta;
      }

      return right.outcomesRecorded - left.outcomesRecorded;
    })
    .slice(0, 12);
}

export function buildConfidenceFeedback({
  recommendations = [],
  decisionRecommendations = [],
  decisionOutcomes = [],
  riskScores = [],
  profitImpactRecords = [],
  auditEvents = [],
  recommendationPerformance = null,
  modelGuidanceRules = [],
} = {}) {
  const performance =
    recommendationPerformance ||
    buildRecommendationPerformance({
      decisionRecommendations,
      decisionOutcomes,
      riskScores,
      profitImpactRecords,
      auditEvents,
    });
  const recommendationTypeIndex = indexGroups(performance.recommendationTypeRankings);
  const supplierIndex = indexGroups(performance.supplierRankings);
  const issueTypeIndex = indexGroups(performance.issueTypeRankings);
  const skuIndex = indexGroups(performance.skuRankings);
  const guidanceIndex = indexGuidanceRules(modelGuidanceRules);
  const decoratedRecommendations = (Array.isArray(recommendations) ? recommendations : []).map((recommendation) => {
    const supplier = supplierFrom(recommendation);
    const recommendationGroup = findGroup(recommendationTypeIndex, [
      recommendation.recommendationType,
      recommendation.recommendedMove,
      recommendation.recommendedAction,
    ]);
    const supplierGroup = findGroup(supplierIndex, [supplier.id, supplier.name]);
    const issueGroup = findGroup(issueTypeIndex, [
      recommendation.issueType,
      recommendation.riskIndex?.issueType,
    ]);
    const skuGroup = findGroup(skuIndex, [recommendation.sku]);
    const appliedGuidanceRules = [
      ...findGuidanceRules(guidanceIndex, "recommendation_type", [
        recommendation.recommendationType,
        recommendation.recommendedMove,
      ]),
      ...findGuidanceRules(guidanceIndex, "supplier", [supplier.id, supplier.name]),
      ...findGuidanceRules(guidanceIndex, "issue_type", [
        recommendation.issueType,
        recommendation.riskIndex?.issueType,
      ]),
      ...findGuidanceRules(guidanceIndex, "sku", [recommendation.sku]),
    ];
    const baseConfidence = clamp(
      recommendation.confidenceAnalysis?.baseConfidence ??
        recommendation.confidence ??
        recommendation.riskIndex?.confidence ??
        70,
    );
    const recommendationAdjustment = recommendationTypeAdjustment(recommendationGroup);
    const supplierHistoryAdjustment = supplierAdjustment(supplierGroup);
    const issueHistoryAdjustment = issueAdjustment(issueGroup);
    const skuHistoryAdjustment = skuAdjustment(skuGroup);
    const varianceResult = varianceAdjustment(recommendationGroup, skuGroup, issueGroup);
    const historicalAdjustment =
      recommendationAdjustment +
      supplierHistoryAdjustment +
      issueHistoryAdjustment +
      skuHistoryAdjustment +
      varianceResult.adjustment;
    const approvedGuidanceAdjustment = guidanceAdjustmentFromRules(appliedGuidanceRules);
    const finalConfidence = clamp(
      baseConfidence +
        historicalAdjustment +
        approvedGuidanceAdjustment,
    );
    const confidenceAnalysis = {
      baseConfidence,
      historicalAdjustment,
      recommendationAdjustment,
      supplierAdjustment: supplierHistoryAdjustment,
      issueAdjustment: issueHistoryAdjustment,
      skuAdjustment: skuHistoryAdjustment,
      varianceAdjustment: varianceResult.adjustment,
      approvedGuidanceAdjustment,
      finalConfidence,
      appliedGuidanceRules: appliedGuidanceRules.map((rule) => ({
        id: rule.id,
        ruleType: rule.ruleType,
        targetValue: rule.targetValue,
        approvedAdjustment: rule.approvedAdjustment ?? rule.suggestedAdjustment,
      })),
      confidenceReasoning: [
        recommendationReason(recommendationGroup, recommendationAdjustment, recommendation.recommendationType),
        supplierReason(supplierGroup, supplierHistoryAdjustment, supplier),
        issueReason(issueGroup, issueHistoryAdjustment, recommendation.issueType),
        skuReason(skuGroup, skuHistoryAdjustment, recommendation.sku),
        varianceReason(varianceResult),
        guidanceReason(appliedGuidanceRules),
      ],
    };

    return {
      ...recommendation,
      confidenceAnalysis,
    };
  });
  const analyses = decoratedRecommendations.map((recommendation) => recommendation.confidenceAnalysis);
  const summarizedRecommendations = decoratedRecommendations.map((recommendation) =>
    summarizeRecommendation(recommendation, recommendation.confidenceAnalysis),
  );
  const averageConfidenceAdjustment = average(
    summarizedRecommendations.map((recommendation) => recommendation.adjustment),
  );
  const highestConfidenceRecommendation = [...summarizedRecommendations].sort(
    (left, right) => right.finalConfidence - left.finalConfidence,
  )[0] || null;
  const lowestConfidenceRecommendation = [...summarizedRecommendations].sort(
    (left, right) => left.finalConfidence - right.finalConfidence,
  )[0] || null;
  const largestPositiveAdjustment = summarizedRecommendations
    .filter((recommendation) => recommendation.adjustment > 0)
    .sort((left, right) => right.adjustment - left.adjustment)[0] || null;
  const largestNegativeAdjustment = summarizedRecommendations
    .filter((recommendation) => recommendation.adjustment < 0)
    .sort((left, right) => left.adjustment - right.adjustment)[0] || null;
  const guidanceCandidates = buildGuidanceCandidates(performance);

  return {
    recommendations: decoratedRecommendations,
    confidenceFeedback: {
      averageConfidenceAdjustment,
      recommendationsUpgraded: summarizedRecommendations.filter((item) => item.adjustment > 0).length,
      recommendationsDowngraded: summarizedRecommendations.filter((item) => item.adjustment < 0).length,
      highestConfidenceRecommendation,
      lowestConfidenceRecommendation,
      largestPositiveAdjustment,
      largestNegativeAdjustment,
      modelLearningProgress: buildModelLearningProgress(performance, analyses, decisionOutcomes),
      guidanceCandidates,
      activeGuidanceRules: activeGuidanceRules(modelGuidanceRules).length,
      guidanceRulesInfluencingConfidence: analyses.filter(
        (analysis) => analysis.approvedGuidanceAdjustment !== 0,
      ).length,
      generatedAt: new Date().toISOString(),
      safetyMode: "human_approval_required",
      confidenceBounds: {
        minimum: MIN_CONFIDENCE,
        maximum: MAX_CONFIDENCE,
      },
      formulaSummary: [
        "Recommendation type history can move confidence from -10 to +15 points.",
        "Supplier history can move confidence from -5 to +5 points.",
        "Issue type history can move confidence from -3 to +3 points.",
        "Repeated SKU outcomes can move confidence from -2 to +2 points.",
        "Estimated-vs-actual variance can move confidence from -2 to +2 points.",
        "Approved model guidance rules can add or subtract human-reviewed adjustment points.",
        `Final confidence is clamped between ${MIN_CONFIDENCE}% and ${MAX_CONFIDENCE}%.`,
      ],
    },
  };
}

export function formatConfidenceAdjustment(value) {
  return `${signed(value)}%`;
}
