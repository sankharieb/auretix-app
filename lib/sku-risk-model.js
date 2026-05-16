export const sampleSkuCsv = `sku,name,category,inventory,monthly_sales,open_po,lead_time_days,supplier_reliability,unit_cost,unit_price,min_cover_days,amazon_inventory,shopify_inventory,warehouse_primary,warehouse_secondary,inbound_eta_days,inbound_delay_days
ATX-HERO-01,Hero SKU,Ecommerce,228,1800,320,28,74,12,32,14,72,48,180,48,35,7
ATX-LAUNCH-04,Launch SKU,Ecommerce,151,1300,0,35,62,18,44,14,41,35,140,11,49,14
ATX-CORE-02,Core Reorder,Retail,920,1450,240,21,86,9,24,12,380,180,510,410,24,3
ATX-MARGIN-07,Margin Repair,Wholesale,660,540,0,42,68,28,39,18,210,120,610,50,48,6
ATX-TAIL-11,Slow Tail,Consumer brand,2100,420,0,25,81,7,18,10,700,260,980,1120,25,0`;

const requiredColumns = [
  "sku",
  "name",
  "inventory",
  "monthly_sales",
  "lead_time_days",
  "supplier_reliability",
  "unit_cost",
  "unit_price",
];

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function parseSkuCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      records: [],
      warnings: ["Paste CSV data with one header row and at least one SKU row."],
    };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  const warnings = missingColumns.length
    ? [`Missing recommended columns: ${missingColumns.join(", ")}.`]
    : [];

  const records = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const record = { rowNumber: rowIndex + 2 };
    headers.forEach((header, index) => {
      record[header] = cells[index] || "";
    });
    return record;
  });

  return { records, warnings };
}

