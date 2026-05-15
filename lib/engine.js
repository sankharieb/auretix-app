export const defaultScenario = {
  businessType: "ecommerce",
  businessScale: "growth",
  objectiveMode: "service",
  scenarioMode: "normal",
  monthlyUnits: 4200,
  inventory: 1260,
  leadTime: 28,
  supplierReliability: 74,
  growthRate: 18,
  margin: 22,
  cashRunway: 45,
  seasonalityIntensity: 35,
  accountConcentration: 40,
  componentCriticality: 68,
  singleSourceRisk: 58,
  warehouseCount: 3,
  nodeImbalance: 36,
  launchIntensity: 42,
};

export const defaultDecision = {
  badgeLevel: "neutral",
  badgeText: "Awaiting input",
  summary:
    "Auretix will translate business data into a purchasing move, risk view, and support recommendation.",
  metrics: [],
  actions: [],
  supportTier: null,
  panels: [],
};

const businessTypeLabels = {
  ecommerce: "Ecommerce business",
  retail: "Retail business",
  wholesale: "Wholesale business",
  manufacturing: "Manufacturing business",
  distribution: "Distribution business",
  consumerBrand: "Consumer brand",
};

const scaleLabels = {
  small: "small business",
  growth: "growth-stage business",
  midmarket: "mid-market operator",
  enterprise: "large-scale operation",
};

