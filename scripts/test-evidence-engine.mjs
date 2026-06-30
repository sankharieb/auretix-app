import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const require = createRequire(import.meta.url);
const TEST_COMPANY_ID = "company_profit_test";
const TEST_WORKSPACE_ID = "workspace_profit_test";
const PERIOD = { start: "2026-06-01", end: "2026-06-30" };

const PRODUCTS = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    sku: "ATX-PROFIT-A",
    title: "Auretix Test SKU A",
    quantity: 100,
    unitValue: 12,
    revenue: 6000,
    purchasePrice: 1200,
    amazonReferral: 750,
    fbaFulfillment: 500,
    expectedNet: 2550,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    sku: "ATX-PROFIT-B",
    title: "Auretix Test SKU B",
    quantity: 200,
    unitValue: 8,
    revenue: 9000,
    purchasePrice: 1600,
    amazonReferral: 900,
    fbaFulfillment: 700,
    expectedNet: 3800,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    sku: "ATX-PROFIT-C",
    title: "Auretix Test SKU C",
    quantity: 300,
    unitValue: 5,
    revenue: 12000,
    purchasePrice: 1500,
    amazonReferral: 1200,
    fbaFulfillment: 900,
    expectedNet: 5400,
  },
];

const SHIPMENT_ID = "20000000-0000-4000-8000-000000000001";
const OCEAN_FREIGHT_AMOUNT = 6000;

function loadNextSwc() {
  try {
    return require("next/dist/build/swc");
  } catch (error) {
    throw new Error(
      `Could not load Next's bundled SWC wrapper to execute lib/profit/engine.ts: ${error.message}`,
    );
  }
}

async function loadProfitEngine() {
  const swc = loadNextSwc();
  installTsRequireHook(swc);
  const enginePath = path.join(root, "lib", "profit", "engine.ts");
  const source = await readFile(enginePath, "utf8");
  const transformed = swc.transformSync(source, {
    filename: enginePath,
    jsc: {
      target: "es2022",
      parser: {
        syntax: "typescript",
      },
    },
    module: {
      type: "commonjs",
    },
  });
  const module = { exports: {} };
  const localRequire = createRequire(pathToFileURL(enginePath));

  vm.runInNewContext(
    transformed.code,
    {
      module,
      exports: module.exports,
      require: localRequire,
      process,
      console,
      URL,
      Buffer,
      setTimeout,
      clearTimeout,
    },
    { filename: enginePath },
  );

  return module.exports;
}

function installTsRequireHook(swc) {
  if (require.extensions[".ts"]) {
    return;
  }

  require.extensions[".ts"] = (module, filename) => {
    const source = readFileSync(filename, "utf8");
    const transformed = swc.transformSync(source, {
      filename,
      jsc: {
        target: "es2022",
        parser: {
          syntax: "typescript",
        },
      },
      module: {
        type: "commonjs",
      },
    });

    module._compile(transformed.code, filename);
  };
}

function category(id, levelId, code, label) {
  return {
    id,
    level_id: levelId,
    code,
    label,
  };
}

