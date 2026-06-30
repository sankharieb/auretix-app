import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

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

async function loadEnvFile(fileName) {
  try {
    const raw = await readFile(path.join(root, fileName), "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...parts] = trimmed.split("=");
      const value = parts.join("=").trim().replace(/^['"]|['"]$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function loadEnv() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing required env values: ${missing.join(", ")}`);
  }
}

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

function assertClose(actual, expected, label) {
  if (Math.abs(Number(actual) - Number(expected)) > 0.01) {
    throw new Error(`${label} expected ${expected}, received ${actual}`);
  }
}

async function requireNoError(label, promise) {
  const { data, error } = await promise;

  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }

  return data;
}

async function deleteExistingTestData(supabase) {
  await requireNoError(
    "delete test revenue_events",
    supabase.from("revenue_events").delete().eq("company_id", TEST_COMPANY_ID),
  );
  await requireNoError(
    "delete test cost_events",
    supabase.from("cost_events").delete().eq("company_id", TEST_COMPANY_ID),
  );
  await requireNoError(
    "delete test shipment_lines",
    supabase.from("shipment_lines").delete().eq("company_id", TEST_COMPANY_ID),
  );
  await requireNoError(
    "delete test shipments",
    supabase.from("shipments").delete().eq("company_id", TEST_COMPANY_ID),
  );
  await requireNoError(
    "delete test products",
    supabase.from("products").delete().eq("company_id", TEST_COMPANY_ID),
  );
}

async function ensureTestTenant(supabase) {
  await requireNoError(
    "upsert test company",
    supabase.from("companies").upsert(
      {
        id: TEST_COMPANY_ID,
        name: "Profit Test Company",
        slug: "profit-test-company",
      },
      { onConflict: "id" },
    ),
  );

  await requireNoError(
    "upsert test workspace",
    supabase.from("workspaces").upsert(
      {
        id: TEST_WORKSPACE_ID,
        company_id: TEST_COMPANY_ID,
        name: "Profit Test Workspace",
        business_type: "ecommerce",
        scenario: {},
        workspace_state: {},
        draft_purchase_orders: [],
        supplier_packets: [],
        supplier_strategy_memory: {},
        approved_reallocation_plans: {},
        metadata: {
          purpose: "service-role landed-cost profit engine test",
        },
      },
      { onConflict: "id" },
    ),
  );
}

async function loadCategories(supabase) {
  const neededCodes = [
    "purchase_price",
    "ocean_freight",
    "amazon_referral",
    "fba_fulfillment",
  ];
  const rows = await requireNoError(
    "load cost categories",
    supabase
      .from("cost_categories")
      .select("id,level_id,code,label")
      .in("code", neededCodes),
  );
  const categories = new Map(rows.map((row) => [row.code, row]));

  for (const code of neededCodes) {
    if (!categories.has(code)) {
      throw new Error(`Missing cost category ${code}. Run db/migrations/20260628_landed_cost_profit_engine.sql first.`);
    }
  }

  return categories;
}

async function seedTestData(supabase) {
  const categories = await loadCategories(supabase);

  await deleteExistingTestData(supabase);
  await ensureTestTenant(supabase);

  await requireNoError(
    "insert products",
    supabase.from("products").insert(
      PRODUCTS.map((product) => ({
        id: product.id,
        company_id: TEST_COMPANY_ID,
        workspace_id: TEST_WORKSPACE_ID,
        sku: product.sku,
        title: product.title,
        source: "manual",
      })),
    ),
  );

  await requireNoError(
    "insert shipment",
    supabase.from("shipments").insert({
      id: SHIPMENT_ID,
      company_id: TEST_COMPANY_ID,
      workspace_id: TEST_WORKSPACE_ID,
      reference: "PO-TRUE-PROFIT-001",
      origin: "Ningbo, CN",
      destination: "Los Angeles, US",
      ship_date: "2026-05-20",
      arrival_date: "2026-06-07",
      sellable_date: "2026-06-10",
      source: "manual",
    }),
  );

  await requireNoError(
    "insert shipment lines",
    supabase.from("shipment_lines").insert(
      PRODUCTS.map((product, index) => ({
        id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        company_id: TEST_COMPANY_ID,
        workspace_id: TEST_WORKSPACE_ID,
        shipment_id: SHIPMENT_ID,
        product_id: product.id,
        quantity: product.quantity,
        unit_value: product.unitValue,
        source: "manual",
      })),
    ),
  );

  const costEvents = [
    {
      id: "40000000-0000-4000-8000-000000000001",
      company_id: TEST_COMPANY_ID,
      workspace_id: TEST_WORKSPACE_ID,
      category_id: categories.get("ocean_freight").id,
      amount: OCEAN_FREIGHT_AMOUNT,
      currency: "USD",
      event_date: "2026-06-08",
      grain: "shipment",
      shipment_id: SHIPMENT_ID,
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
        category_id: categories.get("purchase_price").id,
        amount: product.purchasePrice,
        currency: "USD",
        event_date: "2026-06-09",
        grain: "sku",
        product_id: product.id,
        allocation_method: "direct",
        source: "manual",
        notes: "Direct SKU purchase price.",
      },
      {
        id: `42000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        company_id: TEST_COMPANY_ID,
        workspace_id: TEST_WORKSPACE_ID,
        category_id: categories.get("amazon_referral").id,
        amount: product.amazonReferral,
        currency: "USD",
        event_date: "2026-06-15",
        grain: "sku",
        product_id: product.id,
        allocation_method: "direct",
        source: "connected",
        notes: "Amazon referral fee imported from channel data.",
      },
      {
        id: `43000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        company_id: TEST_COMPANY_ID,
        workspace_id: TEST_WORKSPACE_ID,
        category_id: categories.get("fba_fulfillment").id,
        amount: product.fbaFulfillment,
        currency: "USD",
        event_date: "2026-06-15",
        grain: "sku",
        product_id: product.id,
        allocation_method: "direct",
        source: "connected",
        notes: "FBA fulfillment fee imported from channel data.",
      },
    );
  }

  await requireNoError("insert cost events", supabase.from("cost_events").insert(costEvents));

  await requireNoError(
    "insert revenue events",
    supabase.from("revenue_events").insert(
      PRODUCTS.map((product, index) => ({
        id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        company_id: TEST_COMPANY_ID,
        workspace_id: TEST_WORKSPACE_ID,
        product_id: product.id,
        amount: product.revenue,
        event_date: "2026-06-20",
        channel: "amazon",
        units: product.quantity,
        source: "connected",
      })),
    ),
  );
}

async function main() {
  await loadEnv();

  // This test seeds company/workspace rows with the service-role key, so it
  // intentionally bypasses RLS for local verification only.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: WebSocket,
      },
    },
  );
  const {
    computeSkuProfit,
    configureProfitEngine,
    createSupabaseProfitDataProvider,
  } = await loadProfitEngine();

  await seedTestData(supabase);
  configureProfitEngine(createSupabaseProfitDataProvider(supabase));

  const results = [];

  for (const product of PRODUCTS) {
    const result = await computeSkuProfit(TEST_COMPANY_ID, product.id, PERIOD, {
      workspaceId: TEST_WORKSPACE_ID,
    });
    const expectedFreight = OCEAN_FREIGHT_AMOUNT * (product.quantity / 600);

    assertClose(result.level_3_transportation, expectedFreight, `${product.sku} allocated freight`);
    assertClose(result.net_realized_profit, product.expectedNet, `${product.sku} net realized profit`);

    results.push({
      sku: result.sku,
      gross_revenue: result.gross_revenue,
      level_2_product: result.level_2_product,
      level_3_transportation: result.level_3_transportation,
      level_5_marketplace: result.level_5_marketplace,
      net_realized_profit: result.net_realized_profit,
      no_data_levels: result.dataCompleteness.noDataLevels.map((level) => level.label),
      allocation_breakdown: result.allocationBreakdown.map((allocation) => ({
        category: allocation.category_code,
        grain: allocation.grain,
        method: allocation.allocation_method,
        source: allocation.source,
        allocated_amount: allocation.allocated_amount,
        ratio: allocation.allocation_ratio,
        flags: allocation.flags,
      })),
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        company_id: TEST_COMPANY_ID,
        workspace_id: TEST_WORKSPACE_ID,
        period: PERIOD,
        expected: {
          freight_allocation_by_units: {
            "ATX-PROFIT-A": 1000,
            "ATX-PROFIT-B": 2000,
            "ATX-PROFIT-C": 3000,
          },
          net_realized_profit: Object.fromEntries(
            PRODUCTS.map((product) => [product.sku, product.expectedNet]),
          ),
        },
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
