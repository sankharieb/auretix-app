import { integer, money } from "./sku-risk-model.js";

const categoryRank = {
  "Stockout Risk": 7,
  "Supplier Risk": 6,
  "Procurement Decision": 5,
  "Partner Help Needed": 4,
  "Cash Opportunity": 3,
  "Profit Opportunity": 2,
  "Forecast Concern": 1,
};

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shortDate(value) {
  if (!value) {
    return "not confirmed";
  }

  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
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

function rowForRecommendation(recommendation, rowsBySku) {
  return rowsBySku.get(recommendation.sku) || {};
}

function supplierReliability(recommendation, row) {
  return safeNumber(
    recommendation.riskIndex?.supplier?.adjustedReliability ??
      row.supplierReliability ??
      recommendation.supplier?.reliabilityScore,
    0,
  );
}

function classifyIssue(recommendation, row = {}) {
  const issueType = String(recommendation.issueType || recommendation.riskIndex?.issueType || "").toLowerCase();
  const partnerSupport = recommendation.partnerSupport || recommendation.riskIndex?.partnerSupport || {};
  const recommendedAction = String(recommendation.recommendedAction || "").toLowerCase();

  if (issueType === "stockout" || safeNumber(row.serviceGapDays) > 0) {
    return "Stockout Risk";
  }

  if (issueType === "supplier" || supplierReliability(recommendation, row) < 72) {
    return "Supplier Risk";
  }

  if (issueType === "purchase-order" || /po|purchase|buy|approve/.test(recommendedAction)) {
    return "Procurement Decision";
  }

  if (partnerSupport.available) {
    return "Partner Help Needed";
  }

  if (issueType === "overstock" || safeNumber(recommendation.profitImpact?.cashTiedUp) > 0) {
    return "Cash Opportunity";
  }

  if (safeNumber(recommendation.profitImpact?.marginAtRisk) > 25000) {
    return "Profit Opportunity";
  }

  return "Forecast Concern";
}

function categoryTitle(category, recommendation, row = {}) {
  const sku = recommendation.sku || "This SKU";

  if (category === "Stockout Risk") {
    return `${sku} can lose sales before inbound arrives`;
  }

  if (category === "Supplier Risk") {
    const supplier = recommendation.riskIndex?.supplier?.name || recommendation.supplier?.name || "A supplier";
    return `${supplier} is creating timing risk for ${sku}`;
  }

  if (category === "Procurement Decision") {
    return `${sku} needs a buying decision before risk increases`;
  }

  if (category === "Partner Help Needed") {
    return `${sku} may need outside help to resolve the issue`;
  }

  if (category === "Cash Opportunity") {
    return `${sku} may be tying up cash in the wrong inventory`;
  }

  if (category === "Profit Opportunity") {
    return `${sku} has margin exposure worth protecting`;
  }

  return `${sku} demand should be watched this week`;
}

function evidenceFor(category, recommendation, row = {}) {
  const riskIndex = recommendation.riskIndex || {};
  const profitImpact = recommendation.profitImpact || {};
  const partnerSupport = recommendation.partnerSupport || riskIndex.partnerSupport || {};
  const evidence = [];

  if (safeNumber(row.daysOfCover) > 0) {
    evidence.push(`Current inventory covers ${safeNumber(row.daysOfCover).toFixed(1)} days.`);
  }

  if (row.inboundEtaDate) {
    evidence.push(`Inbound ETA is ${shortDate(row.inboundEtaDate)}.`);
  }

  const reliability = supplierReliability(recommendation, row);
  if (reliability > 0) {
    evidence.push(`Supplier reliability is ${Math.round(reliability)}%.`);
  }

  const cashRequired = safeNumber(row.cashRequired || profitImpact.actionCost);
  if (cashRequired > 0 && category !== "Cash Opportunity") {
    evidence.push(`Purchase order decision requires ${money(cashRequired)}.`);
  }

  if (safeNumber(row.recommendedPo) > 0) {
    evidence.push(`Recommended buy quantity is ${integer(row.recommendedPo)} units.`);
  }

  if (safeNumber(profitImpact.marginAtRisk) > 0) {
    evidence.push(`Modeled margin at risk is ${money(profitImpact.marginAtRisk)}.`);
  }

  if (safeNumber(profitImpact.cashTiedUp) > 0) {
    evidence.push(`Cash tied up is ${money(profitImpact.cashTiedUp)}.`);
  }

  if (partnerSupport.available) {
    evidence.push(`${partnerSupport.label || "Partner support"} is available as a mitigation path.`);
  }

  evidence.push(`Risk score is ${safeNumber(riskIndex.score)}/100.`);

  return evidence.filter(Boolean).slice(0, 5);
}

function consequencesFor(category, recommendation, row = {}) {
  const profitImpact = recommendation.profitImpact || {};
  const consequences = [];

  if (category === "Stockout Risk") {
    consequences.push("Projected stockout before inbound coverage is safe.");
  } else if (category === "Supplier Risk") {
    consequences.push("Supplier delay can push replenishment past the service window.");
  } else if (category === "Procurement Decision") {
    consequences.push("A purchase order decision may wait until the SKU has less room to recover.");
  } else if (category === "Partner Help Needed") {
    consequences.push("The issue may stay unresolved without a freight, supplier, wholesale, or 3PL path.");
  } else if (category === "Cash Opportunity") {
    consequences.push("Cash may stay trapped in slow or excessive cover.");
  } else if (category === "Profit Opportunity") {
    consequences.push("Margin can leak through delay, stockout, or wrong buying timing.");
  } else {
    consequences.push("Demand movement may turn into a late purchase or service issue.");
  }

  if (safeNumber(row.serviceGapDays) > 0) {
    consequences.push(`Service gap could last ${safeNumber(row.serviceGapDays).toFixed(1)} days.`);
  }

  if (safeNumber(profitImpact.revenueAtRisk) > 0) {
    consequences.push(`Estimated revenue exposure: ${money(profitImpact.revenueAtRisk)}.`);
  }

  if (safeNumber(profitImpact.marginAtRisk) > 0) {
    consequences.push(`Estimated margin exposure: ${money(profitImpact.marginAtRisk)}.`);
  }

  if (safeNumber(profitImpact.costOfDelay) > 0) {
    consequences.push(`Modeled cost of delay: ${money(profitImpact.costOfDelay)}.`);
  }

  return consequences.slice(0, 4);
}

function confidenceReasoningFor(recommendation) {
  const analysis = recommendation.confidenceAnalysis || {};
  const reasoning = [];
  const baseConfidence = safeNumber(analysis.baseConfidence ?? recommendation.confidence, 0);
  const historicalAdjustment = safeNumber(analysis.historicalAdjustment, 0);
  const supplierAdjustment = safeNumber(analysis.supplierAdjustment, 0);
  const guidanceAdjustment = safeNumber(analysis.approvedGuidanceAdjustment, 0);

  if (baseConfidence > 0) {
    reasoning.push(`Base confidence was ${Math.round(baseConfidence)}%.`);
  }

  if (historicalAdjustment > 0) {
    reasoning.push("Historical recommendation performance increased confidence.");
  } else if (historicalAdjustment < 0) {
    reasoning.push("Historical recommendation performance reduced confidence.");
  } else {
    reasoning.push("Historical recommendation performance is still neutral.");
  }

  if (supplierAdjustment > 0) {
    reasoning.push("Supplier history increased confidence.");
  } else if (supplierAdjustment < 0) {
    reasoning.push("Supplier history reduced confidence.");
  }

  if (guidanceAdjustment !== 0) {
    reasoning.push(`Approved guidance rules adjusted confidence by ${guidanceAdjustment > 0 ? "+" : ""}${Math.round(guidanceAdjustment)} points.`);
  } else {
    reasoning.push("Approved guidance rules may adjust final confidence if available.");
  }

  if (Array.isArray(analysis.confidenceReasoning) && analysis.confidenceReasoning.length) {
    reasoning.push(...analysis.confidenceReasoning.slice(0, 1));
  }

  return reasoning.slice(0, 5);
}

function nextStepFor(category, recommendation) {
  const partnerSupport = recommendation.partnerSupport || recommendation.riskIndex?.partnerSupport || {};

  if (partnerSupport.available) {
    return `Review the recommendation, then approve the action or request ${String(partnerSupport.label || "partner help").toLowerCase()}.`;
  }

  if (category === "Procurement Decision") {
    return "Review the PO recommendation and approve, defer, or watch it today.";
  }

  if (category === "Stockout Risk") {
    return "Review the recommendation and decide whether to expedite, split, or request help.";
  }

  return "Review the recommendation and choose approve, defer, or watch.";
}

function priorityScore(item) {
  return (
    categoryRank[item.category] * 1000000 +
    safeNumber(item.rawRiskScore) * 10000 +
    safeNumber(item.financialImpact)
  );
}

function buildBriefingItem(recommendation, row, index) {
  const category = classifyIssue(recommendation, row);
  const confidence = safeNumber(
    recommendation.confidenceAnalysis?.finalConfidence ?? recommendation.confidence,
    0,
  );

  return {
    id: `briefing_${recommendation.id || recommendation.sku || index}`,
    recommendationId: recommendation.id,
    category,
    title: categoryTitle(category, recommendation, row),
    sku: recommendation.sku,
    severity: recommendation.riskIndex?.riskLevel || "Watch",
    financialImpact: safeNumber(recommendation.financialImpact || recommendation.profitImpact?.expectedBenefit),
    recommendedAction: recommendation.recommendedAction || recommendation.riskIndex?.recommendedAction || "Review recommendation",
    reasonIntro: "Why I'm recommending this:",
    evidence: evidenceFor(category, recommendation, row),
    consequenceIntro: "If no action is taken:",
    consequences: consequencesFor(category, recommendation, row),
    confidence,
    confidenceReasoning: confidenceReasoningFor(recommendation),
    nextStep: nextStepFor(category, recommendation),
    rawRiskScore: recommendation.riskIndex?.score || 0,
  };
}

export function buildDailyExecutiveBriefing({
  recommendations = [],
  rows = [],
  ownerName = "Michel",
  limit = 3,
} = {}) {
  const rowsBySku = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.sku, row]));
  const items = (Array.isArray(recommendations) ? recommendations : [])
    .map((recommendation, index) =>
      buildBriefingItem(recommendation, rowForRecommendation(recommendation, rowsBySku), index),
    )
    .sort((left, right) => priorityScore(right) - priorityScore(left))
    .slice(0, Math.max(1, Math.min(limit, 5)));
  const firstName = ownerFirstName(ownerName);
  const issueWord = items.length === 1 ? "issue" : "issues";

  return {
    greeting: `Good ${dayPart()} ${firstName}.`,
    summary: items.length
      ? `You have ${items.length} ${issueWord} requiring attention today.`
      : "No urgent issues require attention today.",
    generatedAt: new Date().toISOString(),
    items,
  };
}