function buildProvider() {
  const products = PRODUCTS.map((product) => ({
    id: product.id,
    company_id: TEST_COMPANY_ID,
    workspace_id: TEST_WORKSPACE_ID,
    sku: product.sku,
    title: product.title,
    source: "manual",
  }));
  const shipmentLines = PRODUCTS.map((product, index) => ({
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    company_id: TEST_COMPANY_ID,
    workspace_id: TEST_WORKSPACE_ID,
    shipment_id: SHIPMENT_ID,
    product_id: product.id,
    quantity: product.quantity,
    unit_value: product.unitValue,
    source: "manual",
  }));
  const revenueEvents = PRODUCTS.map((product, index) => ({
    id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    company_id: TEST_COMPANY_ID,
    workspace_id: TEST_WORKSPACE_ID,
    product_id: product.id,
    amount: product.revenue,
    event_date: "2026-06-20",
    channel: "amazon",
    units: product.quantity,
    source: "connected",
  }));
  const costEvents = [
    {
      id: "40000000-0000-4000-8000-000000000001",
      company_id: TEST_COMPANY_ID,
      workspace_id: TEST_WORKSPACE_ID,
      category_id: "cost_category_ocean_freight",
      category: category("cost_category_ocean_freight", 3, "ocean_freight", "Ocean freight"),
      amount: OCEAN_FREIGHT_AMOUNT,
      currency: "USD",
      event_date: "2026-06-08",
      grain: "shipment",
      product_id: null,
      shipment_id: SHIPMENT_ID,
      period_start: null,
      period_end: null,
      allocation_method: "by_units",
      source: "manual",
      notes: "Shipment-level ocean freight allocated by units across all SKUs.",
    },
  ];

  for (const [index, product] of PRODUCTS.entries()) {
    costEvents.push(
      {
        id: `41000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        company_id: TEST_COMPANY_ID,
        workspace_id: TEST_WORKSPACE_ID,
        category_id: "cost_category_purchase_price",
        category: category("cost_category_purchase_price", 2, "purchase_price", "Purchase price"),
        amount: product.purchasePrice,
        currency: "USD",
        event_date: "2026-06-09",
        grain: "sku",
        product_id: product.id,
        shipment_id: null,
        period_start: null,
        period_end: null,
        allocation_method: "direct",
        source: "manual",
        notes: "Direct SKU purchase price.",
      },
      {
        id: `42000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        company_id: TEST_COMPANY_ID,
        workspace_id: TEST_WORKSPACE_ID,
        category_id: "cost_category_amazon_referral",
        category: category("cost_category_amazon_referral", 5, "amazon_referral", "Amazon referral"),
        amount: product.amazonReferral,
        currency: "USD",
        event_date: "2026-06-15",
        grain: "sku",
        product_id: product.id,
        shipment_id: null,
        period_start: null,
        period_end: null,
        allocation_method: "direct",
        source: "connected",
        notes: "Amazon referral fee imported from channel data.",
      },
      {
        id: `43000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        company_id: TEST_COMPANY_ID,
        workspace_id: TEST_WORKSPACE_ID,
        category_id: "cost_category_fba_fulfillment",
        category: category("cost_category_fba_fulfillment", 5, "fba_fulfillment", "FBA fulfillment"),
        amount: product.fbaFulfillment,
        currency: "USD",
        event_date: "2026-06-15",
        grain: "sku",
        product_id: product.id,
        shipment_id: null,
        period_start: null,
        period_end: null,
        allocation_method: "direct",
        source: "connected",
        notes: "FBA fulfillment fee imported from channel data.",
      },
    );
  }

  return {
    async getProduct(companyId, productId, options) {
      return products.find((product) => {
        return product.company_id === companyId &&
          product.id === productId &&
          (!options?.workspaceId || product.workspace_id === options.workspaceId);
      }) || null;
    },
    async listRevenueEvents(companyId, productId, period, options) {
      return revenueEvents.filter((event) => {
        return event.company_id === companyId &&
          event.product_id === productId &&
          (!options?.workspaceId || event.workspace_id === options.workspaceId) &&
          (!period || (event.event_date >= period.start && event.event_date <= period.end));
      });
    },
    async listCostEvents(companyId, period, options) {
      return costEvents.filter((event) => {
        return event.company_id === companyId &&
          (!options?.workspaceId || event.workspace_id === options.workspaceId) &&
          (!period || (event.event_date >= period.start && event.event_date <= period.end));
      });
    },
    async listShipmentLines(companyId, shipmentIds, options) {
      return shipmentLines.filter((line) => {
        return line.company_id === companyId &&
          shipmentIds.includes(line.shipment_id) &&
          (!options?.workspaceId || line.workspace_id === options.workspaceId);
      });
    },
    async listPeriodAllocationBasis(companyId, period, options) {
      const byProduct = new Map();

      for (const event of revenueEvents) {
        if (
          event.company_id !== companyId ||
          event.event_date < period.start ||
          event.event_date > period.end ||
          (options?.workspaceId && event.workspace_id !== options.workspaceId)
        ) {
          continue;
        }

        const current = byProduct.get(event.product_id) || {
          product_id: event.product_id,
          units: 0,
          value: 0,
        };

        current.units += event.units;
        current.value += event.amount;
        byProduct.set(event.product_id, current);
      }

      return Array.from(byProduct.values());
    },
  };
}

function assertClose(actual, expected, label) {
  if (Math.abs(Number(actual) - Number(expected)) > 0.01) {
    throw new Error(`${label} expected ${expected}, received ${actual}`);
  }
}

async function main() {
  const { computeSkuProfitWithProvider } = await loadProfitEngine();
  const provider = buildProvider();
  const results = [];

  for (const product of PRODUCTS) {
    const result = await computeSkuProfitWithProvider(
      provider,
      TEST_COMPANY_ID,
      product.id,
      PERIOD,
      { workspaceId: TEST_WORKSPACE_ID },
    );

    assertClose(result.net_realized_profit, product.expectedNet, `${product.sku} net realized profit`);

    if (!result.evidence?.records?.length) {
      throw new Error(`${product.sku} did not produce evidence records.`);
    }

    if (result.evidence.calculationRun.calculation_type !== "sku_profit") {
      throw new Error(`${product.sku} produced the wrong calculation run type.`);
    }

    results.push({
      sku: result.sku,
      net_realized_profit: result.net_realized_profit,
      data_completeness: {
        no_data_levels: result.dataCompleteness.noDataLevels.map((level) => level.label),
      },
      evidence_trust_summary: result.evidence.trustSummary,
      evidence_records_count: result.evidence.records.length,
      calculation_run_type: result.evidence.calculationRun.calculation_type,
      example_evidence_records: result.evidence.records.slice(0, 5).map((record) => ({
        label: record.label,
        evidence_type: record.evidence_type,
        source_type: record.source_type,
        value_numeric: record.value_numeric,
        confidence: record.confidence,
      })),
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "in_memory_dry_run",
        company_id: TEST_COMPANY_ID,
        workspace_id: TEST_WORKSPACE_ID,
        period: PERIOD,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
