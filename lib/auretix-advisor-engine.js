import { buildDailyExecutiveBriefing } from "./auretix-advisor-briefing.js";
import { buildConfidenceFeedback } from "./moat-confidence-engine.js";
import { buildMoatEngineSnapshot } from "./moat-engine.js";
import { buildLearningAnalytics } from "./moat-learning-analytics.js";
import { buildRecommendationPerformance } from "./moat-recommendation-performance.js";
import { money } from "./sku-risk-model.js";

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

function ensurePeriod(value) {
  const cleaned = String(value || "").trim();

  if (!cleaned) {
    return "";
  }

  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function evidenceValue(evidence = [], prefix) {
  const line = evidence.find((item) => String(item).toLowerCase().startsWith(prefix.toLowerCase()));

  if (!line) {
    return "";
  }

  return String(line)
    .replace(new RegExp(`^${prefix}\\s*`, "i"), "")
    .replace(/\.$/, "")
    .trim();
}

function issueLine(issue) {
  const sku = issue.sku || "This SKU";

  if (issue.category === "Stockout Risk") {
    return `${sku} may stock out before inbound arrives.`;
  }

  if (issue.category === "Supplier Risk") {
    return `${sku} has supplier timing risk that may affect availability.`;
  }

  if (issue.category === "Procurement Decision") {
    return `${sku} needs a buy, defer, or watch decision before risk increases.`;
  }

  if (issue.category === "Partner Help Needed") {
    return `${sku} may need outside help before the issue gets expensive.`;
  }

  if (issue.category === "Cash Opportunity") {
    return `${sku} may be tying up cash in the wrong inventory.`;
  }

  if (issue.category === "Profit Opportunity") {
    return `${sku} has margin exposure worth protecting.`;
  }

  return ensurePeriod(issue.title || `${sku} needs review this week.`);
}

function recommendationLine(issue) {
  const recommendation = String(issue.recommendedAction || "").trim();

  if (!recommendation) {
    return "Review the recommendation and choose the next move.";
  }

  if (issue.category === "Stockout Risk" && /expedite/i.test(recommendation)) {
    return "Expedite inbound shipment.";
  }

  if (issue.category === "Supplier Risk" && /split/i.test(recommendation)) {
    return "Split supplier coverage or create a backup path.";
  }

  if (issue.category === "Partner Help Needed") {
    return "Request matched partner help.";
  }

  return ensurePeriod(recommendation);
}

function whyLine(issue) {
  const evidence = issue.evidence || [];
  const daysOfCover = evidenceValue(evidence, "Current inventory covers");
  const inboundEta = evidenceValue(evidence, "Inbound ETA is");
  const supplierReliability = evidenceValue(evidence, "Supplier reliability is");
  const purchaseOrderCash = evidenceValue(evidence, "Purchase order decision requires");
  const recommendedBuy = evidenceValue(evidence, "Recommended buy quantity is");

  if (issue.category === "Stockout Risk" && daysOfCover && inboundEta) {
    return `Inventory is projected to run out in ${daysOfCover}, while inbound inventory is not expected until ${inboundEta}.`;
  }

  if (issue.category === "Supplier Risk" && supplierReliability) {
    return `Supplier reliability is ${supplierReliability}, which can push replenishment past the safe service window.`;
  }

  if (issue.category === "Procurement Decision" && recommendedBuy && purchaseOrderCash) {
    return `The recommended buy is ${recommendedBuy}, and the purchase order would require ${purchaseOrderCash}.`;
  }

  if (issue.category === "Cash Opportunity" && purchaseOrderCash) {
    return `Cash pressure is visible in the buying plan, with ${purchaseOrderCash} tied to this decision.`;
  }

  return issue.evidence?.[0] || "Auretix detected an operating signal that needs review.";
}

function impactLine(issue) {
  const value = safeNumber(issue.financialImpact);

  if (issue.category === "Stockout Risk") {
    return `${money(value)} revenue exposure`;
  }

  if (issue.category === "Cash Opportunity") {
    return `${money(value)} cash exposure`;
  }

  if (issue.category === "Procurement Decision") {
    return `${money(value)} buying decision impact`;
  }

  if (issue.category === "Supplier Risk") {
    return `${money(value)} supplier timing exposure`;
  }

  if (issue.category === "Partner Help Needed") {
    return `${money(value)} issue exposure`;
  }

  return `${money(value)} modeled impact`;
}

function mapPriorityIssue(issue) {
  const actions = actionForCategory(issue.category);
  const evidence = issue.evidence || [];
  const consequences = issue.consequences || [];
  const confidenceReasoning = issue.confidenceReasoning || [];

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
    issue: issueLine(issue),
    recommendation: recommendationLine(issue),
    why: whyLine(issue),
    impact: impactLine(issue),
    actionLabel: actions.primaryActionLabel,
    actionHref: actions.primaryActionHref,
    detail: {
      evidence,
      ifIgnored: consequences,
      confidenceReasoning,
    },
    evidence,
    ifIgnored: consequences,
    confidence: issue.confidence,
    confidenceReasoning,
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
    reviewedStatement:
      "I reviewed inventory, supplier reliability, inbound timing, cash exposure, and previous recommendation outcomes.",
    findingSummary: priorityIssues.length
      ? `I found ${priorityIssues.length} ${issueWord} that need attention today.`
      : "I did not find urgent business issues today.",
    closingLine: "Here is what matters most, why it matters, and what I recommend next.",
    reviewedSignals,
    priorityIssues,
    healthSummary: buildHealthSummary(snapshot, learningAnalytics),
    learningAnalytics,
    recommendationPerformance,
    confidenceFeedback: confidenceBundle.confidenceFeedback,
  };
}
