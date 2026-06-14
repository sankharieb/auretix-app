import {
  getScoredSkus,
  integer,
  money,
  sampleSkuCsv,
} from "./sku-risk-model.js";
import { buildDailyExecutiveBriefing } from "./auretix-advisor-briefing.js";

const modelVersion = "ari-v1.0";

const supplierProfiles = [
  {
    id: "supplier_northstar",
    name: "Northstar Components",
    reliabilityAdjustment: -4,
    issueBias: "late inbound confirmations",
  },
  {
    id: "supplier_pacific",
    name: "Pacific Source Co",
    reliabilityAdjustment: 3,
    issueBias: "container and port timing variance",
  },
  {
    id: "supplier_rivermill",
    name: "RiverMill Wholesale",
    reliabilityAdjustment: -8,
    issueBias: "backup capacity and MOQ volatility",
  },
  {
    id: "supplier_orbit",
    name: "Orbit Fulfillment Supply",
    reliabilityAdjustment: 1,
    issueBias: "channel allocation changes",
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(Number.isFinite(value) ? value : 0);
}

function percent(value) {
  return `${round(value)}%`;
}

function supplierForItem(item, index = 0) {
  const keyedIndex =
    item.sku
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), index) % supplierProfiles.length;

  return supplierProfiles[keyedIndex];
}

function partnerSupportForItem(item) {
  if (item.serviceGapDays > 0 && item.inboundDelayRisk >= 35) {
    return {
      available: true,
      type: "freight",
      label: "Freight quote",
      mitigationScore: 7,
    };
  }

  if (item.supplierReliability < 72) {
    return {
      available: true,
      type: "backup-supplier",
      label: "Backup supplier",
      mitigationScore: 6,
    };
  }

  if (item.recommendedPo > 0 && item.cashRequired > 0) {
    return {
      available: true,
      type: "wholesale",
      label: "Wholesale source",
      mitigationScore: 4,
    };
  }

  if (item.locationIssue !== "No location break") {
    return {
      available: true,
      type: "third-party-logistics",
      label: "3PL support",
      mitigationScore: 5,
    };
  }

  return {
    available: false,
    type: "none",
    label: "No partner needed",
    mitigationScore: 0,
  };
}

export function getRiskLevel(score) {
  if (score >= 80) {
    return "Critical";
  }

  if (score >= 60) {
    return "High";
  }

  if (score >= 35) {
    return "Watch";
  }

  return "Low";
}

export function calculateProfitImpact(item) {
  const grossMarginRate = clamp(item.marginPct / 100, 0, 1);
  const revenueAtRisk = round(item.revenueAtRisk);
  const marginAtRisk = round(revenueAtRisk * grossMarginRate);
  const cashTiedUp = round(item.cashTrapped);
  const potentialStockoutLoss = round(
    Math.max(revenueAtRisk, item.serviceGapDays * item.dailyDemand * item.unitPrice),
  );
  const overstockExposure = round(cashTiedUp);
  const costOfDelay = round(
    Math.max(0, Math.min(item.serviceGapDays || 0, 14)) * item.dailyDemand * item.unitPrice,
  );
  const expediteCost = round((item.openPo || item.recommendedPo || item.dailyDemand * 7) * item.unitCost * 0.08);
  const transferCost = round(Math.max(350, item.dailyDemand * item.unitCost * 0.45));
  const sourceCost = round(Math.max(500, item.recommendedPo * item.unitCost * 0.05));
  const holdBenefit = round(overstockExposure * 0.28);
  const actionCost =
    item.recommendedMove === "Expedite inbound"
      ? expediteCost
      : item.recommendedMove === "Transfer stock"
        ? transferCost
        : item.recommendedMove === "Split supplier"
          ? sourceCost
          : item.recommendedMove === "Hold"
            ? 0
            : item.recommendedPo > 0
              ? round(item.cashRequired)
              : 0;
  const expectedBenefit = round(
    Math.max(potentialStockoutLoss + holdBenefit + marginAtRisk - actionCost, 0),
  );

  return {
    revenueAtRisk,
    marginAtRisk,
    cashTiedUp,
    potentialStockoutLoss,
    overstockExposure,
    costOfDelay,
    actionCost,
    expectedBenefit,
    expectedBenefitCopy:
      item.recommendedMove === "Expedite inbound"
        ? `Expedite inbound shipment for ${item.sku}. Estimated cost: ${money(actionCost)}. Expected avoided revenue loss: ${money(potentialStockoutLoss)}.`
        : item.recommendedMove === "Hold"
          ? `Hold new buying for ${item.sku}. Expected cash release or avoided overbuy exposure: ${money(holdBenefit)}.`
          : `${item.recommendedMove} for ${item.sku}. Expected benefit: ${money(expectedBenefit)} after modeled cost.`,
    assumptions: {
      grossMarginRate,
      dailyDemand: item.dailyDemand,
      leadTime: item.leadTime,
      modeledServiceGapDays: item.serviceGapDays,
    },
  };
}

