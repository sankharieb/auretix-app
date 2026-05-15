export const featureStatusLabels = {
  live: "Live in V1",
  foundation: "Foundation built",
  future: "Later integration track",
};

export const featureCategories = [
  {
    id: "core-engine",
    name: "Core decision engine",
    description: "Turns business inputs, SKU data, and constraints into a clear operating move.",
  },
  {
    id: "procurement",
    name: "Procurement control",
    description: "Helps decide what to buy, how much to buy, and which supplier path is safest.",
  },
  {
    id: "supply-chain",
    name: "Supply chain protection",
    description: "Finds service, coverage, channel, supplier, and flow risk before it becomes expensive.",
  },
  {
    id: "supplier-management",
    name: "Supplier management",
    description: "Tracks supplier drag, response quality, exposure, follow-up, and strategy memory.",
  },
  {
    id: "workflow-memory",
    name: "Workflow and memory",
    description: "Keeps decisions, tasks, changes, audits, and workspace state from disappearing.",
  },
  {
    id: "data-access",
    name: "Data, accounts, and permissions",
    description: "Moves Auretix from a local engine into a multi-user SaaS system.",
  },
  {
    id: "roi-integrations",
    name: "ROI and integrations",
    description: "The proof layer for live commerce, accounting, recommendations, and savings.",
  },
  {
    id: "customer-growth",
    name: "Customer growth",
    description: "Turns the website into lead capture, needs assessment, packaging, and pricing.",
  },
];

export const customerNeeds = [
  {
    id: "stockout-risk",
    name: "Stockout prevention",
    plainLanguage: "I keep running out of important products.",
  },
  {
    id: "overbuying",
    name: "Overbuying control",
    plainLanguage: "Too much cash is trapped in slow or wrong inventory.",
  },
  {
    id: "reorder-timing",
    name: "Reorder timing",
    plainLanguage: "I do not know what to reorder or when.",
  },
  {
    id: "supplier-risk",
    name: "Supplier reliability",
    plainLanguage: "Suppliers are late, unclear, or creating operational drag.",
  },
  {
    id: "cash-pressure",
    name: "Cash-aware buying",
    plainLanguage: "I need smarter buying decisions while cash is tight.",
  },
  {
    id: "workflow-control",
    name: "Workflow control",
    plainLanguage: "The team needs tasks, approvals, and purchase-order follow-through.",
  },
  {
    id: "roi-proof",
    name: "ROI proof",
    plainLanguage: "I need proof the recommendations saved money or protected revenue.",
  },
  {
    id: "live-integrations",
    name: "Live integrations",
    plainLanguage: "I want Shopify, Amazon, and QuickBooks connected later.",
  },
];

export const businessTypes = [
  { id: "ecommerce", name: "Ecommerce" },
  { id: "retail", name: "Retail" },
  { id: "wholesale", name: "Wholesale" },
  { id: "manufacturing", name: "Manufacturing" },
  { id: "distribution", name: "Distribution" },
  { id: "consumerBrand", name: "Consumer brand" },
];

export const businessScales = [
  { id: "small", name: "Small business" },
  { id: "growth", name: "Growth-stage business" },
  { id: "midmarket", name: "Mid-market operator" },
  { id: "enterprise", name: "Larger operation" },
];

export const dataMaturityOptions = [
  { id: "manual", name: "Manual or spreadsheet" },
  { id: "csv", name: "CSV exports available" },
  { id: "connected", name: "One core system ready" },
  { id: "multiSystem", name: "Multiple systems and teams" },
];

export const supportModes = [
  { id: "selfServe", name: "Mostly self-serve" },
  { id: "guided", name: "Guided setup" },
  { id: "managed", name: "Managed operating support" },
];

