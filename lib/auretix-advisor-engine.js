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

  return `${money(value)} estimated impact`;
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

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildExecutiveBriefing(priorityIssues, healthSummary) {
  const issues = Array.isArray(priorityIssues) ? priorityIssues : [];
  const issueCount = issues.length;
  const stockoutIssues = issues.filter((issue) => issue.category === "Stockout Risk");
  const supplierIssues = issues.filter((issue) => issue.category === "Supplier Risk");
  const cashIssues = issues.filter((issue) => issue.category === "Cash Opportunity");
  const topStockouts = stockoutIssues.slice(0, 2);
  const urgentIssues = topStockouts.length ? topStockouts : issues.slice(0, 2);
  const urgentSkus = urgentIssues.map((issue) => issue.sku).filter(Boolean);
  const urgentExposure = urgentIssues.reduce(
    (sum, issue) => sum + safeNumber(issue.financialImpact),
    0,
  );
  const leadIssue = issues[0];
  const leadCategory = leadIssue?.category?.toLowerCase() || "operating";
  const recommendation =
    topStockouts.length >= 1
      ? "My recommendation is to expedite inbound shipments immediately."
      : leadIssue
        ? `My recommendation is to ${String(leadIssue.recommendation || leadIssue.recommendedAction || "review the highest-priority decision").replace(/\.$/, "").toLowerCase()}.`
        : "My recommendation is to keep monitoring today and review the decision queue when new data arrives.";
  const focusQuestion = "What would you like me to investigate?";

  if (!issueCount) {
    return {
      leadRisk:
        "I did not find an urgent issue that requires immediate action today.",
      consequence:
        "The current operating picture looks stable, but I will keep watching stockouts, supplier timing, cash exposure, and prior recommendation outcomes.",
      recommendation,
      additionalFindings: [
        "No critical stockout exposure is visible right now.",
        `${pluralize(safeNumber(healthSummary.supplierRisks), "supplier reliability concern")} still worth monitoring.`,
        `${pluralize(safeNumber(healthSummary.pendingRecommendations), "procurement decision")} awaiting review.`,
      ],
      focusQuestion,
    };
  }

  const riskSubject = urgentSkus.length
    ? `${leadCategory} exposure across ${urgentSkus.join(" and ")}`
    : `${leadCategory} exposure in today's operating queue`;
  const consequence =
    topStockouts.length >= 1
      ? `If nothing changes, those SKUs could expose approximately ${money(urgentExposure)} in revenue before inbound inventory arrives.`
      : `If nothing changes, those issues could expose approximately ${money(urgentExposure)} before the next recovery window.`;

  return {
    leadRisk: `The most urgent risk is ${riskSubject}.`,
    consequence,
    recommendation,
    additionalFindings: [
      `${pluralize(Math.max(0, supplierIssues.length || safeNumber(healthSummary.supplierRisks)), "supplier reliability concern")}.`,
      `${cashIssues.length ? pluralize(cashIssues.length, "cash exposure opportunity") : `${money(safeNumber(healthSummary.cashExposure))} in cash exposure to watch`}.`,
      `${pluralize(safeNumber(healthSummary.pendingRecommendations), "procurement decision")} awaiting review.`,
    ],
    focusQuestion,
  };
}

