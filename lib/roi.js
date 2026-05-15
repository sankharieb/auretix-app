import { buildDecisionQueue } from "./decision-queue.js";

function round(value) {
  return Math.round(Number(value) || 0);
}

function currency(value) {
  return `$${round(value).toLocaleString("en-US")}`;
}

function getLatestQueue(workspace, decisionRuns = []) {
  const latestRun = decisionRuns[0];

  if (latestRun?.queue) {
    return latestRun.queue;
  }

  return buildDecisionQueue(workspace.scenario, {
    workspaceOverride: workspace.workspaceState,
    supplierStrategyMemory: workspace.supplierStrategyMemory || {},
  });
}

export function buildRoiSnapshot(workspace, decisionRuns = [], integrations = []) {
  const queue = getLatestQueue(workspace, decisionRuns);
  const connectedProviders = integrations.filter(
    (integration) => integration.connectionStatus === "authorized",
  );
  const hasCommerceData = connectedProviders.some((integration) =>
    ["shopify", "amazon"].includes(integration.id),
  );
  const hasAccountingData = connectedProviders.some(
    (integration) => integration.id === "quickbooks",
  );
  const highRiskItems = queue.items.filter(
    (item) => item.priority === "Act now" || item.riskScore >= 62,
  );
  const stockoutRevenueProtected = highRiskItems.reduce(
    (sum, item) => sum + item.monthlyRevenue * 0.28,
    0,
  );
  const grossProfitProtected = highRiskItems.reduce(
    (sum, item) => sum + item.monthlyProfit * 0.28,
    0,
  );
  const excessCashAvoided = queue.items
    .filter((item) => item.inventoryStatus === "Excess" || item.playbook === "deprioritize")
    .reduce((sum, item) => sum + item.inventoryValue * 0.18, 0);
  const supplierDelayAvoided = queue.items
    .filter((item) => item.poRiskCount > 0 || item.supplierReliability < 75)
    .reduce((sum, item) => sum + item.cashImpact * 0.12, 0);
  const modeledMonthlyImpact =
    stockoutRevenueProtected * 0.18 +
    grossProfitProtected +
    excessCashAvoided +
    supplierDelayAvoided;
  const proofScore =
    35 +
    (hasCommerceData ? 30 : 0) +
    (hasAccountingData ? 25 : 0) +
    (decisionRuns.length >= 3 ? 10 : 0);

  return {
    proofScore: Math.min(100, proofScore),
    proofStatus:
      proofScore >= 85
        ? "ROI evidence ready"
        : proofScore >= 60
          ? "Evidence building"
          : "Modeled estimate",
    modeledMonthlyImpact: round(modeledMonthlyImpact),
    modeledAnnualImpact: round(modeledMonthlyImpact * 12),
    metrics: [
      {
        id: "stockout-revenue",
        label: "Revenue protected",
        value: currency(stockoutRevenueProtected),
        detail: "Modeled revenue protected by acting on high-risk products before coverage breaks.",
      },
      {
        id: "gross-profit",
        label: "Gross profit protected",
        value: currency(grossProfitProtected),
        detail: "Modeled gross profit tied to products that Auretix recommends protecting now.",
      },
      {
        id: "cash-avoided",
        label: "Overbuying avoided",
        value: currency(excessCashAvoided),
        detail: "Modeled cash preserved by keeping excess or weak-priority inventory lean.",
      },
      {
        id: "supplier-risk",
        label: "Supplier risk avoided",
        value: currency(supplierDelayAvoided),
        detail: "Modeled cash exposure reduced through supplier review, split awards, or escalation.",
      },
    ],
    proofInputs: [
      {
        label: "Commerce data",
        status: hasCommerceData ? "Connected" : "Needed",
        detail: "Shopify or Amazon order history proves real demand and stockout exposure.",
      },
      {
        label: "Accounting data",
        status: hasAccountingData ? "Connected" : "Needed",
        detail: "QuickBooks proves COGS, margin, vendor spend, and cash impact.",
      },
      {
        label: "Decision history",
        status: decisionRuns.length >= 3 ? "Enough runs" : `${decisionRuns.length} runs`,
        detail: "Saved decision runs let Auretix compare recommendations against outcomes.",
      },
    ],
    recommendation:
      hasCommerceData && hasAccountingData
        ? "Auretix can begin calculating evidence-backed ROI from actual demand, margin, and cash data."
        : "Connect Shopify or Amazon plus QuickBooks to move ROI from modeled estimate to proof.",
  };
}
