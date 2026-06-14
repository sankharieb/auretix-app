import { buildDailyExecutiveBriefing } from "./auretix-advisor-briefing.js";
import { buildConfidenceFeedback } from "./moat-confidence-engine.js";
import { buildMoatEngineSnapshot } from "./moat-engine.js";
import { buildLearningAnalytics } from "./moat-learning-analytics.js";
import { buildRecommendationPerformance } from "./moat-recommendation-performance.js";

const reviewedSignals = [
  "inventory",
  "supplier reliability",
  "inbound timing",
  "cash exposure",
  "recommendation outcomes",
];

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dayPart() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "morning";
  }

  if (hour < 17) {
    return "afternoon";
  }

  return "evening";
}

function ownerFirstName(ownerName) {
  const cleaned = String(ownerName || "").trim();

  if (!cleaned || /demo|preview|owner|visitor|example/i.test(cleaned)) {
    return "Michel";
  }

  return cleaned.split(/\s+/)[0] || "Michel";
}

function actionForCategory(category) {
  if (category === "Stockout Risk") {
    return {
      primaryActionLabel: "Review stockout plan",
      primaryActionHref: "/app/supply-chain",
      secondaryActionLabel: "Review SKU risk",
      secondaryActionHref: "/app/sku-risk",
    };
  }

  if (category === "Cash Opportunity") {
    return {
      primaryActionLabel: "Review cash plan",
      primaryActionHref: "/app/procurement",
      secondaryActionLabel: "Review SKU risk",
      secondaryActionHref: "/app/sku-risk",
    };
  }

  if (category === "Supplier Risk") {
    return {
      primaryActionLabel: "Review supplier risk",
      primaryActionHref: "/app/supply-chain",
      secondaryActionLabel: "Find partner help",
      secondaryActionHref: "/app/network",
    };
  }

  if (category === "Partner Help Needed") {
    return {
      primaryActionLabel: "Request partner help",
      primaryActionHref: "/app/network",
      secondaryActionLabel: "Review flow risk",
      secondaryActionHref: "/app/supply-chain",
    };
  }

  if (category === "Procurement Decision") {
    return {
      primaryActionLabel: "Review buying decision",
      primaryActionHref: "/app/procurement",
      secondaryActionLabel: "Review learning",
      secondaryActionHref: "/app/moat",
    };
  }

  if (category === "Profit Opportunity") {
    return {
      primaryActionLabel: "Review profit risk",
      primaryActionHref: "/app/sku-risk",
      secondaryActionLabel: "Review learning",
      secondaryActionHref: "/app/moat",
    };
  }

  return {
    primaryActionLabel: "Review forecast signal",
    primaryActionHref: "/app/sku-risk",
    secondaryActionLabel: "Review learning",
    secondaryActionHref: "/app/moat",
  };
}

function confidenceSummary(issue) {
  const reasoning = Array.isArray(issue.confidenceReasoning) ? issue.confidenceReasoning : [];
  const firstReason =
    reasoning.find((reason) => /historical|supplier|guidance|base/i.test(reason)) ||
    "Confidence is based on current risk, supplier, and inventory signals.";

  return `Why confidence is ${Math.round(safeNumber(issue.confidence))}%: ${firstReason}`;
}

function mapPriorityIssue(issue) {
  const actions = actionForCategory(issue.category);

  return {
    id: issue.id,
    recommendationId: issue.recommendationId,
    category: issue.category,
    severity: issue.severity,
    title: issue.title.endsWith(".") ? issue.title : `${issue.title}.`,
    sku: issue.sku,
    financialImpact: issue.financialImpact,
    recommendedAction: issue.recommendedAction,
    whyItMatters: issue.evidence?.[0] || "Auretix detected an operating signal that needs review.",
    evidence: issue.evidence || [],
    ifIgnored: issue.consequences || [],
    confidence: issue.confidence,
    confidenceReasoning: issue.confidenceReasoning || [],
    confidenceSummary: confidenceSummary(issue),
    ...actions,
  };
}

function buildHealthSummary(snapshot, learningAnalytics) {
  const recommendations = snapshot.recommendations || [];
  const executiveSummary = snapshot.executiveSummary || {};
  const cashExposure = recommendations.reduce(
    (sum, item) =>
      sum +
      safeNumber(item.profitImpact?.cashTiedUp) +
      (item.issueType === "purchase-order" ? safeNumber(item.profitImpact?.actionCost) : 0),
    0,
  );

  return {
    revenueAtRisk: safeNumber(executiveSummary.totalRevenueAtRisk),
    marginAtRisk: safeNumber(executiveSummary.totalMarginAtRisk),
    cashExposure,
    supplierRisks: safeNumber(executiveSummary.supplierRisks),
    inboundRisks: safeNumber(executiveSummary.inboundRisks),
    pendingRecommendations: safeNumber(executiveSummary.recommendationsPending),
    outcomesRecorded: safeNumber(learningAnalytics.outcomesRecorded),
  };
}

export function buildAuretixAdvisorCommandCenter(options = {}) {
  const ownerName = options.ownerName || "Michel";
  const snapshot =
    options.snapshot ||
    buildMoatEngineSnapshot({
      decisionHistory: options.decisionHistory || [],
      decisionOutcomes: options.decisionOutcomes || [],
      partnerRequests: options.partnerRequests || [],
    });
  const recommendationPerformance = buildRecommendationPerformance({
    decisionRecommendations: snapshot.decisionHistory || [],
    decisionOutcomes: snapshot.decisionOutcomes || [],
  });
  const confidenceBundle = buildConfidenceFeedback({
    recommendations: snapshot.recommendations || [],
    decisionRecommendations: snapshot.decisionHistory || [],
    decisionOutcomes: snapshot.decisionOutcomes || [],
    recommendationPerformance,
    modelGuidanceRules: options.modelGuidanceRules || [],
  });
  const learningAnalytics = buildLearningAnalytics({
    decisionRecommendations: snapshot.decisionHistory || [],
    decisionOutcomes: snapshot.decisionOutcomes || [],
  });
  const briefing = buildDailyExecutiveBriefing({
    recommendations: confidenceBundle.recommendations,
    rows: snapshot.rows || [],
    ownerName,
    limit: options.limit || 4,
  });
  const priorityIssues = briefing.items.map(mapPriorityIssue);
  const issueWord = priorityIssues.length === 1 ? "business issue" : "business issues";

  return {
    generatedAt: new Date().toISOString(),
    greeting: `Good ${dayPart()}, ${ownerFirstName(ownerName)}.`,
    summary: priorityIssues.length
      ? `Auretix found ${priorityIssues.length} ${issueWord} that need attention today.`
      : "Auretix did not find urgent business issues today.",
    reviewedSignals,
    priorityIssues,
    healthSummary: buildHealthSummary(snapshot, learningAnalytics),
    learningAnalytics,
    recommendationPerformance,
    confidenceFeedback: confidenceBundle.confidenceFeedback,
  };
}