function buildAdvisorProblems(priorityIssues, healthSummary) {
  const issues = Array.isArray(priorityIssues) ? priorityIssues : [];
  const stockoutIssues = issues.filter((issue) => issue.category === "Stockout Risk");
  const supplierIssue =
    issues.find((issue) => issue.category === "Supplier Risk") ||
    issues.find((issue) => /supplier/i.test(issue.why || issue.issue || "")) ||
    null;
  const cashIssue =
    issues.find((issue) => issue.category === "Cash Opportunity") ||
    issues.find((issue) => /cash|buying|purchase order/i.test(issue.why || issue.issue || "")) ||
    null;
  const topStockout = stockoutIssues[0] || null;
  const stockoutSkus = stockoutIssues
    .slice(0, 2)
    .map((issue) => issue.sku)
    .filter(Boolean);
  const stockoutExposure = stockoutIssues
    .slice(0, 2)
    .reduce((sum, issue) => sum + safeNumber(issue.financialImpact), 0);
  const cashExposure =
    safeNumber(cashIssue?.financialImpact) || safeNumber(healthSummary.cashExposure);
  const supplierCount = Math.max(
    0,
    issues.filter((issue) => issue.category === "Supplier Risk").length ||
      safeNumber(healthSummary.supplierRisks),
  );

  return [
    {
      id: "stockout-investigation",
      label: "Stockout Risk",
      issue: topStockout
        ? `${stockoutSkus.length > 1 ? stockoutSkus.join(" and ") : topStockout.sku || "A priority SKU"} may run out before inbound arrives.`
        : "No urgent stockout risk is visible right now.",
      impactLabel: "Potential revenue exposure",
      impact: money(stockoutExposure || safeNumber(topStockout?.financialImpact)),
      recommendation: topStockout
        ? "Expedite inbound shipment."
        : "Keep monitoring cover and inbound timing.",
      href: "/app/supply-chain",
      actionLabel: "Investigate Stockouts",
    },
    {
      id: "cash-investigation",
      label: "Cash Opportunity",
      issue: cashExposure
        ? `${money(cashExposure)} is tied to buying or inventory decisions that should be sequenced.`
        : "No major cash exposure is visible right now.",
      impactLabel: "Cash exposure",
      impact: money(cashExposure),
      recommendation: cashIssue
        ? cashIssue.recommendation
        : "Review PO priority before funding lower-priority inventory.",
      href: "/app/procurement",
      actionLabel: "Investigate Cash",
    },
    {
      id: "supplier-investigation",
      label: "Supplier Risk",
      issue: supplierIssue
        ? supplierIssue.issue
        : supplierCount
          ? `${pluralize(supplierCount, "supplier reliability concern")} ${supplierCount === 1 ? "needs" : "need"} review.`
          : "Supplier reliability looks stable right now.",
      impactLabel: "Supplier concern",
      impact: supplierCount ? pluralize(supplierCount, "active concern") : "Stable",
      recommendation: supplierIssue
        ? supplierIssue.recommendation
        : supplierCount
          ? "Review backup supplier or partner support."
          : "Keep supplier monitoring active.",
      href: "/app/network",
      actionLabel: "Investigate Suppliers",
    },
  ];
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
  const healthSummary = buildHealthSummary(snapshot, learningAnalytics);
  const executiveBriefing = buildExecutiveBriefing(priorityIssues, healthSummary);
  const advisorProblems = buildAdvisorProblems(priorityIssues, healthSummary);
  const visibleIssueWord = advisorProblems.length === 1 ? "issue" : "issues";

  return {
    generatedAt: new Date().toISOString(),
    greeting: `Good ${dayPart()}, ${ownerFirstName(ownerName)}.`,
    summary: priorityIssues.length
      ? `Auretix found ${priorityIssues.length} ${issueWord} that need attention today.`
      : "Auretix did not find urgent business issues today.",
    reviewedStatement:
      "I reviewed inventory, supplier reliability, inbound timing, cash exposure, and previous recommendation outcomes.",
    findingSummary: advisorProblems.length
      ? `I found ${advisorProblems.length} ${visibleIssueWord} requiring attention today.`
      : "I did not find urgent business issues today.",
    closingLine: "Here is what matters most, why it matters, and what I recommend next.",
    reviewedSignals,
    priorityIssues,
    advisorProblems,
    healthSummary,
    executiveBriefing,
    learningAnalytics,
    recommendationPerformance,
    confidenceFeedback: confidenceBundle.confidenceFeedback,
  };
}