function reasonSummaryFor(item, scoreParts) {
  const reasons = [];

  if (item.daysOfCover < item.inboundEtaDays) {
    reasons.push(`${item.daysOfCover.toFixed(1)} days cover vs inbound ETA ${item.inboundEtaDate}`);
  }

  if (item.supplierReliability < 75) {
    reasons.push(`${item.supplierReliability}% supplier reliability`);
  }

  if (item.cashTrapped > 0) {
    reasons.push(`${money(item.cashTrapped)} cash tied in excess cover`);
  }

  if (item.recommendedPo > 0) {
    reasons.push(`${integer(item.recommendedPo)} unit PO decision needs ${money(item.cashRequired)}`);
  }

  if (item.inboundDelayRisk >= 35) {
    reasons.push(`${item.inboundDelayRisk}/100 inbound ETA risk`);
  }

  if (!reasons.length) {
    const largestPart = Object.entries(scoreParts).sort((a, b) => b[1] - a[1])[0];
    reasons.push(`Highest pressure is ${largestPart?.[0] || "operating drift"}`);
  }

  return reasons.slice(0, 3).join("; ");
}

function recommendedActionFor(item, profitImpact, partnerSupport) {
  if (item.recommendedMove === "Expedite inbound") {
    return `Expedite inbound and request ${partnerSupport.label.toLowerCase()}`;
  }

  if (item.recommendedMove === "Split supplier") {
    return "Request backup supplier and split the next replenishment path";
  }

  if (item.recommendedMove === "Transfer stock") {
    return "Transfer stock toward the constrained channel";
  }

  if (item.recommendedMove === "Hold") {
    return "Hold buying and release cash before approving more units";
  }

  if (item.recommendedPo > 0 && profitImpact.expectedBenefit > item.cashRequired * 0.2) {
    return `Approve ${integer(item.recommendedPo)} unit PO with cash guardrail`;
  }

  return "Watch for drift and keep the SKU in daily queue";
}

