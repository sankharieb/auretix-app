import { buildDailyExecutiveBriefing } from "./auretix-advisor-briefing.js";
import { buildConfidenceFeedback } from "./moat-confidence-engine.js";
import { buildMoatEngineSnapshot } from "./moat-engine.js";
import { buildLearningAnalytics } from "./moat-learning-analytics.js";
import { buildRecommendationPerformance } from "./moat-recommendation-performance.js";
import { integer, money } from "./sku-risk-model.js";

const reviewedSignals = [
  "inventory",
  "supplier reliability",
  "inbound timing",
  "cash exposure",
  "decision outcomes",
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
    return "Current conditions should be reviewed before a decision is made.";
  }

  if (issue.category === "Stockout Risk" && /expedite/i.test(recommendation)) {
    return "Current projections indicate a potential service gap before replenishment arrives.";
  }

  if (issue.category === "Supplier Risk" && /split/i.test(recommendation)) {
    return "Supplier performance indicates a backup path may need review.";
  }

  if (issue.category === "Partner Help Needed") {
    return "Partner support is available if the seller chooses to explore it.";
  }

  const neutralized = recommendation
    .replace(/^Approve\s+/i, "A purchase decision exists for ")
    .replace(/^Expedite\s+/i, "Inbound acceleration is one available path for ")
    .replace(/^Split\s+/i, "A split-source path is available for review for ")
    .replace(/^Request\s+/i, "Partner support can be reviewed for ");

  return ensurePeriod(neutralized);
}

function responsePathsFor(category, issue = {}) {
  const pathsByCategory = {
    "Stockout Risk": [
      "Review inbound acceleration",
      "Review inventory redistribution",
      "Review alternative suppliers",
      "Monitor current conditions",
    ],
    "Cash Opportunity": [
      "Review purchase sequencing",
      "Reduce exposure to slow inventory",
      "Hold lower-priority buying",
      "Monitor cash pressure",
    ],
    "Supplier Risk": [
      "Review backup supplier coverage",
      "Review order split options",
      "Review partner support",
      "Monitor supplier trend",
    ],
    "Procurement Decision": [
      "Review purchase quantity",
      "Review cash guardrail",
      "Defer the purchase decision",
      "Monitor demand assumptions",
    ],
    "Partner Help Needed": [
      "Request matched partner options",
      "Review freight support",
      "Review supplier alternatives",
      "Monitor without partner help",
    ],
  };

  const paths = pathsByCategory[category] || [
    "Review source data",
    "Adjust forecast assumptions",
    "Monitor current conditions",
  ];

  if (issue?.partnerSupport?.available && !paths.includes("Review partner support")) {
    return [...paths.slice(0, 3), "Review partner support"];
  }

  return paths;
}

function whyLine(issue) {
  const evidence = issue.evidence || [];
  const daysOfCover = evidenceValue(evidence, "Current inventory covers");
  const inboundEta = evidenceValue(evidence, "Inbound ETA is");
  const supplierReliability = evidenceValue(evidence, "Supplier reliability is");
  const purchaseOrderCash = evidenceValue(evidence, "Purchase order decision requires");
  const potentialBuy = evidenceValue(evidence, "Potential buy quantity is");

  if (issue.category === "Stockout Risk" && daysOfCover && inboundEta) {
    return `Inventory is projected to run out in ${daysOfCover}, while inbound inventory is not expected until ${inboundEta}.`;
  }

  if (issue.category === "Supplier Risk" && supplierReliability) {
    return `Supplier reliability is ${supplierReliability}, which can push replenishment past the safe service window.`;
  }

  if (issue.category === "Procurement Decision" && potentialBuy && purchaseOrderCash) {
    return `The modeled buy path is ${potentialBuy}, and the purchase order would require ${purchaseOrderCash}.`;
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
  const responsePaths = responsePathsFor(issue.category, issue);
  const evidenceDrilldown = buildEvidenceDrilldown(issue, responsePaths);

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
    projection: recommendationLine(issue),
    recommendation: recommendationLine(issue),
    responsePaths,
    why: whyLine(issue),
    impact: impactLine(issue),
    rowSnapshot: issue.rowSnapshot || {},
    profitImpact: issue.profitImpact || {},
    riskIndex: issue.riskIndex || {},
    partnerSupport: issue.partnerSupport || {},
    actionLabel: actions.primaryActionLabel,
    actionHref: actions.primaryActionHref,
    detail: {
      evidence,
      ifIgnored: consequences,
      confidenceReasoning,
    },
    evidenceDrilldown,
    evidence,
    ifIgnored: consequences,
    confidence: issue.confidence,
    confidenceReasoning,
    confidenceSummary: confidenceSummary(issue),
    ...actions,
  };
}