export function numberFrom(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function integer(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + Math.ceil(days));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function priorityClass(priority) {
  return priority.toLowerCase().replace(/\s+/g, "-");
}

export function scoreSku(record, cashBudget = 25000) {
  const sku = record.sku || `ROW-${record.rowNumber}`;
  const name = record.name || sku;
  const category = record.category || "Uncategorized";
  const inventory = Math.max(0, numberFrom(record.inventory));
  const monthlySales = Math.max(0, numberFrom(record.monthly_sales));
  const openPo = Math.max(0, numberFrom(record.open_po));
  const leadTime = Math.max(1, numberFrom(record.lead_time_days, 21));
  const supplierReliability = clamp(numberFrom(record.supplier_reliability, 75), 0, 100);
  const unitCost = Math.max(0, numberFrom(record.unit_cost));
  const unitPrice = Math.max(0, numberFrom(record.unit_price));
  const minCoverDays = Math.max(7, numberFrom(record.min_cover_days, 14));
  const amazonInventory = Math.max(0, numberFrom(record.amazon_inventory, inventory * 0.55));
  const shopifyInventory = Math.max(0, numberFrom(record.shopify_inventory, inventory * 0.25));
  const warehousePrimary = Math.max(0, numberFrom(record.warehouse_primary, inventory * 0.65));
  const warehouseSecondary = Math.max(0, numberFrom(record.warehouse_secondary, inventory * 0.35));
  const inboundEtaDays = Math.max(1, numberFrom(record.inbound_eta_days, leadTime));
  const inboundDelayDays = Math.max(0, numberFrom(record.inbound_delay_days, 0));
  const dailyDemand = Math.max(0.1, monthlySales / 30);
  const daysOfCover = inventory / dailyDemand;
  const coverAfterInbound = (inventory + openPo) / dailyDemand;
  const targetCoverDays = leadTime + minCoverDays;
  const targetUnits = Math.ceil(dailyDemand * targetCoverDays);
  const recommendedPo = Math.max(0, targetUnits - inventory - openPo);
  const cashRequired = recommendedPo * unitCost;
  const marginPct = unitPrice > 0 ? ((unitPrice - unitCost) / unitPrice) * 100 : 0;
  const serviceGapDays = Math.max(0, inboundEtaDays - daysOfCover);
  const coveragePressure = clamp((targetCoverDays - coverAfterInbound) / targetCoverDays, 0, 1);
  const supplierPressure = (100 - supplierReliability) / 100;
  const marginPressure = clamp((25 - marginPct) / 25, 0, 1);
  const budgetPressure = cashBudget > 0 ? clamp(cashRequired / cashBudget, 0, 1) : 0;
  const riskScore = Math.round(
    coveragePressure * 45 +
      supplierPressure * 22 +
      marginPressure * 13 +
      budgetPressure * 10 +
      clamp(serviceGapDays / Math.max(leadTime, 1), 0, 1) * 10,
  );
  const revenueAtRisk = Math.round(serviceGapDays * dailyDemand * unitPrice);
  const excessUnits = Math.max(0, inventory + openPo - dailyDemand * (targetCoverDays + 30));
  const cashTrapped = Math.round(excessUnits * unitCost);
  const proofValue = Math.round(revenueAtRisk + cashTrapped * 0.35);
  const stockoutDate = addDays(daysOfCover);
  const inboundEtaDate = addDays(inboundEtaDays);
  const inboundDelayRisk = Math.round(
    (100 - supplierReliability) * 0.55 + inboundDelayDays * 6 + serviceGapDays * 0.6,
  );
  const amazonCoverDays = amazonInventory / Math.max(dailyDemand * 0.62, 0.1);
  const shopifyCoverDays = shopifyInventory / Math.max(dailyDemand * 0.38, 0.1);
  const locationImbalancePct =
    Math.abs(warehousePrimary - warehouseSecondary) /
    Math.max(warehousePrimary + warehouseSecondary, 1) *
    100;
  const channelAvailability =
    amazonCoverDays < 10 && shopifyCoverDays < 10
      ? "Amazon and Shopify exposed"
      : amazonCoverDays < 10
        ? "Amazon availability risk"
        : shopifyCoverDays < 10
          ? "Shopify availability risk"
          : daysOfCover < inboundEtaDays
            ? "Primary channel exposed"
            : "Channels covered";
  const locationIssue =
    locationImbalancePct > 55
      ? "Warehouse/location imbalance"
      : category.toLowerCase().includes("retail") || category.toLowerCase().includes("wholesale")
        ? "Regional allocation check"
        : daysOfCover < inboundEtaDays
          ? "Fulfillment node pressure"
          : "No location break";
  const recommendedMove =
    serviceGapDays > 10 && inboundDelayDays > 0
      ? "Expedite inbound"
      : locationImbalancePct > 55 && daysOfCover < targetCoverDays
        ? "Transfer stock"
        : supplierReliability < 70
          ? "Split supplier"
          : cashTrapped > 0
            ? "Hold"
            : daysOfCover < inboundEtaDays
              ? "Protect channel"
              : "Watch";
  const flowDecision =
    recommendedMove === "Expedite inbound"
      ? "Expedite"
      : recommendedMove === "Transfer stock"
        ? "Transfer"
        : recommendedMove === "Split supplier"
          ? "Split"
          : recommendedMove === "Hold"
            ? "Hold"
            : recommendedMove === "Protect channel"
              ? "Protect"
              : "Watch";
  const action =
    recommendedPo > 0
      ? `Buy ${integer(recommendedPo)} units`
      : cashTrapped > 0
        ? "Do not reorder, release trapped cash first"
        : "Watch only";
  const priority =
    riskScore >= 70 ? "Critical" : riskScore >= 45 ? "Watch" : "Healthy";

  return {
    sku,
    name,
    category,
    inventory,
    monthlySales,
    openPo,
    leadTime,
    supplierReliability,
    unitCost,
    unitPrice,
    minCoverDays,
    amazonInventory,
    shopifyInventory,
    warehousePrimary,
    warehouseSecondary,
    inboundEtaDays,
    inboundDelayDays,
    dailyDemand,
    daysOfCover,
    coverAfterInbound,
    targetCoverDays,
    recommendedPo,
    cashRequired,
    marginPct,
    serviceGapDays,
    riskScore,
    revenueAtRisk,
    cashTrapped,
    proofValue,
    stockoutDate,
    inboundEtaDate,
    inboundDelayRisk: clamp(inboundDelayRisk, 0, 100),
    amazonCoverDays,
    shopifyCoverDays,
    locationImbalancePct,
    channelAvailability,
    locationIssue,
    recommendedMove,
    flowDecision,
    priority,
    action,
  };
}

export function getScoredSkus(csvText = sampleSkuCsv, cashBudget = 25000) {
  const parsed = parseSkuCsv(csvText);
  const rows = parsed.records
    .map((record) => scoreSku(record, cashBudget))
    .sort((a, b) => b.riskScore - a.riskScore);

  return {
    ...parsed,
    rows,
  };
}

export function buildDraftPo(item) {
  if (!item) {
    return "";
  }

  return [
    "Draft purchase order",
    `SKU: ${item.sku}`,
    `Product: ${item.name}`,
    `Recommended units: ${integer(item.recommendedPo)}`,
    `Estimated cash required: ${money(item.cashRequired)}`,
    `Lead time assumption: ${item.leadTime} days`,
    `Supplier reliability: ${item.supplierReliability}%`,
    `Reason: ${item.action}; ${item.daysOfCover.toFixed(1)} days of cover against a ${item.targetCoverDays}-day target.`,
  ].join("\n");
}