export function calculateAuretixRiskIndex(item, options = {}) {
  const supplier = options.supplier || supplierForItem(item);
  const partnerSupport = options.partnerSupport || partnerSupportForItem(item);
  const adjustedSupplierReliability = clamp(
    item.supplierReliability + (supplier.reliabilityAdjustment || 0),
    0,
    100,
  );
  const profitImpact = calculateProfitImpact(item);
  const targetCover = Math.max(item.targetCoverDays, 1);
  const inventoryPressure = clamp((targetCover - item.daysOfCover) / targetCover, 0, 1) * 16;
  const velocityPressure = clamp(item.dailyDemand / Math.max(item.inventory, 1), 0, 1) * 8;
  const coverPressure = clamp((targetCover - item.coverAfterInbound) / targetCover, 0, 1) * 14;
  const forecastDemandPressure = clamp(item.monthlySales / 1800, 0, 1) * 8;
  const leadTimePressure = clamp(item.leadTime / 45, 0, 1) * 8;
  const supplierPressure = ((100 - adjustedSupplierReliability) / 100) * 12;
  const etaPressure = clamp(item.inboundDelayRisk / 100, 0, 1) * 10;
  const marginPressure = clamp((28 - item.marginPct) / 28, 0, 1) * 6;
  const revenuePressure = clamp(profitImpact.revenueAtRisk / 40000, 0, 1) * 8;
  const cashPressure = clamp(item.cashRequired / 30000, 0, 1) * 5;
  const overstockPressure = clamp(profitImpact.overstockExposure / 25000, 0, 1) * 5;
  const stockoutPressure = clamp(item.serviceGapDays / Math.max(item.leadTime, 1), 0, 1) * 8;
  const partnerMitigation = partnerSupport.available ? partnerSupport.mitigationScore : 0;
  const scoreParts = {
    inventory: inventoryPressure,
    velocity: velocityPressure,
    cover: coverPressure,
    forecast: forecastDemandPressure,
    leadTime: leadTimePressure,
    supplier: supplierPressure,
    inboundEta: etaPressure,
    margin: marginPressure,
    revenue: revenuePressure,
    cash: cashPressure,
    overstock: overstockPressure,
    stockout: stockoutPressure,
    partnerSupport: -partnerMitigation,
  };
  const score = clamp(round(Object.values(scoreParts).reduce((sum, value) => sum + value, 0)), 0, 100);
  const riskLevel = getRiskLevel(score);
  const recommendedAction = recommendedActionFor(item, profitImpact, partnerSupport);

  return {
    modelVersion,
    sku: item.sku,
    issueType:
      item.cashTrapped > 0
        ? "overstock"
        : item.serviceGapDays > 0
          ? "stockout"
          : item.supplierReliability < 75
            ? "supplier"
            : item.recommendedPo > 0
              ? "purchase-order"
              : "watch",
    score,
    riskLevel,
    scoreParts,
    reasonSummary: reasonSummaryFor(item, scoreParts),
    recommendedAction,
    financialImpactEstimate: profitImpact.expectedBenefit,
    confidence: clamp(
      round(52 + adjustedSupplierReliability * 0.24 + Math.min(item.monthlySales / 100, 16) - item.inboundDelayDays),
      35,
      92,
    ),
    partnerSupport,
    supplier: {
      id: supplier.id,
      name: supplier.name,
      adjustedReliability: adjustedSupplierReliability,
      issueBias: supplier.issueBias,
    },
  };
}

export function buildSupplierIntelligence(rows) {
  const supplierMap = new Map();

  rows.forEach((item, index) => {
    const supplier = supplierForItem(item, index);
    const current = supplierMap.get(supplier.id) || {
      id: supplier.id,
      supplierName: supplier.name,
      expectedLeadTime: 0,
      actualLeadTime: 0,
      totalDelay: 0,
      reliabilityScore: 0,
      onTimePercentage: 0,
      issueHistory: [],
      skuRelationships: [],
      poRelationships: [],
      skuCount: 0,
      lastPerformanceUpdate: new Date().toISOString(),
    };
    const expectedLeadTime = item.leadTime;
    const actualLeadTime = item.leadTime + item.inboundDelayDays;
    const adjustedReliability = clamp(item.supplierReliability + supplier.reliabilityAdjustment, 0, 100);

    current.expectedLeadTime += expectedLeadTime;
    current.actualLeadTime += actualLeadTime;
    current.totalDelay += Math.max(0, actualLeadTime - expectedLeadTime);
    current.reliabilityScore += adjustedReliability;
    current.onTimePercentage += clamp(adjustedReliability - item.inboundDelayDays * 2, 0, 100);
    current.skuCount += 1;
    current.skuRelationships.push({
      sku: item.sku,
      product: item.name,
      riskScore: item.riskScore,
      recommendedMove: item.recommendedMove,
    });
    current.poRelationships.push({
      poId: `PO-${item.sku.replace(/[^A-Z0-9]/gi, "").slice(-5)}`,
      sku: item.sku,
      units: item.openPo || item.recommendedPo,
      eta: item.inboundEtaDate,
      status: item.inboundDelayDays > 0 ? "eta risk" : "on plan",
    });

    if (item.inboundDelayDays > 0 || adjustedReliability < 75) {
      current.issueHistory.push({
        sku: item.sku,
        issue: supplier.issueBias,
        delayDays: item.inboundDelayDays,
        recordedAt: new Date().toISOString(),
      });
    }

    supplierMap.set(supplier.id, current);
  });

  return Array.from(supplierMap.values())
    .map((supplier) => ({
      ...supplier,
      expectedLeadTime: round(supplier.expectedLeadTime / supplier.skuCount),
      actualLeadTime: round(supplier.actualLeadTime / supplier.skuCount),
      averageDelay: round(supplier.totalDelay / supplier.skuCount),
      reliabilityScore: round(supplier.reliabilityScore / supplier.skuCount),
      onTimePercentage: round(supplier.onTimePercentage / supplier.skuCount),
    }))
    .sort((a, b) => a.reliabilityScore - b.reliabilityScore);
}