const businessProfiles = {
  ecommerce: {
    demandRisk:
      "Demand can shift fast with promotions, marketplace ranking, and ad performance.",
    procurementFocus:
      "Protect reorder timing on top SKUs and avoid starving growth during momentum.",
    supplyFocus:
      "Guard in-stock continuity across key sales channels before optimizing for long-tail efficiency.",
    nextMove:
      "Auretix would favor quick reorder clarity and service continuity because lost stock can kill momentum fast.",
    lowAction:
      "Keep purchasing discipline tight on top SKUs and review supplier timing before the next growth push.",
    mediumAction:
      "Tighten reorder timing now and keep a fallback source ready in case sales momentum accelerates again.",
    highAction:
      "Protect hero SKUs immediately and secure faster replenishment before stockouts damage momentum and revenue.",
    procurementAdvice:
      "Recommended procurement posture: prioritize velocity SKUs first, then size the PO to protect growth without overbuying.",
    supplyAdvice:
      "Auretix would watch ranking-sensitive SKUs and channel availability more aggressively than slower-moving tail inventory.",
  },
  retail: {
    demandRisk:
      "Retail environments absorb seasonal swings, local sell-through differences, and channel-level gaps.",
    procurementFocus:
      "Buy to protect shelf and channel continuity without carrying slow excess inventory.",
    supplyFocus:
      "Maintain replenishment rhythm across stores, channels, or regions so service does not break unevenly.",
    nextMove:
      "Auretix would prioritize replenishment continuity and visibility into where service-level gaps are forming.",
    lowAction:
      "Maintain replenishment discipline on priority channels and review store or region coverage before the next cycle.",
    mediumAction:
      "Focus on exposed locations or channels first and tighten reorder timing before replenishment gaps become visible.",
    highAction:
      "Stabilize store and channel replenishment immediately so service gaps do not turn into visible revenue loss.",
    procurementAdvice:
      "Recommended procurement posture: buy to keep key channels filled while staying conservative on slower pockets of demand.",
    supplyAdvice:
      "Auretix would surface where stock is failing unevenly so retail service issues do not stay hidden inside blended totals.",
  },
  wholesale: {
    demandRisk:
      "Wholesale demand moves in larger chunks and can change quickly around account orders and contracts.",
    procurementFocus:
      "Size purchasing around account volatility, contract timing, and margin protection.",
    supplyFocus:
      "Prepare for concentrated order pressure that can distort normal coverage assumptions.",
    nextMove:
      "Auretix would protect against large order shocks and keep enough flexibility for high-value account demand.",
    lowAction:
      "Keep enough purchasing flexibility to absorb account swings without committing capital too early.",
    mediumAction:
      "Prepare a flexible PO strategy and confirm account-driven demand timing before the next major order cycle.",
    highAction:
      "Secure purchasing now and protect against a large-account demand swing destabilizing the full supply plan.",
    procurementAdvice:
      "Recommended procurement posture: buy with account concentration in mind, not just average monthly demand.",
    supplyAdvice:
      "Auretix would watch contract timing and large-order exposure because one account can reshape the whole coverage picture.",
  },
  manufacturing: {
    demandRisk:
      "Manufacturing risk compounds when component delays block production even if finished-goods demand stays healthy.",
    procurementFocus:
      "Buy critical components and raw materials early enough to avoid production stoppages.",
    supplyFocus:
      "Watch upstream dependencies because one missing part can break the whole flow.",
    nextMove:
      "Auretix would prioritize component continuity, supplier backup planning, and production-protection decisions.",
    lowAction:
      "Keep component coverage aligned with the build plan and review upstream supplier timing before the next run.",
    mediumAction:
      "Review component lead times now and lock critical material coverage before production exposure widens.",
    highAction:
      "Protect critical components immediately, secure a fallback supplier path, and stop any delay that could trigger a production bottleneck.",
    procurementAdvice:
      "Recommended procurement posture: secure component coverage first and add protection on any single-source material.",
    supplyAdvice:
      "Auretix would track upstream bottlenecks because missing one input can idle the full output plan.",
  },
  distribution: {
    demandRisk:
      "Distribution networks fail when inbound timing and node-level coverage drift out of balance.",
    procurementFocus:
      "Buy with lane reliability and replenishment cadence in mind, not just aggregate volume.",
    supplyFocus:
      "Keep flow balanced across nodes so local shortages do not hide inside global inventory totals.",
    nextMove:
      "Auretix would focus on network flow, node-level exposure, and inbound reliability before chasing pure efficiency.",
    lowAction:
      "Keep inbound cadence stable and review node coverage so hidden imbalances do not grow quietly.",
    mediumAction:
      "Review node-level exposure and prepare rebalancing or expedited replenishment before local shortages escalate.",
    highAction:
      "Stabilize inbound flow immediately and protect the most exposed nodes before service failures spread across the network.",
    procurementAdvice:
      "Recommended procurement posture: plan volume with lane reliability and replenishment timing in mind, not just demand totals.",
    supplyAdvice:
      "Auretix would surface node-level flow risk because healthy global inventory can still mask local service failures.",
  },
  consumerBrand: {
    demandRisk:
      "Consumer brands balance growth, launch timing, and cash pressure while trying to stay in stock.",
    procurementFocus:
      "Protect hero SKUs, keep launches supplied, and avoid locking too much capital into weak bets.",
    supplyFocus:
      "Preserve service continuity without letting inventory complexity dilute working capital.",
    nextMove:
      "Auretix would balance growth ambition with disciplined inventory allocation and supplier confidence.",
    lowAction:
      "Maintain disciplined purchasing around top performers while preserving room for strategic growth bets.",
    mediumAction:
      "Keep growth moving, but tighten purchasing around high-conviction SKUs and dependable suppliers.",
    highAction:
      "Protect hero SKU availability immediately and cut exposure to weak bets until cash and supply confidence improve.",
    procurementAdvice:
      "Recommended procurement posture: back high-conviction winners first and defend working capital on weaker inventory bets.",
    supplyAdvice:
      "Auretix would keep launches and hero SKUs protected because brand momentum is fragile when inventory slips.",
  },
};

const scaleProfiles = {
  small: {
    cashWeight: 1.15,
    supportLabel: "lean internal ops",
    supportNote:
      "This business likely needs simpler tools and more direct guidance because internal ops bandwidth is limited.",
  },
  growth: {
    cashWeight: 1,
    supportLabel: "growing internal ops",
    supportNote:
      "This business needs decisions that keep growth moving without creating operational chaos.",
  },
  midmarket: {
    cashWeight: 0.92,
    supportLabel: "multi-function ops team",
    supportNote:
      "This business can absorb more structure, so Auretix should help coordinate across teams and tradeoffs.",
  },
  enterprise: {
    cashWeight: 0.85,
    supportLabel: "scaled operations organization",
    supportNote:
      "This business needs clearer prioritization across a larger system, not just a basic reorder alert.",
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value);
}

