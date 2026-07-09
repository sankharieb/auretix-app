import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const root = process.cwd();

function loadNextSwc() {
  try {
    return require("next/dist/build/swc");
  } catch (error) {
    throw new Error(`Could not load Next's bundled SWC wrapper: ${error.message}`);
  }
}

async function loadJsModule(relativePath) {
  const swc = loadNextSwc();
  const modulePath = path.join(root, relativePath);
  const source = await readFile(modulePath, "utf8");
  const transformed = swc.transformSync(source, {
    filename: modulePath,
    jsc: {
      target: "es2022",
      parser: {
        syntax: "ecmascript",
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function localDateAt(hour, minute = 0) {
  const date = new Date();

  date.setHours(hour, minute, 0, 0);

  return date;
}

async function main() {
  const {
    briefingOpeningLines,
    confidenceLabel,
    developmentCountLabel,
    endOfBriefingLine,
    evidenceStrengthLabel,
    getFirstName,
    getGreetingForDate,
    quietBriefingLines,
  } = await loadJsModule("lib/advisor-briefing-ui.js");
  const componentSource = await readFile("components/advisor-briefing-surface.js", "utf8");
  const appPageSource = await readFile("app/app/page.js", "utf8");

  assert(getFirstName("Michel Builder") === "Michel", "first name should be extracted from full name");
  assert(getGreetingForDate(localDateAt(5), "Michel") === "Good morning, Michel.", "05:00 should be morning");
  assert(getGreetingForDate(localDateAt(11, 59), "Michel") === "Good morning, Michel.", "11:59 should be morning");
  assert(getGreetingForDate(localDateAt(12), "Michel") === "Good afternoon, Michel.", "12:00 should be afternoon");
  assert(getGreetingForDate(localDateAt(16, 59), "Michel") === "Good afternoon, Michel.", "16:59 should be afternoon");
  assert(getGreetingForDate(localDateAt(17), "Michel") === "Good evening, Michel.", "17:00 should be evening");
  assert(getGreetingForDate(localDateAt(4, 59), "Michel") === "Good evening, Michel.", "04:59 should be evening");

  assert(developmentCountLabel(1) === "One development deserves your attention.", "single-card copy should be singular");
  assert(developmentCountLabel(3) === "Three developments deserve your attention.", "three-card copy should be plural");

  const quietFeed = { cards: [], quietState: { isQuiet: true } };
  const oneCardFeed = { cards: [{ id: "one" }], quietState: null };
  const threeCardFeed = { cards: [{ id: "one" }, { id: "two" }, { id: "three" }], quietState: null };

  assert(briefingOpeningLines(quietFeed).length === 3, "quiet state should render three calm lines");
  assert(quietBriefingLines()[0] === "Nothing currently requires action.", "quiet opening should be exact");
  assert(
    briefingOpeningLines(oneCardFeed)[1] === "One development deserves your attention.",
    "one card should render one-development copy",
  );
  assert(
    briefingOpeningLines(threeCardFeed)[1] === "Three developments deserve your attention.",
    "multiple cards should render multi-development copy",
  );
  assert(evidenceStrengthLabel("limited") === "Limited evidence", "limited evidence label should be exact");
  assert(confidenceLabel(null) === "Not enough evidence", "null confidence should not imply certainty");
  assert(endOfBriefingLine(false) === "Nothing else currently requires your attention.", "briefing should close calmly");

  assert(componentSource.includes("<details"), "cards should use expandable details elements");
  assert(componentSource.includes("Open evidence"), "expanded cards should include Open evidence action");
  assert(componentSource.includes("Open details"), "expanded cards should include Open details action");
  assert(componentSource.includes("card.drilldownTarget.href"), "details navigation should reuse drilldown targets");
  assert(componentSource.includes("AppNavigation"), "existing navigation should remain alive");
  assert(appPageSource.includes("buildAdvisorFeed"), "Advisor page should render existing Advisor Feed output");

  console.log(
    JSON.stringify(
      {
        ok: true,
        tests: [
          "greeting changes correctly by local time",
          "quiet state opening renders",
          "one card opening renders",
          "multiple card opening renders",
          "card expansion uses details",
          "drill-down navigation actions exist",
          "existing app navigation remains",
          "Advisor page consumes buildAdvisorFeed output",
        ],
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
