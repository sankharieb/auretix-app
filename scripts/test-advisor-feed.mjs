import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const require = createRequire(import.meta.url);
const COMPANY_ID = "company_advisor_feed_test";
const WORKSPACE_ID = "workspace_advisor_feed_test";

function loadNextSwc() {
  try {
    return require("next/dist/build/swc");
  } catch (error) {
    throw new Error(
      `Could not load Next's bundled SWC wrapper to execute TypeScript modules: ${error.message}`,
    );
  }
}

async function loadTsModule(relativePath) {
  const swc = loadNextSwc();
  installTsRequireHook(swc);
  const modulePath = path.join(root, relativePath);
  const source = await readFile(modulePath, "utf8");
  const transformed = swc.transformSync(source, {
    filename: modulePath,
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
  const localRequire = createRequire(pathToFileURL(modulePath));

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
    { filename: modulePath },
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function profitImpact(id, impact, extra = {}) {
  return {
    id,
    company_id: COMPANY_ID,
    workspace_id: WORKSPACE_ID,
    sku: id.toUpperCase(),
    revenue_at_risk: 0,
    margin_at_risk: 0,
    cash_tied_up: 0,
    potential_stockout_loss: impact,
    overstock_exposure: 0,
    cost_of_delay: 0,
    expected_benefit: 0,
    assumptions: {},
    ...extra,
  };
}

function decision(id, impact, confidence = 80, status = "Pending") {
  return {
    id,
    company_id: COMPANY_ID,
    workspace_id: WORKSPACE_ID,
    sku: id.toUpperCase(),
    recommendation_type: "purchase_review",
    reason_summary: `Decision ${id} needs review.`,
    estimated_financial_impact: impact,
    confidence,
    user_action: "watched",
    status,
  };
}

function risk(id, impact, confidence = 80) {
  return {
    id,
    company_id: COMPANY_ID,
    workspace_id: WORKSPACE_ID,
    sku: id.toUpperCase(),
    issue_type: "stockout",
    score: 70,
    reason_summary: `Stockout exposure on ${id}.`,
    recommended_action: "Review inbound timing",
    financial_impact: impact,
    metrics: {
      confidence,
    },
  };
}

function queue(id, impact, confidence = 80) {
  return {
    id,
    company_id: COMPANY_ID,
    workspace_id: WORKSPACE_ID,
    sku: id.toUpperCase(),
    problem: `Queue item ${id}`,
    why_it_matters: "Open decision exposure remains unresolved.",
    financial_impact: impact,
    confidence,
    status: "Pending",
  };
}

async function runTest(name, fn) {
  await fn();
  return name;
}

function createReadOnlySupabaseFixture() {
  const calls = {
    select: 0,
    write: 0,
    rpc: 0,
  };
  const rowsByTable = {
    risk_scores: [risk("read_only_stockout", 12000, 75)],
    profit_impact_records: [],
    cost_events: [],
    revenue_events: [],
    supplier_intelligence: [],
    supplier_performance_events: [],
    decision_recommendations: [],
    daily_decision_queue: [],
    memory_events: [],
    memory_outcomes: [],
    memory_financial_derivations: [],
    memory_prediction_actuals: [],
  };

  function queryFor(table) {
    let rows = rowsByTable[table] || [];

    const query = {
      select() {
        calls.select += 1;
        return this;
      },
      eq(column, value) {
        rows = rows.filter((row) => row[column] === value);
        return this;
      },
      order() {
        return this;
      },
      limit(count) {
        rows = rows.slice(0, count);
        return this;
      },
      insert() {
        calls.write += 1;
        throw new Error("insert should not be called by advisor feed composer");
      },
      update() {
        calls.write += 1;
        throw new Error("update should not be called by advisor feed composer");
      },
      delete() {
        calls.write += 1;
        throw new Error("delete should not be called by advisor feed composer");
      },
      upsert() {
        calls.write += 1;
        throw new Error("upsert should not be called by advisor feed composer");
      },
      then(resolve) {
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };

    return query;
  }

  return {
    calls,
    client: {
      from(table) {
        return queryFor(table);
      },
      rpc() {
        calls.rpc += 1;
        throw new Error("rpc should not be called by advisor feed composer");
      },
    },
  };
}

function assertCardShape(card) {
  const requiredKeys = [
    "id",
    "type",
    "title",
    "summary",
    "projectedFinancialImpact",
    "severity",
    "confidence",
    "evidenceStrength",
    "primaryMetric",
    "whyItMatters",
    "evidenceIds",
    "drilldownTarget",
    "responsePaths",
    "sourceRefs",
  ];

  for (const key of requiredKeys) {
    assert(Object.prototype.hasOwnProperty.call(card, key), `card missing ${key}`);
  }
}

async function main() {
  const { buildAdvisorFeed } = await loadTsModule("lib/advisor-feed/composer.ts");
  const passed = [];

  passed.push(
    await runTest("cards below $1,000 are suppressed", async () => {
      const feed = await buildAdvisorFeed({
        companyId: COMPANY_ID,
        workspaceId: WORKSPACE_ID,
        records: {
          profitImpactRecords: [
            profitImpact("below_floor", 999),
            profitImpact("above_floor", 1000),
          ],
        },
      });

      assert(feed.cards.length === 1, `expected 1 card, received ${feed.cards.length}`);
      assert(feed.cards[0].projectedFinancialImpact === 1000, "noise floor card should remain");
      assert(feed.quietState === null, "quiet state should not appear when a card clears the floor");
      assertCardShape(feed.cards[0]);
    }),
  );

  passed.push(
    await runTest("cards rank by projectedFinancialImpact desc", async () => {
      const feed = await buildAdvisorFeed({
        companyId: COMPANY_ID,
        workspaceId: WORKSPACE_ID,
        records: {
          riskScores: [risk("stockout", 10000, 90)],
          decisionRecommendations: [decision("procurement", 50000, 95)],
          profitImpactRecords: [profitImpact("cash", 20000, { cash_tied_up: 20000, potential_stockout_loss: 0 })],
        },
      });
      const impacts = feed.cards.map((card) => card.projectedFinancialImpact);

      assert(
        impacts.join(",") === "50000,20000,10000",
        `expected dollar-impact order 50000,20000,10000; received ${impacts.join(",")}`,
      );
    }),
  );

  passed.push(
    await runTest("default cap is 3 cards", async () => {
      const feed = await buildAdvisorFeed({
        companyId: COMPANY_ID,
        workspaceId: WORKSPACE_ID,
        records: {
          decisionRecommendations: [
            decision("one", 24000),
            decision("two", 23000),
            decision("three", 22000),
            decision("four", 21000),
          ],
        },
      });

      assert(feed.cards.length === 3, `expected default cap 3, received ${feed.cards.length}`);
    }),
  );

  passed.push(
    await runTest("more than 3 high-severity cards allows up to 5", async () => {
      const feed = await buildAdvisorFeed({
        companyId: COMPANY_ID,
        workspaceId: WORKSPACE_ID,
        records: {
          decisionRecommendations: [
            decision("one", 90000),
            decision("two", 80000),
            decision("three", 70000),
            decision("four", 60000),
            decision("five", 50000),
            decision("six", 40000),
          ],
        },
      });

      assert(feed.cards.length === 5, `expected high-severity cap 5, received ${feed.cards.length}`);
      assert(feed.cards.every((card) => card.severity === "high"), "all returned cards should be high severity");
    }),
  );

  passed.push(
    await runTest("quiet-day state appears when no cards clear the floor", async () => {
      const feed = await buildAdvisorFeed({
        companyId: COMPANY_ID,
        workspaceId: WORKSPACE_ID,
        records: {
          riskScores: [risk("quiet", 100, 90)],
          profitImpactRecords: [profitImpact("quiet_cash", 500)],
        },
      });

      assert(feed.cards.length === 0, "quiet feed should not return cards");
      assert(feed.quietState?.isQuiet === true, "quiet state should be present");
      assert(
        feed.quietState.message.includes("Nothing needs action today"),
        "quiet state should include calm advisor message",
      );
    }),
  );

  passed.push(
    await runTest("low-confidence cards are limited but still rank by dollars", async () => {
      const feed = await buildAdvisorFeed({
        companyId: COMPANY_ID,
        workspaceId: WORKSPACE_ID,
        records: {
          riskScores: [
            risk("limited_high_dollar", 90000, 20),
            risk("strong_lower_dollar", 50000, 95),
          ],
        },
      });

      assert(feed.cards[0].id.includes("limited_high_dollar"), "low-confidence high-dollar card should rank first");
      assert(feed.cards[0].evidenceStrength === "limited", "low-confidence card should be labeled limited");
      assert(feed.cards[1].evidenceStrength === "strong", "high-confidence card should be labeled strong");
    }),
  );

  passed.push(
    await runTest("learning stays silent unless real memory history exists", async () => {
      const feed = await buildAdvisorFeed({
        companyId: COMPANY_ID,
        workspaceId: WORKSPACE_ID,
        records: {
          memoryEvents: [
            {
              id: "memory_event_only",
              company_id: COMPANY_ID,
              workspace_id: WORKSPACE_ID,
              event_type: "observed",
            },
          ],
          memoryOutcomes: [],
          memoryFinancialDerivations: [],
          memoryPredictionActuals: [],
          decisionRecommendations: [decision("visible_non_learning", 5000)],
        },
      });

      assert(!feed.cards.some((card) => card.type === "learning"), "learning card should not appear without completed history");
    }),
  );

  passed.push(
    await runTest("composer is read-only in test mode", async () => {
      const fixture = createReadOnlySupabaseFixture();
      const feed = await buildAdvisorFeed({
        companyId: COMPANY_ID,
        workspaceId: WORKSPACE_ID,
        supabase: fixture.client,
      });

      assert(feed.cards.length === 1, "read-only fixture should return one stockout card");
      assert(fixture.calls.select > 0, "composer should read from Supabase-like client");
      assert(fixture.calls.write === 0, `composer attempted ${fixture.calls.write} write calls`);
      assert(fixture.calls.rpc === 0, `composer attempted ${fixture.calls.rpc} rpc calls`);
    }),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        tests: passed,
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