function trendLinesFor(issue, row) {
  const lines = [];
  const daysOfCover = safeNumber(row.daysOfCover);
  const inboundEtaDays = safeNumber(row.inboundEtaDays);
  const serviceGapDays = safeNumber(row.serviceGapDays);
  const supplierReliability = safeNumber(row.supplierReliability);
  const cashTrapped = safeNumber(row.cashTrapped);
  const inboundDelayRisk = safeNumber(row.inboundDelayRisk);

  if (daysOfCover && inboundEtaDays) {
    const coverageDelta = daysOfCover - inboundEtaDays;
    lines.push(
      coverageDelta >= 0
        ? `Coverage is ${coverageDelta.toFixed(1)} days above the inbound ETA.`
        : `Coverage is ${Math.abs(coverageDelta).toFixed(1)} days below the inbound ETA.`,
    );
  }

  if (serviceGapDays > 0) {
    lines.push(`Projected service gap is ${serviceGapDays.toFixed(1)} days under current assumptions.`);
  }

  if (supplierReliability > 0) {
    lines.push(
      supplierReliability < 75
        ? `Supplier reliability is below the 75% watch threshold.`
        : `Supplier reliability is above the watch threshold.`,
    );
  }

  if (cashTrapped > 0) {
    lines.push(`${money(cashTrapped)} appears tied to excess or slow-moving cover.`);
  }

  if (inboundDelayRisk > 0) {
    lines.push(`Inbound ETA risk is ${Math.round(inboundDelayRisk)}/100.`);
  }

  return lines.slice(0, 4);
}

function calculationLinesFor(issue, row) {
  const dailyDemand = safeNumber(row.dailyDemand);
  const inventory = safeNumber(row.inventory);
  const daysOfCover = safeNumber(row.daysOfCover);
  const inboundEtaDays = safeNumber(row.inboundEtaDays);
  const serviceGapDays = safeNumber(row.serviceGapDays);
  const unitPrice = safeNumber(row.unitPrice);
  const revenueExposure = safeNumber(issue.financialImpact || row.revenueAtRisk);
  const cashRequired = safeNumber(row.cashRequired);
  const recommendedPo = safeNumber(row.recommendedPo);
  const cashTrapped = safeNumber(row.cashTrapped);
  const lines = [];

  if (inventory) {
    lines.push(`Current inventory: ${integer(inventory)} units`);
  }

  if (dailyDemand) {
    lines.push(`Daily demand: ${dailyDemand.toFixed(1)} units`);
  }

  if (daysOfCover) {
    lines.push(`Days of cover: ${daysOfCover.toFixed(2)}`);
  }

  if (inboundEtaDays) {
    lines.push(`Inbound ETA: ${inboundEtaDays.toFixed(1)} days`);
  }

  if (serviceGapDays > 0) {
    lines.push(`Projected service gap: ${serviceGapDays.toFixed(2)} days`);
  }

  if (revenueExposure > 0 && serviceGapDays > 0 && dailyDemand && unitPrice) {
    const baseExposure = serviceGapDays * dailyDemand * unitPrice;

    if (Math.abs(baseExposure - revenueExposure) / Math.max(revenueExposure, 1) < 0.05) {
      lines.push(
        `Revenue exposure estimate: ${serviceGapDays.toFixed(2)} days x ${dailyDemand.toFixed(1)} units/day x ${money(unitPrice)} = ${money(revenueExposure)}`,
      );
    } else {
      lines.push(
        `Base revenue exposure: ${serviceGapDays.toFixed(2)} days x ${dailyDemand.toFixed(1)} units/day x ${money(unitPrice)} = ${money(baseExposure)}`,
      );
      lines.push(`Adjusted projected exposure used in the queue: ${money(revenueExposure)}.`);
    }
  } else if (revenueExposure > 0) {
    lines.push(`Exposure estimate: ${money(revenueExposure)}`);
  }

  if (recommendedPo > 0) {
    lines.push(`Potential PO quantity: ${integer(recommendedPo)} units`);
  }

  if (cashRequired > 0) {
    lines.push(`Cash required estimate: ${integer(recommendedPo)} units x unit cost = ${money(cashRequired)}`);
  }

  if (cashTrapped > 0) {
    lines.push(`Cash exposure estimate: excess cover x unit cost = ${money(cashTrapped)}`);
  }

  return lines.slice(0, 8);
}