export function buildDecisionRecommendations(rows, options = {}) {
  return rows
    .map((item, index) => {
      const supplier = supplierForItem(item, index);
      const riskIndex = calculateAuretixRiskIndex(item, { supplier });
      const profitImpact = calculateProfitImpact(item);
      const problem =
        riskIndex.issueType === "stockout"
          ? `${item.sku} can lose sales before inbound arrives`
          : riskIndex.issueType === "overstock"
            ? `${item.sku} has cash trapped in slow cover`
            : riskIndex.issueType === "supplier"
              ? `${supplier.name} reliability is drifting`
              : riskIndex.issueType === "purchase-order"
                ? `${item.sku} needs a cash-aware PO call`
                : `${item.sku} should stay on watch`;

      return {
        id: `rec_${item.sku.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        sku: item.sku,
        product: item.name,
        issueType: riskIndex.issueType,
        recommendationType: item.recommendedMove,
        problem,
        whyItMatters: riskIndex.reasonSummary,
        financialImpact: riskIndex.financialImpactEstimate,
        recommendedAction: riskIndex.recommendedAction,
        confidence: riskIndex.confidence,
        riskIndex,
        profitImpact,
        supplier,
        partnerSupport: riskIndex.partnerSupport,
        status: options.decisionStatuses?.[item.sku] || "Pending",
        accuracyStatus: "pending",
        generatedAt: new Date().toISOString(),
      };
    })
    .sort(
      (a, b) =>
        b.riskIndex.score - a.riskIndex.score ||
        b.financialImpact - a.financialImpact ||
        b.confidence - a.confidence,
    );
}

export function buildPartnerNetworkIntelligence(recommendations, partnerRequests = []) {
  const partnerTypes = ["freight", "backup-supplier", "wholesale", "third-party-logistics"];

  return partnerTypes.map((partnerType) => {
    const relatedRecommendations = recommendations.filter(
      (item) => item.partnerSupport.type === partnerType,
    );
    const requests = partnerRequests.filter((request) => request.partnerType === partnerType);
    const solvedCount = requests.filter(
      (request) => request.status === "Closed" || request.outcome === "Solved",
    ).length;
    const matchedCount = requests.filter(
      (request) =>
        request.status === "Matched partner sent" ||
        request.matchedPartnerSnapshot ||
        request.matchedPartnerSentStatus === "sent",
    ).length;

    return {
      partnerType,
      matchRequestType:
        partnerType === "freight"
          ? "Need freight quote"
          : partnerType === "backup-supplier"
            ? "Need backup supplier"
            : partnerType === "wholesale"
              ? "Need wholesale source"
              : "Need 3PL support",
      requestStatus: requests.length ? `${requests.length} request(s)` : "No open request",
      consentStatus: requests.length ? "Seller consent captured" : "Consent needed when requested",
      referralDisclosureStatus: requests.length ? "Disclosure acknowledged" : "Disclosure ready",
      matchedPartnerSentStatus: matchedCount ? `${matchedCount} sent` : "Not sent",
      outcome: solvedCount ? `${solvedCount} solved` : "Pending proof",
      partnerSuccessRating: requests.length ? clamp(round(70 + solvedCount * 8 - (requests.length - solvedCount) * 3), 40, 95) : 72,
      timeToResponseHours: requests.length ? 18 : 36,
      solvedIssue: solvedCount > 0,
      opportunityCount: relatedRecommendations.length,
    };
  });
}

export function buildExecutiveCommandSummary(recommendations, supplierIntelligence, partnerIntelligence, decisionHistory = []) {
  const approved = decisionHistory.filter((decision) => decision.userAction === "approved").length;
  const pending = recommendations.filter((item) => item.status === "Pending").length;
  const estimatedLossesPrevented = decisionHistory.reduce(
    (sum, decision) =>
      decision.userAction === "approved"
        ? sum + (decision.estimatedFinancialImpact || decision.financialImpact || 0)
        : sum,
    0,
  );

  return {
    totalRevenueAtRisk: recommendations.reduce(
      (sum, item) => sum + item.profitImpact.revenueAtRisk,
      0,
    ),
    totalMarginAtRisk: recommendations.reduce(
      (sum, item) => sum + item.profitImpact.marginAtRisk,
      0,
    ),
    cashRequiredForRecommendedPos: recommendations.reduce(
      (sum, item) => sum + (item.issueType === "purchase-order" ? item.profitImpact.actionCost : 0),
      0,
    ),
    criticalSkus: recommendations.filter((item) => item.riskIndex.riskLevel === "Critical").length,
    supplierRisks: supplierIntelligence.filter((supplier) => supplier.reliabilityScore < 75).length,
    inboundRisks: recommendations.filter((item) => item.issueType === "stockout").length,
    partnerRequestsOpen: partnerIntelligence.reduce(
      (sum, partner) => sum + (partner.requestStatus === "No open request" ? 0 : 1),
      0,
    ),
    recommendationsPending: pending,
    recommendationsApproved: approved,
    estimatedLossesPrevented,
  };
}

function outcomeTime(outcome) {
  return new Date(outcome.recordedAt || outcome.createdAt || 0).getTime();
}

function normalizeOutcomeStatus(status) {
  if (status === "accurate" || status === "partially accurate" || status === "inaccurate") {
    return status;
  }

  return "pending";
}

export function buildOutcomeLearningSummary(decisionHistory = [], decisionOutcomes = []) {
  const decisionsById = new Map(decisionHistory.map((decision) => [decision.id, decision]));
  const approvedDecisionIds = new Set(
    decisionHistory
      .filter((decision) => decision.userAction === "approved")
      .map((decision) => decision.id),
  );
  const sortedOutcomes = [...decisionOutcomes].sort((left, right) => outcomeTime(right) - outcomeTime(left));
  const latestOutcomesByRecommendation = [];
  const seenRecommendations = new Set();

  for (const outcome of sortedOutcomes) {
    if (!outcome.recommendationId || seenRecommendations.has(outcome.recommendationId)) {
      continue;
    }

    seenRecommendations.add(outcome.recommendationId);
    latestOutcomesByRecommendation.push(outcome);
  }

  const enrichedOutcomes = sortedOutcomes.map((outcome) => {
    const decision = decisionsById.get(outcome.recommendationId) || {};
    const estimatedFinancialImpact = Number(decision.estimatedFinancialImpact || 0);
    const actualFinancialImpact = Number(outcome.actualFinancialImpact || 0);

    return {
      ...outcome,
      recommendationAction: decision.recommendedAction || "Recommendation unavailable",
      estimatedFinancialImpact,
      actualFinancialImpact,
      impactVariance: actualFinancialImpact - estimatedFinancialImpact,
    };
  });

  const latestEnrichedOutcomes = latestOutcomesByRecommendation.map((outcome) => {
    const decision = decisionsById.get(outcome.recommendationId) || {};
    const estimatedFinancialImpact = Number(decision.estimatedFinancialImpact || 0);
    const actualFinancialImpact = Number(outcome.actualFinancialImpact || 0);

    return {
      ...outcome,
      estimatedFinancialImpact,
      actualFinancialImpact,
      impactVariance: actualFinancialImpact - estimatedFinancialImpact,
    };
  });
  const totalOutcomes = latestEnrichedOutcomes.length;
  const accurateCount = latestEnrichedOutcomes.filter(
    (outcome) => normalizeOutcomeStatus(outcome.accuracyStatus) === "accurate",
  ).length;
  const partiallyAccurateCount = latestEnrichedOutcomes.filter(
    (outcome) => normalizeOutcomeStatus(outcome.accuracyStatus) === "partially accurate",
  ).length;
  const inaccurateCount = latestEnrichedOutcomes.filter(
    (outcome) => normalizeOutcomeStatus(outcome.accuracyStatus) === "inaccurate",
  ).length;
  const percent = (count) => (totalOutcomes ? Math.round((count / totalOutcomes) * 100) : 0);
  const estimatedFinancialImpact = latestEnrichedOutcomes.reduce(
    (sum, outcome) => sum + outcome.estimatedFinancialImpact,
    0,
  );
  const actualFinancialImpact = latestEnrichedOutcomes.reduce(
    (sum, outcome) => sum + outcome.actualFinancialImpact,
    0,
  );
  const lossesPrevented = latestEnrichedOutcomes.reduce((sum, outcome) => {
    if (normalizeOutcomeStatus(outcome.accuracyStatus) === "inaccurate") {
      return sum;
    }

    return sum + outcome.actualFinancialImpact;
  }, 0);

  return {
    totalOutcomes,
    accurateCount,
    partiallyAccurateCount,
    inaccurateCount,
    accuratePercent: percent(accurateCount),
    partiallyAccuratePercent: percent(partiallyAccurateCount),
    inaccuratePercent: percent(inaccurateCount),
    estimatedFinancialImpact,
    actualFinancialImpact,
    impactVariance: actualFinancialImpact - estimatedFinancialImpact,
    lossesPrevented,
    pendingOutcomeCount: decisionHistory.filter(
      (decision) => decision.userAction === "approved" && !seenRecommendations.has(decision.id),
    ).length,
    approvedRecommendationCount: approvedDecisionIds.size,
    recentOutcomes: enrichedOutcomes,
  };
}

export function buildMoatEngineSnapshot(options = {}) {
  const { rows } = getScoredSkus(options.csvText || sampleSkuCsv, options.cashBudget || 25000);
  const recommendations = buildDecisionRecommendations(rows, options);
  const supplierIntelligence = buildSupplierIntelligence(rows);
  const partnerIntelligence = buildPartnerNetworkIntelligence(
    recommendations,
    options.partnerRequests || [],
  );
  const decisionHistory = options.decisionHistory || [];
  const decisionOutcomes = options.decisionOutcomes || [];
  const executiveSummary = buildExecutiveCommandSummary(
    recommendations,
    supplierIntelligence,
    partnerIntelligence,
    decisionHistory,
  );
  const outcomeLearningSummary = buildOutcomeLearningSummary(decisionHistory, decisionOutcomes);
  const dailyBriefing = buildDailyExecutiveBriefing({
    recommendations,
    rows,
  });

  return {
    modelVersion,
    generatedAt: new Date().toISOString(),
    rows,
    recommendations,
    dailyDecisionQueue: recommendations,
    supplierIntelligence,
    partnerIntelligence,
    decisionHistory,
    decisionOutcomes,
    executiveSummary,
    outcomeLearningSummary,
    dailyBriefing,
  };
}

export { modelVersion };