export function buildDecision(rawScenario) {
  const scenario = {
    businessType: rawScenario.businessType,
    businessScale: rawScenario.businessScale,
    objectiveMode: rawScenario.objectiveMode,
    scenarioMode: rawScenario.scenarioMode,
    monthlyUnits: Number(rawScenario.monthlyUnits),
    inventory: Number(rawScenario.inventory),
    leadTime: Number(rawScenario.leadTime),
    supplierReliability: Number(rawScenario.supplierReliability),
    growthRate: Number(rawScenario.growthRate),
    margin: Number(rawScenario.margin),
    cashRunway: Number(rawScenario.cashRunway),
    seasonalityIntensity: Number(rawScenario.seasonalityIntensity),
    accountConcentration: Number(rawScenario.accountConcentration),
    componentCriticality: Number(rawScenario.componentCriticality),
    singleSourceRisk: Number(rawScenario.singleSourceRisk),
    warehouseCount: Number(rawScenario.warehouseCount),
    nodeImbalance: Number(rawScenario.nodeImbalance),
    launchIntensity: Number(rawScenario.launchIntensity),
  };

  const invalid =
    scenario.monthlyUnits <= 0 ||
    scenario.inventory < 0 ||
    scenario.leadTime <= 0 ||
    scenario.supplierReliability < 0 ||
    scenario.supplierReliability > 100 ||
    scenario.growthRate < -100 ||
    scenario.growthRate > 300 ||
    scenario.margin < 0 ||
    scenario.margin > 100 ||
    scenario.cashRunway <= 0 ||
    scenario.seasonalityIntensity < 0 ||
    scenario.seasonalityIntensity > 100 ||
    scenario.accountConcentration < 0 ||
    scenario.accountConcentration > 100 ||
    scenario.componentCriticality < 0 ||
    scenario.componentCriticality > 100 ||
    scenario.singleSourceRisk < 0 ||
    scenario.singleSourceRisk > 100 ||
    scenario.warehouseCount <= 0 ||
    scenario.nodeImbalance < 0 ||
    scenario.nodeImbalance > 100 ||
    scenario.launchIntensity < 0 ||
    scenario.launchIntensity > 100;

  if (invalid) {
    return {
      badgeLevel: "high",
      badgeText: "Input error",
      summary:
        "Auretix needs clean business inputs before it can recommend a purchasing and support plan.",
      metrics: [
        {
          label: "Fix inputs",
          value: "Enter valid numbers",
          detail:
            "Monthly units and lead time must be above zero, and percentages should stay between realistic ranges.",
        },
      ],
      actions: [],
      supportTier: null,
      panels: [],
    };
  }

  const businessType =
    businessTypeLabels[scenario.businessType] || "Business";
  const scaleType = scaleLabels[scenario.businessScale] || "operator";
  const profile =
    businessProfiles[scenario.businessType] || businessProfiles.ecommerce;
  const scaleProfile =
    scaleProfiles[scenario.businessScale] || scaleProfiles.growth;
  const objectiveLabels = {
    cash: "protect cash",
    growth: "protect growth",
    service: "protect service levels",
  };
  const objectiveMode = objectiveLabels[scenario.objectiveMode] || "protect service levels";
  const scenarioLabels = {
    normal: "normal conditions",
    supplierDelay: "supplier delay scenario",
    demandSpike: "demand spike scenario",
  };
  const scenarioModeLabel =
    scenarioLabels[scenario.scenarioMode] || "normal conditions";

  const businessSignals = {
    ecommerce: clamp(
      scenario.launchIntensity * 0.5 + scenario.seasonalityIntensity * 0.25,
      0,
      100,
    ),
    retail: clamp(scenario.seasonalityIntensity * 0.8, 0, 100),
    wholesale: clamp(scenario.accountConcentration * 0.9, 0, 100),
    manufacturing: clamp(
      scenario.componentCriticality * 0.55 + scenario.singleSourceRisk * 0.45,
      0,
      100,
    ),
    distribution: clamp(
      scenario.nodeImbalance * 0.7 + Math.min(scenario.warehouseCount * 6, 30),
      0,
      100,
    ),
    consumerBrand: clamp(
      scenario.launchIntensity * 0.55 + scenario.seasonalityIntensity * 0.25,
      0,
      100,
    ),
  };

  const businessSignal = businessSignals[scenario.businessType] || 0;
  const scenarioProfiles = {
    normal: {
      leadTimeBoost: 0,
      growthBoost: 0,
      reliabilityDrop: 0,
      signalBoost: 0,
    },
    supplierDelay: {
      leadTimeBoost: 0.28,
      growthBoost: 0,
      reliabilityDrop: 12,
      signalBoost: 8,
    },
    demandSpike: {
      leadTimeBoost: 0.04,
      growthBoost: 0.22,
      reliabilityDrop: 0,
      signalBoost: 10,
    },
  };
  const scenarioProfile =
    scenarioProfiles[scenario.scenarioMode] || scenarioProfiles.normal;
  const adjustedLeadTime = round(
    scenario.leadTime * (1 + scenarioProfile.leadTimeBoost),
  );
  const adjustedGrowthRate = scenario.growthRate + scenario.growthBoost * 100;
  const adjustedSupplierReliability = clamp(
    scenario.supplierReliability - scenarioProfile.reliabilityDrop,
    1,
    100,
  );
  const signalPressure = clamp(
    (businessSignal + scenarioProfile.signalBoost) / 100,
    0,
    1.4,
  );

  const dailyDemand = scenario.monthlyUnits / 30;
  const growthMultiplier = 1 + adjustedGrowthRate / 100;
  const projectedDailyDemand = dailyDemand * growthMultiplier;
  const daysOfCover = scenario.inventory / projectedDailyDemand;
  const reliabilityPenalty = (100 - adjustedSupplierReliability) / 100;
  const cashPressure = clamp((60 - scenario.cashRunway) / 60, 0, 1);
  const marginPressure = clamp((25 - scenario.margin) / 25, 0, 1);
  const coveragePressure = clamp((adjustedLeadTime - daysOfCover) / adjustedLeadTime, 0, 1);

  const riskScore = clamp(
    round(
      coveragePressure * 45 +
        reliabilityPenalty * 25 +
        cashPressure * 15 * scaleProfile.cashWeight +
        marginPressure * 10 +
        clamp(adjustedGrowthRate / 40, 0, 1) * 5 +
        signalPressure * 10,
    ),
    6,
    99,
  );

  const urgency = clamp(
    round(
      coveragePressure * 50 +
        reliabilityPenalty * 20 +
        cashPressure * 20 * scaleProfile.cashWeight +
        clamp(adjustedGrowthRate / 35, 0, 1) * 10 +
        signalPressure * 12,
    ),
    8,
    99,
  );

  const recommendedUnits = round(
    projectedDailyDemand *
      adjustedLeadTime *
      (
        1.18 +
        reliabilityPenalty * 0.28 +
        clamp(adjustedGrowthRate / 100, 0, 1.5) * 0.22 +
        signalPressure * 0.22
      ),
  );

  const stockoutWindow = Math.max(0, round(adjustedLeadTime - daysOfCover));
  const cashSafeUnits = round(
    projectedDailyDemand *
      adjustedLeadTime *
      (0.95 + clamp(scenario.margin / 100, 0, 0.5) + signalPressure * 0.08),
  );

  const businessSignalLabelMap = {
    ecommerce: "Launch and promotion pressure",
    retail: "Seasonality intensity",
    wholesale: "Account concentration",
    manufacturing: "Component dependency risk",
    distribution: "Network imbalance pressure",
    consumerBrand: "Launch and hero-SKU pressure",
  };
  const businessSignalLabel =
    businessSignalLabelMap[scenario.businessType] || "Business signal";

  let badgeLevel = "low";
  let badgeText = "Healthy";
  let summary = `${businessType} coverage is stable for this ${scaleType}. Auretix would stay in monitoring mode and protect working capital.`;
  let supportTier = {
    name: "Starter",
    reason:
      "Best for businesses that mainly need automated reorder timing, risk alerts, and lightweight guidance.",
    price: "Software-led support",
  };
  let specializedSupportNote = scaleProfile.supportNote;

  if (scenario.objectiveMode === "cash") {
    summary = `${businessType} is being optimized to protect cash. Auretix will bias toward smaller commitments, tighter prioritization, and disciplined buying.`;
  } else if (scenario.objectiveMode === "growth") {
    summary = `${businessType} is being optimized to protect growth. Auretix will bias toward continuity on priority items so momentum is not interrupted.`;
  }
  summary = `${summary} Scenario mode: ${scenarioModeLabel}.`;

  if (riskScore >= 70 || urgency >= 70) {
    badgeLevel = "high";
    badgeText = "Critical";
    summary = `${businessType} demand is outrunning safe inventory coverage. Auretix would intervene now to prevent a painful stockout and expensive recovery.`;
    supportTier = {
      name: "Operator+",
      reason:
        "This account needs hands-on procurement and inventory support, not just alerts. The business is exposed to stockout, supplier risk, or cash-pressure decisions.",
      price: "High-touch support",
    };
    specializedSupportNote = `Auretix would escalate support because this ${scaleProfile.supportLabel} is facing a decision set with real commercial downside.`;
  } else if (riskScore >= 45 || urgency >= 45) {
    badgeLevel = "medium";
    badgeText = "Watch closely";
    summary = `${businessType} operations are still recoverable, but the margin for error is shrinking. Auretix would move from monitoring into guided decision support.`;
    supportTier = {
      name: "Growth",
      reason:
        "Best for scaling businesses that need forecasting, purchasing recommendations, and regular operator guidance as demand becomes less predictable.",
      price: "Guided decision support",
    };
    specializedSupportNote = `Auretix would keep this ${scaleProfile.supportLabel} on tighter decision support because the business is still manageable but losing flexibility.`;
  }

  let primaryAction = profile.lowAction;
  if (badgeLevel === "medium") {
    primaryAction = profile.mediumAction;
  }
  if (badgeLevel === "high") {
    primaryAction = profile.highAction;
  }

  const reorderAdvice =
    scenario.objectiveMode === "cash"
      ? `Cash-first recommendation: protect the minimum viable coverage around ${cashSafeUnits} units before funding lower-priority inventory. ${profile.procurementAdvice}`
      : scenario.objectiveMode === "growth"
        ? `Growth-first recommendation: lean closer to ${recommendedUnits} units so priority inventory does not choke demand momentum. ${profile.procurementAdvice}`
        : badgeLevel === "high"
          ? `Recommended immediate coverage: ${recommendedUnits} units. If cash is tight, protect at least ${cashSafeUnits} units to reduce service failure risk. ${profile.procurementAdvice}`
          : badgeLevel === "medium"
            ? `Suggested planning range: ${cashSafeUnits} to ${recommendedUnits} units, depending on how aggressively you want to trade growth against cash protection. ${profile.procurementAdvice}`
            : `Target ${recommendedUnits} units on the next buying cycle to preserve service levels without overbuying. ${profile.procurementAdvice}`;

  const actions = [
    primaryAction,
    reorderAdvice,
    profile.procurementFocus,
    profile.supplyFocus,
    specializedSupportNote,
    `Current objective mode: ${objectiveMode}.`,
    `Scenario mode: ${scenarioModeLabel}.`,
    `${businessSignalLabel}: ${round(businessSignal)}/100. Auretix is using this business-specific signal to shape the recommendation.`,
    scenario.margin < 18
      ? "Margin is thin. Auretix would tighten reorder discipline and push for supplier or purchasing improvements before expanding risk."
      : "Margin is healthy enough to support growth, but only if purchasing timing stays disciplined.",
  ];

  const metrics = [
    {
      label: "Risk score",
      value: `${riskScore}/100`,
      detail: "Combined pressure from coverage, supplier reliability, cash runway, and margin quality.",
    },
    {
      label: "Days of cover",
      value: `${daysOfCover.toFixed(1)} days`,
      detail: `Projected daily demand is ${projectedDailyDemand.toFixed(1)} units with ${adjustedGrowthRate}% growth. ${profile.demandRisk}`,
    },
    {
      label: "Recommended PO",
      value: `${recommendedUnits} units`,
      detail: `Cash-safe floor: ${cashSafeUnits} units. Lead time assumption: ${adjustedLeadTime} days.`,
    },
    {
      label: "Objective mode",
      value: objectiveMode,
      detail: "This tells Auretix which tradeoff to favor when recommendations compete with each other.",
    },
    {
      label: "Scenario mode",
      value: scenarioModeLabel,
      detail: "This tells Auretix whether to simulate normal conditions, supplier delays, or demand spikes.",
    },
    {
      label: businessSignalLabel,
      value: `${round(businessSignal)}/100`,
      detail: "This is the business-specific operating pressure Auretix is layering into the base procurement and supply-chain model.",
    },
    {
      label: "Urgency",
      value: `${urgency}/100`,
      detail: `Auretix uses urgency to decide how much hands-on support this business should receive.`,
    },
  ];

  const procurementPanel = {
    key: "procurement",
    title: "Procurement",
    badge:
      scenario.margin < 18 || cashPressure > 0.45
        ? "Guard cash"
        : "Buy with confidence",
    points: [
      `Recommended PO size: ${recommendedUnits} units.`,
      `Cash-safe floor: ${cashSafeUnits} units if working capital is tight.`,
      profile.procurementFocus,
      `${businessSignalLabel}: ${round(businessSignal)}/100.`,
      `Decision objective: ${objectiveMode}.`,
      `Scenario mode: ${scenarioModeLabel}.`,
      scenario.supplierReliability < 80
        ? "Supplier reliability is below ideal, so Auretix would prepare a backup vendor or split the PO."
        : "Supplier reliability is healthy enough for a standard reorder path.",
    ],
  };

  const supplyChainPanel = {
    key: "supply-chain",
    title: "Supply chain",
    badge: daysOfCover < scenario.leadTime ? "Service risk" : "Flow stable",
    points: [
      `Projected cover: ${daysOfCover.toFixed(1)} days against a ${adjustedLeadTime}-day lead time.`,
      profile.supplyFocus,
      profile.supplyAdvice,
      `Decision objective: ${objectiveMode}.`,
      `Scenario mode: ${scenarioModeLabel}.`,
      `${businessSignalLabel} is currently adding extra pressure to the operational plan.`,
      stockoutWindow > 0
        ? `You are exposed to roughly ${stockoutWindow} days of stockout risk if the inbound or supplier plan slips.`
        : "Current buffer is still covering the inbound window, but momentum needs monitoring.",
    ],
  };

  const combinedPanel = {
    key: "decision-layer",
    title: "Unified decision",
    badge: badgeText,
    points: [
      primaryAction,
      profile.nextMove,
      `Decision objective: ${objectiveMode}.`,
      `Scenario mode: ${scenarioModeLabel}.`,
      `Auretix support recommendation: ${supportTier.name}.`,
      `Main tradeoff: ${scenario.margin < 18 ? "protecting cash and margin" : "balancing growth with inventory discipline"}.`,
    ],
  };

  return {
    badgeLevel,
    badgeText,
    summary,
    metrics,
    actions,
    supportTier,
    panels: [procurementPanel, supplyChainPanel, combinedPanel],
  };
}