function buildEvidenceDrilldown(issue, responsePaths = []) {
  const row = issue.rowSnapshot || {};
  const riskIndex = issue.riskIndex || {};
  const profitImpact = issue.profitImpact || {};
  const confidence = safeNumber(issue.confidence);
  const evidence = issue.evidence || [];
  const confidenceReasoning = issue.confidenceReasoning || [];

  return {
    currentState: [
      safeNumber(row.daysOfCover) > 0 ? `Inventory coverage: ${safeNumber(row.daysOfCover).toFixed(1)} days` : "",
      safeNumber(row.inventory) > 0 ? `Inventory on hand: ${integer(row.inventory)} units` : "",
      safeNumber(row.dailyDemand) > 0 ? `Current demand rate: ${safeNumber(row.dailyDemand).toFixed(1)} units/day` : "",
      safeNumber(row.supplierReliability) > 0 ? `Supplier reliability: ${Math.round(row.supplierReliability)}%` : "",
      safeNumber(row.cashRequired) > 0 ? `Cash required if purchase path is selected: ${money(row.cashRequired)}` : "",
    ].filter(Boolean),
    trend: trendLinesFor(issue, row),
    projection: [
      `${impactLine(issue)} under current assumptions.`,
      safeNumber(row.serviceGapDays) > 0 ? `Projected service gap: ${safeNumber(row.serviceGapDays).toFixed(1)} days.` : "",
      safeNumber(profitImpact.costOfDelay) > 0 ? `Cost of delay estimate: ${money(profitImpact.costOfDelay)}.` : "",
    ].filter(Boolean),
    assumptions: [
      safeNumber(row.dailyDemand) > 0 ? `Demand uses current SKU velocity of ${safeNumber(row.dailyDemand).toFixed(1)} units/day.` : "",
      safeNumber(row.inboundEtaDays) > 0 ? `Inbound ETA assumption is ${safeNumber(row.inboundEtaDays).toFixed(1)} days.` : "",
      safeNumber(row.leadTime) > 0 ? `Lead-time assumption is ${safeNumber(row.leadTime).toFixed(1)} days.` : "",
      safeNumber(row.supplierReliability) > 0 ? `Supplier reliability assumption is ${Math.round(row.supplierReliability)}%.` : "",
      riskIndex.modelVersion ? `Risk index version: ${riskIndex.modelVersion}.` : "Forecast uses seeded SKU velocity, supplier reliability, and inbound timing until live integrations are connected.",
    ].filter(Boolean),
    calculation: calculationLinesFor(issue, row),
    confidence: {
      score: confidence,
      drivers: confidenceReasoning.length
        ? confidenceReasoning
        : ["Confidence uses current inventory, supplier reliability, demand velocity, and available outcome history."],
    },
    evidence: evidence.length ? evidence : ["Current operating data is sufficient for a watch-state signal."],
    responsePaths,
  };
}