export const auretixFeatureCatalog = [
  {
    id: "business-scenario-engine",
    name: "Business scenario engine",
    category: "core-engine",
    status: "live",
    customerNeeds: ["stockout-risk", "reorder-timing", "cash-pressure"],
    businessFit: ["ecommerce", "retail", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Change business type, scale, objective, and scenario mode in /app, then run the engine and confirm the summary, metrics, and recommendations update.",
  },
  {
    id: "support-tier-recommendation",
    name: "Support-tier recommendation",
    category: "core-engine",
    status: "live",
    customerNeeds: ["workflow-control", "roi-proof"],
    businessFit: ["ecommerce", "retail", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Run low, medium, and high-risk scenarios and confirm the suggested tier changes with the risk and complexity level.",
  },
  {
    id: "sku-decision-queue",
    name: "SKU decision queue",
    category: "core-engine",
    status: "live",
    customerNeeds: ["stockout-risk", "overbuying", "reorder-timing"],
    businessFit: ["ecommerce", "retail", "wholesale", "consumerBrand"],
    testCase:
      "Select multiple SKUs in the queue and confirm risk score, playbook, reorder units, supplier, and action copy stay aligned.",
  },
  {
    id: "playbook-classification",
    name: "Protect, Grow, Fix, Run lean playbooks",
    category: "core-engine",
    status: "live",
    customerNeeds: ["stockout-risk", "overbuying", "cash-pressure"],
    businessFit: ["ecommerce", "retail", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Stress demand, cash, and supplier settings and confirm the playbook counts and item labels change plausibly.",
  },
  {
    id: "procurement-optimizer",
    name: "Procurement optimizer",
    category: "procurement",
    status: "live",
    customerNeeds: ["reorder-timing", "supplier-risk", "cash-pressure"],
    businessFit: ["ecommerce", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Review recommended buy units, supplier comparisons, landed margin, delay probability, and award decision for top items.",
  },
  {
    id: "draft-po-workflow",
    name: "Draft purchase-order workflow",
    category: "procurement",
    status: "live",
    customerNeeds: ["workflow-control", "supplier-risk"],
    businessFit: ["ecommerce", "retail", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Create a draft PO from an optimizer recommendation, edit units, terms, status, and notes, then mark it sent to supplier.",
  },
  {
    id: "open-po-tracker",
    name: "Open purchase-order tracker",
    category: "procurement",
    status: "live",
    customerNeeds: ["supplier-risk", "workflow-control"],
    businessFit: ["ecommerce", "retail", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Open a live PO, change supplier communication state, add follow-up notes, and confirm status history updates.",
  },
  {
    id: "supplier-packets",
    name: "Supplier packet generator",
    category: "supplier-management",
    status: "live",
    customerNeeds: ["supplier-risk", "workflow-control"],
    businessFit: ["wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Generate a supplier packet for a PO and confirm templates, notes, issue flags, and export history appear.",
  },
  {
    id: "supplier-relationship-board",
    name: "Supplier relationship board",
    category: "supplier-management",
    status: "live",
    customerNeeds: ["supplier-risk", "workflow-control"],
    businessFit: ["ecommerce", "retail", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Check messages prepared, replies, no-response count, escalation count, response rate, and supplier drag labels.",
  },
  {
    id: "supplier-strategy-memory",
    name: "Supplier strategy memory",
    category: "supplier-management",
    status: "live",
    customerNeeds: ["supplier-risk", "cash-pressure"],
    businessFit: ["wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Set supplier strategy to preferred, reduce, or exit, rerun the engine, and confirm exposure recommendations adapt.",
  },
  {
    id: "supplier-reallocation",
    name: "Cross-supplier reallocation planner",
    category: "supplier-management",
    status: "live",
    customerNeeds: ["supplier-risk", "overbuying"],
    businessFit: ["manufacturing", "distribution", "wholesale"],
    testCase:
      "Review keep, split, and shift supplier options and confirm approved plans convert into draft PO recommendations.",
  },
  {
    id: "forecast-board",
    name: "30, 60, and 90-day forecast board",
    category: "supply-chain",
    status: "live",
    customerNeeds: ["stockout-risk", "reorder-timing", "roi-proof"],
    businessFit: ["ecommerce", "retail", "wholesale", "consumerBrand"],
    testCase:
      "Switch scenario mode and confirm forecast units, direction, and confidence change for each SKU.",
  },
  {
    id: "anomaly-detection",
    name: "Anomaly detection",
    category: "supply-chain",
    status: "live",
    customerNeeds: ["stockout-risk", "supplier-risk", "workflow-control"],
    businessFit: ["ecommerce", "retail", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Trigger demand spike or supplier delay and confirm new anomalies appear with owner, severity, and detail.",
  },
  {
    id: "inventory-ledger-import",
    name: "CSV inventory ledger import",
    category: "data-access",
    status: "live",
    customerNeeds: ["stockout-risk", "reorder-timing", "cash-pressure"],
    businessFit: ["ecommerce", "retail", "wholesale", "consumerBrand"],
    testCase:
      "Paste SKU,onHand,reserved,inbound CSV data, import it, and confirm ledger quantities and queue priorities refresh.",
  },
  {
    id: "workspace-persistence",
    name: "Workspace persistence",
    category: "workflow-memory",
    status: "foundation",
    customerNeeds: ["workflow-control", "roi-proof"],
    businessFit: ["ecommerce", "retail", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Save a workspace, reload it, and confirm scenario, draft POs, supplier packets, and strategy memory remain intact.",
  },
  {
    id: "auth-roles-permissions",
    name: "Login, roles, and company permissions",
    category: "data-access",
    status: "foundation",
    customerNeeds: ["workflow-control", "roi-proof"],
    businessFit: ["growth", "midmarket", "enterprise"],
    testCase:
      "Sign in locally through Supabase, confirm owner role can save and run decisions, and verify anonymous access cannot save.",
  },
  {
    id: "audit-events",
    name: "Audit trail foundation",
    category: "workflow-memory",
    status: "foundation",
    customerNeeds: ["workflow-control", "roi-proof"],
    businessFit: ["wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Create a decision run and workspace update, then confirm audit events are stored in JSON or Supabase.",
  },
  {
    id: "modeled-roi",
    name: "Modeled ROI snapshot",
    category: "roi-integrations",
    status: "foundation",
    customerNeeds: ["roi-proof", "cash-pressure"],
    businessFit: ["ecommerce", "retail", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Open the integration and ROI panel and confirm modeled monthly impact, annual impact, proof score, and proof inputs render.",
  },
  {
    id: "live-commerce-accounting-integrations",
    name: "Shopify, Amazon, and QuickBooks integrations",
    category: "roi-integrations",
    status: "future",
    customerNeeds: ["live-integrations", "roi-proof"],
    businessFit: ["ecommerce", "retail", "consumerBrand"],
    testCase:
      "Later: connect OAuth credentials, sync real orders, inventory, COGS, bills, and purchase orders, then compare recommendations to outcomes.",
  },
  {
    id: "website-lead-capture",
    name: "Website lead capture",
    category: "customer-growth",
    status: "live",
    customerNeeds: ["workflow-control", "roi-proof"],
    businessFit: ["ecommerce", "retail", "wholesale", "manufacturing", "distribution", "consumerBrand"],
    testCase:
      "Submit the website support form and confirm the lead is written to the support request store.",
  },
];

export const pricingPlans = [
  {
    id: "starter",
    name: "Starter Decision Desk",
    badge: "Small teams",
    priceRange: "$299-$499/mo",
    setupRange: "$500-$1,500 setup",
    bestFor: "Small ecommerce, retail, or brand teams that need immediate reorder clarity without a heavy rollout.",
    includes: [
      "Decision engine, SKU queue, playbooks, CSV import, and basic workspaces.",
      "One operating workspace and one guided monthly review.",
      "Best for stockout, reorder timing, and cash-pressure problems.",
    ],
    limits: [
      "No live integrations yet.",
      "Supplier workflows stay lightweight.",
      "ROI proof is modeled until real data is connected.",
    ],
    primaryNeeds: ["stockout-risk", "reorder-timing", "cash-pressure"],
    scaleFit: ["small", "growth"],
    businessFit: ["ecommerce", "retail", "consumerBrand"],
  },
  {
    id: "growth",
    name: "Growth Operations",
    badge: "Most useful early SaaS plan",
    priceRange: "$799-$1,499/mo",
    setupRange: "$1,500-$3,500 setup",
    bestFor: "Growing sellers, wholesalers, or brands that need procurement, supplier, and workflow decisions in one place.",
    includes: [
      "Everything in Starter plus procurement optimizer, draft PO flow, supplier relationship board, and anomaly review.",
      "Up to three operating workspaces or business lines.",
      "Monthly ROI review using modeled impact and saved decision history.",
    ],
    limits: [
      "Live Shopify, Amazon, and QuickBooks sync remains a paid integration milestone.",
      "Advanced permissions and custom executive reporting are reserved for Operator+.",
    ],
    primaryNeeds: ["supplier-risk", "workflow-control", "overbuying", "roi-proof"],
    scaleFit: ["growth", "midmarket"],
    businessFit: ["ecommerce", "retail", "wholesale", "consumerBrand"],
  },
  {
    id: "operator",
    name: "Operator+ Control Tower",
    badge: "Complex operations",
    priceRange: "$2,500-$5,000+/mo",
    setupRange: "$5,000-$15,000 setup",
    bestFor: "Manufacturing, distribution, wholesale, or multi-team operators where supplier risk, auditability, and ROI proof matter.",
    includes: [
      "Everything in Growth plus supplier strategy memory, reallocation planning, role-aware workflows, and deeper audit needs.",
      "Custom workspace setup for complex operating models.",
      "Priority path for live integrations and ROI proof once credentials and customer data are ready.",
    ],
    limits: [
      "Requires discovery before final price.",
      "Customer must provide clean operating data or sponsor an integration project.",
    ],
    primaryNeeds: ["supplier-risk", "workflow-control", "roi-proof", "live-integrations"],
    scaleFit: ["midmarket", "enterprise"],
    businessFit: ["wholesale", "manufacturing", "distribution", "consumerBrand"],
  },
];

function addScore(scoreMap, planId, points, reason) {
  const entry = scoreMap.get(planId);

  if (!entry) {
    return;
  }

  entry.score += points;
  if (reason) {
    entry.reasons.push(reason);
  }
}

export function buildNeedsRecommendation(input = {}) {
  const profile = {
    businessType: input.businessType || "ecommerce",
    businessScale: input.businessScale || "growth",
    primaryNeed: input.primaryNeed || "reorder-timing",
    dataMaturity: input.dataMaturity || "csv",
    supportMode: input.supportMode || "guided",
  };

  const scoreMap = new Map(
    pricingPlans.map((plan) => [
      plan.id,
      {
        plan,
        score: 0,
        reasons: [],
      },
    ]),
  );

  for (const plan of pricingPlans) {
    if (plan.scaleFit.includes(profile.businessScale)) {
      addScore(scoreMap, plan.id, 3, `Fits a ${profile.businessScale} operating stage.`);
    }

    if (plan.businessFit.includes(profile.businessType)) {
      addScore(scoreMap, plan.id, 3, `Built for ${profile.businessType} needs.`);
    }

    if (plan.primaryNeeds.includes(profile.primaryNeed)) {
      addScore(scoreMap, plan.id, 4, `Directly targets ${profile.primaryNeed.replace(/-/g, " ")}.`);
    }
  }

  if (profile.businessScale === "small") {
    addScore(scoreMap, "starter", 3, "Keeps rollout and price light for a small team.");
  }

  if (profile.businessScale === "growth") {
    addScore(scoreMap, "growth", 2, "Adds enough workflow depth for a growing operation.");
  }

  if (["midmarket", "enterprise"].includes(profile.businessScale)) {
    addScore(scoreMap, "operator", 4, "Matches the governance and operating complexity.");
  }

  if (["manufacturing", "distribution", "wholesale"].includes(profile.businessType)) {
    addScore(scoreMap, "operator", 3, "Complex supplier and flow risk usually need Operator+.");
  }

  if (["manual", "csv"].includes(profile.dataMaturity)) {
    addScore(scoreMap, "starter", 2, "Can start with manual or CSV data.");
    addScore(scoreMap, "growth", 1, "Can use CSV data while workflow matures.");
  }

  if (profile.dataMaturity === "connected") {
    addScore(scoreMap, "growth", 3, "One ready system makes the Growth plan a practical bridge.");
    addScore(scoreMap, "operator", 1, "Connected data can support deeper ROI proof later.");
  }

  if (profile.dataMaturity === "multiSystem") {
    addScore(scoreMap, "operator", 4, "Multiple systems usually need permissions, audit, and integration planning.");
  }

  if (profile.supportMode === "selfServe") {
    addScore(scoreMap, "starter", 2, "Self-serve customers should start with the lowest-friction package.");
  }

  if (profile.supportMode === "guided") {
    addScore(scoreMap, "growth", 2, "Guided setup is the best fit for operational workflow adoption.");
  }

  if (profile.supportMode === "managed") {
    addScore(scoreMap, "operator", 3, "Managed support belongs with the highest-touch package.");
  }

  const ranked = [...scoreMap.values()].sort((a, b) => b.score - a.score);
  const recommended = ranked[0];
  const features = auretixFeatureCatalog
    .filter((feature) => {
      const needMatch = feature.customerNeeds.includes(profile.primaryNeed);
      const businessMatch = feature.businessFit.includes(profile.businessType);
      const planMatch =
        recommended.plan.id === "starter"
          ? feature.status === "live" && ["core-engine", "data-access", "customer-growth"].includes(feature.category)
          : recommended.plan.id === "growth"
            ? feature.status !== "future" && feature.category !== "roi-integrations"
            : feature.status !== "future" || feature.id === "live-commerce-accounting-integrations";

      return (needMatch || businessMatch) && planMatch;
    })
    .slice(0, 6);

  return {
    profile,
    recommendedPlan: recommended.plan,
    reasons: recommended.reasons.slice(0, 4),
    alternatives: ranked.slice(1).map((entry) => entry.plan),
    recommendedFeatures: features,
  };
}