function average(values) {
  const usable = values.map(safeNumber).filter((value) => value > 0);

  if (!usable.length) {
    return 0;
  }

  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function buildFallbackEvidenceDrilldown({
  currentState = [],
  trend = [],
  projection = [],
  assumptions = [],
  calculation = [],
  confidenceScore = 0,
  confidenceDrivers = [],
  evidence = [],
  responsePaths = [],
} = {}) {
  return {
    currentState,
    trend,
    projection,
    assumptions,
    calculation,
    confidence: {
      score: confidenceScore,
      drivers: confidenceDrivers.length
        ? confidenceDrivers
        : ["Confidence uses the current operating snapshot until more outcome history is available."],
    },
    evidence: evidence.length ? evidence : ["Current operating data is sufficient for a watch-state signal."],
    responsePaths,
  };
}

function buildGroupedStockoutEvidenceDrilldown(issues = [], responsePaths = []) {
  const stockoutIssues = issues.filter(Boolean);

  if (!stockoutIssues.length) {
    return buildFallbackEvidenceDrilldown({
      currentState: ["No urgent stockout exposure is visible in the current snapshot."],
      trend: ["Coverage and inbound timing should continue to be monitored."],
      projection: ["Current projections support continued monitoring."],
      assumptions: ["Uses current SKU velocity, inventory, and inbound timing signals."],
      calculation: ["No active stockout exposure is included in this summary."],
      responsePaths,
    });
  }

  if (stockoutIssues.length === 1) {
    return stockoutIssues[0].evidenceDrilldown;
  }

  const totalExposure = stockoutIssues.reduce(
    (sum, issue) => sum + safeNumber(issue.financialImpact),
    0,
  );
  const skus = stockoutIssues.map((issue) => issue.sku).filter(Boolean);
  const calculation = stockoutIssues.map((issue) => {
    const row = issue.rowSnapshot || {};
    const serviceGapDays = safeNumber(row.serviceGapDays);
    const dailyDemand = safeNumber(row.dailyDemand);
    const unitPrice = safeNumber(row.unitPrice);
    const exposure = safeNumber(issue.financialImpact || row.revenueAtRisk);

    if (serviceGapDays > 0 && dailyDemand > 0 && unitPrice > 0) {
      const baseExposure = serviceGapDays * dailyDemand * unitPrice;

      if (Math.abs(baseExposure - exposure) / Math.max(exposure, 1) < 0.05) {
        return `${issue.sku}: ${serviceGapDays.toFixed(2)} days x ${dailyDemand.toFixed(1)} units/day x ${money(unitPrice)} = ${money(exposure)}`;
      }

      return `${issue.sku}: base revenue exposure is ${money(baseExposure)} from ${serviceGapDays.toFixed(2)} days x ${dailyDemand.toFixed(1)} units/day x ${money(unitPrice)}; adjusted projected exposure is ${money(exposure)}.`;
    }

    return `${issue.sku}: Exposure estimate is ${money(exposure)}.`;
  });

  calculation.push(`Combined projected exposure: ${money(totalExposure)}.`);

  return buildFallbackEvidenceDrilldown({
    currentState: stockoutIssues.map((issue) => {
      const row = issue.rowSnapshot || {};

      return `${issue.sku}: ${safeNumber(row.daysOfCover).toFixed(1)} days of cover, ${safeNumber(row.inboundEtaDays).toFixed(1)} days to inbound ETA.`;
    }),
    trend: stockoutIssues.flatMap((issue) => {
      const row = issue.rowSnapshot || {};
      const serviceGapDays = safeNumber(row.serviceGapDays);
      const supplierReliability = safeNumber(row.supplierReliability);
      const lines = [];

      if (serviceGapDays > 0) {
        lines.push(`${issue.sku}: projected service gap is ${serviceGapDays.toFixed(1)} days.`);
      }

      if (supplierReliability > 0) {
        lines.push(`${issue.sku}: supplier reliability is ${Math.round(supplierReliability)}%.`);
      }

      return lines;
    }).slice(0, 6),
    projection: [
      `${skus.join(" and ")} may create combined revenue exposure of ${money(totalExposure)} under current assumptions.`,
      `${stockoutIssues.length} SKUs show coverage below inbound timing.`,
    ],
    assumptions: [
      `Demand uses current SKU velocity for ${skus.join(" and ")}.`,
      "Inbound ETA and supplier reliability are taken from the current operating snapshot.",
      "Exposure assumes no inventory movement, acceleration, or supplier change before inbound arrives.",
    ],
    calculation,
    confidenceScore: average(stockoutIssues.map((issue) => issue.confidence)),
    confidenceDrivers: [
      "Confidence reflects the combined inventory coverage, inbound ETA, supplier reliability, and prior decision history for these SKUs.",
      ...stockoutIssues.flatMap((issue) => issue.confidenceReasoning || []).slice(0, 2),
    ],
    evidence: stockoutIssues.flatMap((issue) =>
      (issue.evidence || []).map((line) => `${issue.sku}: ${line}`),
    ).slice(0, 8),
    responsePaths,
  });
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
  const responseContext =
    topStockouts.length >= 1
      ? "Available response paths include inbound acceleration review, inventory redistribution review, alternative supplier review, or continued monitoring."
      : leadIssue
        ? `Available response paths include ${responsePathsFor(leadIssue.category, leadIssue).slice(0, 3).join(", ").toLowerCase()}, or monitoring.`
        : "Current conditions can continue to be monitored until new operational data changes the picture.";
  const focusQuestion = "Which area would you like to investigate?";

  if (!issueCount) {
    return {
      leadRisk:
        "No major operational break is visible in the current data.",
      consequence:
        "The current operating picture looks stable across stockouts, supplier timing, cash exposure, and prior decision outcomes.",
      responseContext,
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
      ? `Under current assumptions, revenue exposure may reach approximately ${money(urgentExposure)} before replenishment arrives.`
      : `Under current assumptions, projected exposure may reach approximately ${money(urgentExposure)} before the next recovery window.`;

  return {
    leadRisk: `The largest projected exposure currently originates from ${riskSubject}.`,
    consequence,
    responseContext,
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
  const stockoutResponsePaths = topStockout
    ? responsePathsFor("Stockout Risk", topStockout)
    : ["Monitor current conditions", "Review inbound timing"];
  const cashResponsePaths = cashIssue
    ? cashIssue.responsePaths
    : responsePathsFor("Cash Opportunity", cashIssue);
  const supplierResponsePaths = supplierIssue
    ? supplierIssue.responsePaths
    : responsePathsFor("Supplier Risk", supplierIssue);
  const stockoutEvidenceDrilldown = buildGroupedStockoutEvidenceDrilldown(
    stockoutIssues.slice(0, 2),
    stockoutResponsePaths,
  );
  const cashEvidenceDrilldown =
    cashIssue?.evidenceDrilldown ||
    buildFallbackEvidenceDrilldown({
      currentState: [`Cash exposure visible in the current operating snapshot: ${money(cashExposure)}.`],
      trend: ["Cash pressure is visible through purchase sequencing and inventory exposure."],
      projection: ["Current cash exposure is visible in inventory and purchase sequencing."],
      assumptions: [
        "Cash exposure uses active purchase-order costs and cash tied up in inventory signals.",
        "Live bank, marketplace payout, and accounting integrations will improve this estimate.",
      ],
      calculation: [
        `Current cash exposure estimate: ${money(cashExposure)}.`,
        "Formula path: purchase-order cash required + modeled cash tied up in inventory.",
      ],
      confidenceScore: cashIssue?.confidence || 52,
      confidenceDrivers: [
        "Confidence is limited until live accounting and payout data are connected.",
        "Current estimate uses seeded SKU risk and purchase sequencing data.",
      ],
      evidence: [`Cash exposure currently shown in the Advisor snapshot is ${money(cashExposure)}.`],
      responsePaths: cashResponsePaths,
    });
  const supplierEvidenceDrilldown =
    supplierIssue?.evidenceDrilldown ||
    buildFallbackEvidenceDrilldown({
      currentState: supplierCount
        ? [`${pluralize(supplierCount, "supplier reliability concern")} visible in the current snapshot.`]
        : ["Supplier reliability looks stable in the current snapshot."],
      trend: supplierCount
        ? ["Supplier activity has enough variance to review backup coverage."]
        : ["No supplier trend is currently above the watch threshold."],
      projection: supplierCount
        ? ["Supplier activity has enough variance to review backup coverage."]
        : ["Supplier activity supports continued monitoring."],
      assumptions: [
        "Supplier signal uses expected lead time, actual timing, reliability, and issue history where available.",
        "Live supplier and inbound records will improve this estimate.",
      ],
      calculation: [
        `Active supplier concerns counted: ${supplierCount}.`,
        "Formula path: supplier reliability score + lead-time variance + inbound delay signal.",
      ],
      confidenceScore: supplierIssue?.confidence || (supplierCount ? 58 : 42),
      confidenceDrivers: [
        "Confidence uses available supplier reliability and inbound timing signals.",
        "Outcome history will increase or reduce this confidence as supplier events are recorded.",
      ],
      evidence: supplierCount
        ? [`${pluralize(supplierCount, "supplier reliability concern")} currently appears in the operating queue.`]
        : ["No active supplier concern appears in the current operating queue."],
      responsePaths: supplierResponsePaths,
    });

  return [
    {
      id: "stockout-investigation",
      label: "Stockout Projection",
      issue: topStockout
        ? `${stockoutSkus.length > 1 ? stockoutSkus.join(" and ") : topStockout.sku || "A priority SKU"} show a coverage gap before inbound arrives.`
        : "No urgent stockout risk is visible right now.",
      impactLabel: "Potential revenue exposure",
      impact: money(stockoutExposure || safeNumber(topStockout?.financialImpact)),
      projection: topStockout
        ? "Current projections indicate a potential service gap before replenishment arrives."
        : "Current projections support continued monitoring.",
      responsePaths: stockoutResponsePaths,
      confidence: topStockout?.confidence || 0,
      evidenceDrilldown: stockoutEvidenceDrilldown,
      href: "/app/supply-chain",
      actionLabel: "Investigate Stockouts",
    },
    {
      id: "cash-investigation",
      label: "Cash Exposure",
      issue: cashExposure
        ? `${money(cashExposure)} is tied to buying or inventory decisions that should be sequenced.`
        : "No major cash exposure is visible right now.",
      impactLabel: "Cash exposure",
      impact: money(cashExposure),
      projection: cashIssue
        ? cashIssue.projection
        : "Current cash exposure is visible in inventory and purchase sequencing.",
      responsePaths: cashResponsePaths,
      confidence: cashIssue?.confidence || 0,
      evidenceDrilldown: cashEvidenceDrilldown,
      href: "/app/procurement",
      actionLabel: "Investigate Cash",
    },
    {
      id: "supplier-investigation",
      label: "Supplier Trend",
      issue: supplierIssue
        ? supplierIssue.issue
        : supplierCount
          ? `${pluralize(supplierCount, "supplier reliability concern")} ${supplierCount === 1 ? "needs" : "need"} review.`
          : "Supplier reliability looks stable right now.",
      impactLabel: "Supplier concern",
      impact: supplierCount ? pluralize(supplierCount, "active concern") : "Stable",
      projection: supplierIssue
        ? supplierIssue.projection
        : supplierCount
          ? "Supplier activity has enough variance to review backup coverage."
          : "Supplier activity supports continued monitoring.",
      responsePaths: supplierResponsePaths,
      confidence: supplierIssue?.confidence || 0,
      evidenceDrilldown: supplierEvidenceDrilldown,
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
  const visibleIssueWord = advisorProblems.length === 1 ? "change was" : "changes were";

  return {
    generatedAt: new Date().toISOString(),
    greeting: `Good ${dayPart()}, ${ownerFirstName(ownerName)}.`,
    summary: priorityIssues.length
      ? `Auretix detected ${priorityIssues.length} notable ${issueWord} in the current operating data.`
      : "Auretix did not detect urgent business changes in the current data.",
    reviewedStatement:
      "I reviewed inventory, supplier reliability, inbound timing, cash exposure, and previous decision outcomes.",
    findingSummary: advisorProblems.length
      ? `${advisorProblems.length === 1 ? "One" : "Three"} notable operational ${visibleIssueWord} detected across inventory, cash, and supplier activity.`
      : "No urgent operational changes were detected in the current data.",
    closingLine: "Here is the current state, evidence, confidence, and possible response paths.",
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
