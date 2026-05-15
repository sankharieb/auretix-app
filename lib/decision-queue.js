import { getSeededWorkspace } from "./seeded-workspace.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value);
}

function getBusinessSignal(scenario) {
  if (scenario.businessType === "manufacturing") {
    return clamp(
      scenario.componentCriticality * 0.55 + scenario.singleSourceRisk * 0.45,
      0,
      100,
    );
  }

  if (scenario.businessType === "distribution") {
    return clamp(
      scenario.nodeImbalance * 0.7 + Math.min(scenario.warehouseCount * 6, 30),
      0,
      100,
    );
  }

  if (scenario.businessType === "wholesale") {
    return clamp(scenario.accountConcentration * 0.9, 0, 100);
  }

  return clamp(
    scenario.launchIntensity * 0.45 + scenario.seasonalityIntensity * 0.35,
    0,
    100,
  );
}

function getRoleWeight(roleIntent) {
  const roleWeights = {
    hero: 98,
    critical: 96,
    growth: 88,
    core: 82,
    cash: 78,
    reserve: 64,
    attach: 61,
    fix: 58,
    tail: 38,
  };

  return roleWeights[roleIntent] || 60;
}

function getPlaybookConfig(playbook) {
  const configs = {
    protect: {
      label: "Protect",
      badge: "Protect now",
      weight: 4,
      summary:
        "Keep this item protected because losing it would hurt continuity, revenue, or account confidence.",
    },
    grow: {
      label: "Grow",
      badge: "Lean in",
      weight: 3,
      summary:
        "Fund this item on purpose because it has the right mix of demand, margin, and upside.",
    },
    fix: {
      label: "Fix",
      badge: "Repair",
      weight: 2,
      summary:
        "Improve economics, supplier quality, or planning discipline before scaling this item harder.",
    },
    deprioritize: {
      label: "Deprioritize",
      badge: "Run lean",
      weight: 1,
      summary:
        "Reduce fresh capital exposure here until the SKU earns the right to be funded more aggressively.",
    },
  };

  return configs[playbook] || configs.protect;
}

function buildPlaybook(item, context) {
  const { averageMargin, averageProfit, objectiveMode, scenarioMode } = context;

  const marginGap = item.grossMarginPct - averageMargin;
  const profitStrength = item.monthlyProfit / Math.max(averageProfit, 1);
  const strongRole = item.roleWeight >= 85;
  const highRisk = item.riskScore >= 55;
  const weakEconomics =
    item.grossMarginPct < averageMargin - 3 ||
    item.capitalEfficiency < 26 ||
    profitStrength < 0.82;
  const lowPriorityRole = item.roleWeight <= 45 || item.roleIntent === "tail";
  const growthReady =
    item.grossMarginPct >= averageMargin &&
    item.capitalEfficiency >= 32 &&
    item.revenueShare >= 10;

  if (
    item.inventoryStatus === "Excess" &&
    (lowPriorityRole || profitStrength < 0.9 || objectiveMode === "cash")
  ) {
    return "deprioritize";
  }

  if (
    highRisk &&
    (strongRole || profitStrength >= 1.05 || item.roleIntent === "critical")
  ) {
    return "protect";
  }

  if (
    weakEconomics &&
    (highRisk || item.supplierPressure > 0.25 || item.marginPressure > 0.22)
  ) {
    return "fix";
  }

  if (
    growthReady &&
    (item.roleIntent === "growth" ||
      item.roleIntent === "hero" ||
      objectiveMode === "growth" ||
      scenarioMode === "demandSpike")
  ) {
    return "grow";
  }

  if (objectiveMode === "cash" && item.capitalEfficiency < 28 && !strongRole) {
    return "deprioritize";
  }

  if (strongRole || highRisk) {
    return "protect";
  }

  if (marginGap >= 3 && item.capitalEfficiency >= 30) {
    return "grow";
  }

  if (weakEconomics) {
    return "fix";
  }

  return "deprioritize";
}

function buildPlaybookReasons(item, playbook) {
  switch (playbook) {
    case "protect":
      return [
        `${item.name} is strategically important enough that a miss here hurts continuity more than a normal SKU miss.`,
        `${item.name} is carrying enough revenue or account value that Auretix wants it protected before lower-value items.`,
      ];
    case "grow":
      return [
        `${item.name} combines healthy margin and strong capital efficiency, so it deserves more deliberate funding.`,
        `${item.name} is converting inventory into profitable growth faster than the portfolio average.`,
      ];
    case "fix":
      return [
        `${item.name} is still relevant, but its economics or supplier conditions are not clean enough to scale confidently.`,
        `Auretix wants margin, reliability, or planning discipline improved before more cash gets committed here.`,
      ];
    default:
      return [
        `${item.name} is not earning top capital priority right now relative to the rest of the portfolio.`,
        `Auretix would rather keep this item lean than protect it as aggressively as stronger revenue or margin drivers.`,
      ];
  }
}

function buildActionCopy(item, playbook, objectiveMode) {
  switch (playbook) {
    case "protect":
      return `Protect ${item.name} now with a committed PO plan, tighter inbound tracking, and a supplier fallback.`;
    case "grow":
      return `Keep ${item.name} funded on purpose and give it enough runway to capture profitable demand.`;
    case "fix":
      return objectiveMode === "cash"
        ? `Hold ${item.name} to a disciplined buy plan and repair margin or supplier quality before scaling it.`
        : `Repair ${item.name} by tightening procurement, margin, or supplier reliability before pushing harder.`;
    default:
      return `Run ${item.name} lean, avoid overcommitting cash, and let stronger items earn capital first.`;
  }
}

function buildActionPaths(item, playbook, objectiveMode, scenarioMode) {
  const protectOutcome =
    playbook === "protect"
      ? "Protects revenue or continuity fastest by locking in supply before a real interruption lands."
      : playbook === "grow"
        ? "Keeps momentum alive and supports profitable growth before competitors or stock gaps slow it down."
        : playbook === "fix"
          ? "Can solve coverage, but risks scaling an unhealthy item before the root issue is fixed."
          : "Adds inventory, but may tie up capital in a product that is not your best use of cash right now.";

  const delayOutcome =
    playbook === "deprioritize"
      ? "This is usually acceptable because Auretix does not want fresh capital flowing here yet."
      : playbook === "fix"
        ? "Buys time to repair margin or supplier terms, but only if the service risk stays contained."
        : scenarioMode === "supplierDelay"
          ? "Delay is more dangerous in a supplier delay case because recovery time shrinks if inbound slips again."
          : "Preserves short-term cash, but increases the chance that coverage or momentum gets harder to recover later.";

  const riskCarry = round(item.cashImpact * 0.34);

  return [
    {
      key: "doNothing",
      label: "Do nothing",
      outcome:
        playbook === "deprioritize"
          ? "Lowest short-term spend, but the item stays under watch in case it starts hurting service or carrying too much stock."
          : "Leaves the current exposure untouched, so risk keeps compounding if demand or supply shifts against you.",
      cashImpact: "$0 now",
    },
    {
      key: "reorderNow",
      label: "Reorder now",
      outcome:
        objectiveMode === "cash" && playbook !== "protect"
          ? `${protectOutcome} Use only if the item has earned immediate capital despite the cash-protection goal.`
          : protectOutcome,
      cashImpact: `$${item.cashImpact}`,
    },
    {
      key: "delay",
      label: "Delay",
      outcome: delayOutcome,
      cashImpact:
        playbook === "deprioritize" ? "Cash preserved" : `$${riskCarry} risk carry`,
    },
  ];
}

function getConstraintProfile(scenario, workspace, rankedItems, supplierRows) {
  const totalRecommendedUnits = rankedItems.reduce(
    (sum, item) => sum + item.reorderUnits,
    0,
  );
  const averageUnitCost =
    rankedItems.reduce((sum, item) => sum + item.unitCost, 0) /
    Math.max(rankedItems.length, 1);
  const recommendedSpend = round(
    rankedItems.reduce((sum, item) => sum + item.cashImpact, 0),
  );
  const cashBudget = round(
    scenario.cashRunway * (scenario.monthlyUnits / 30) * averageUnitCost * 0.58,
  );
  const warehouseCapacityUnits = round(scenario.inventory * 1.58);
  const currentFootprintUnits =
    rankedItems.reduce((sum, item) => sum + item.onHandUnits + item.inboundUnits, 0);
  const projectedFootprintUnits = currentFootprintUnits + totalRecommendedUnits;
  const weakestSupplier = supplierRows[0] || null;
  const weakestSupplierLeadTime = weakestSupplier?.leadTimeDays ?? scenario.leadTime;
  const supplierCapacityUnits = round(totalRecommendedUnits * 0.82);
  const moqUnits = round(
    rankedItems
      .slice(0, 3)
      .reduce((sum, item) => sum + Math.max(120, round(item.monthlyRevenue / 55)), 0),
  );
  const paymentPressure =
    weakestSupplier?.paymentTerms === "50/50"
      ? "Supplier deposit terms are front-loading cash before inventory turns."
      : weakestSupplier?.paymentTerms === "30/70"
        ? "Supplier payment terms still put early cash pressure on larger POs."
        : "Payment terms are manageable enough to support a normal PO cadence.";

  return {
    cashBudget,
    recommendedSpend,
    spendGap: recommendedSpend - cashBudget,
    warehouseCapacityUnits,
    currentFootprintUnits,
    projectedFootprintUnits,
    capacityGap: projectedFootprintUnits - warehouseCapacityUnits,
    weakestSupplierName: weakestSupplier?.name ?? "No critical supplier",
    weakestSupplierReliability: weakestSupplier?.reliability ?? 0,
    weakestSupplierLeadTime,
    supplierCapacityUnits,
    supplierCapacityGap: totalRecommendedUnits - supplierCapacityUnits,
    moqUnits,
    totalRecommendedUnits,
    paymentPressure,
  };
}

function buildPlanningBoard(rankedItems, constraintProfile, objective, scenarioProfile) {
  const protectItems = rankedItems.filter((item) => item.playbook === "protect");
  const fixItems = rankedItems.filter((item) => item.playbook === "fix");
  const growItems = rankedItems.filter((item) => item.playbook === "grow");
  const leanItems = rankedItems.filter((item) => item.playbook === "deprioritize");

  return [
    {
      horizon: "30 days",
      badge: "Stabilize",
      focus: "Close the immediate inventory and supplier gaps that could hit revenue first.",
      outcomes: [
        `${protectItems.length} products should be protected inside the next buying window.`,
        `Approved spend should stay inside $${constraintProfile.cashBudget} unless the business is explicitly prioritizing growth.`,
        `${constraintProfile.weakestSupplierName} is the weakest supplier link inside the near-term plan.`,
      ],
    },
    {
      horizon: "60 days",
      badge: "Rebalance",
      focus: "Repair margin leaks and rebalance supply so the portfolio stops over-funding weak items.",
      outcomes: [
        `${fixItems.length} products need procurement, margin, or supplier fixes before scaling harder.`,
        `${leanItems.length} products should stay lean while stronger items absorb working capital first.`,
        `Projected footprint reaches ${constraintProfile.projectedFootprintUnits} units if every recommendation is funded.`,
      ],
    },
    {
      horizon: "90 days",
      badge: "Scale",
      focus: "Choose which products earn future capital and which channels deserve deeper inventory confidence.",
      outcomes: [
        `${growItems.length} products currently qualify for deliberate scale funding.`,
        `Scenario planning remains anchored to ${scenarioProfile.label.toLowerCase()}, so future commitments should be stress-tested before they are locked in.`,
        `${objective.todayTitle} transitions from tactical firefighting into a repeatable operating rhythm by this horizon.`,
      ],
    },
  ];
}

function buildChannelAllocations(rankedItems) {
  const channelMap = {};

  for (const item of rankedItems) {
    if (!channelMap[item.channel]) {
      channelMap[item.channel] = {
        channel: item.channel,
        products: 0,
        monthlyRevenue: 0,
        monthlyProfit: 0,
        protectCount: 0,
        riskLoad: 0,
        availableUnits: 0,
      };
    }

    const channel = channelMap[item.channel];
    channel.products += 1;
    channel.monthlyRevenue += item.monthlyRevenue;
    channel.monthlyProfit += item.monthlyProfit;
    channel.riskLoad += item.riskScore;
    channel.availableUnits += item.availableUnits;
    if (item.playbook === "protect") {
      channel.protectCount += 1;
    }
  }

  const allocations = Object.values(channelMap).map((channel) => {
    const profitShare = round(channel.monthlyProfit / Math.max(channel.monthlyRevenue, 1) * 100);
    const priority =
      channel.protectCount >= 2
        ? "Protect channel"
        : channel.riskLoad / Math.max(channel.products, 1) >= 45
          ? "Watch channel"
          : "Balanced";

    return {
      ...channel,
      riskLoad: round(channel.riskLoad / Math.max(channel.products, 1)),
      profitShare,
      recommendedAllocation:
        priority === "Protect channel"
          ? "Preserve inventory depth here first."
          : priority === "Watch channel"
            ? "Rebalance carefully before pushing more stock."
            : "Keep normal allocation discipline.",
    };
  });

  return allocations.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
}

function buildSupplierScorecards(rankedItems, supplierRows) {
  return supplierRows.map((supplier) => {
    const items = rankedItems.filter((item) => item.supplierName === supplier.name);
    const avgRisk = round(
      items.reduce((sum, item) => sum + item.riskScore, 0) / Math.max(items.length, 1),
    );
    const avgMargin = round(
      items.reduce((sum, item) => sum + item.grossMarginPct, 0) / Math.max(items.length, 1),
    );
    const supplierGrade =
      supplier.reliability >= 82
        ? "A"
        : supplier.reliability >= 75
          ? "B"
          : supplier.reliability >= 68
            ? "C"
            : "D";

    return {
      ...supplier,
      avgRisk,
      avgMargin,
      supplierGrade,
      recommendation:
        supplierGrade === "A"
          ? "Safe for core volume."
          : supplierGrade === "B"
            ? "Use with active monitoring."
            : supplierGrade === "C"
              ? "Split risk or tighten follow-up."
              : "Do not over-concentrate volume here.",
    };
  });
}

function buildTaskWorkflow(rankedItems) {
  return rankedItems.slice(0, 8).map((item, index) => ({
    id: item.id,
    sku: item.name,
    lane: item.playbookLabel,
    action: item.action,
    owner:
      item.playbook === "protect"
        ? "Inventory lead"
        : item.playbook === "fix"
          ? "Procurement manager"
          : item.playbook === "grow"
            ? "Growth operator"
            : "Planning analyst",
    dueWindow:
      item.priority === "Act now"
        ? "Today"
        : item.priority === "This week"
          ? "This week"
          : "Next cycle",
    escalation:
      index < 2 ? "Executive visibility" : item.playbook === "fix" ? "Supplier review" : "Normal",
  }));
}

function buildForecastProfile(item, scenarioMode) {
  const scenarioDemandMultiplier =
    scenarioMode === "demandSpike" ? 1.18 : scenarioMode === "supplierDelay" ? 0.96 : 1;
  const growthBias =
    item.playbook === "grow"
      ? 1.12
      : item.playbook === "protect"
        ? 1.05
        : item.playbook === "fix"
          ? 0.97
          : 0.93;
  const baseline30 = round((item.monthlyRevenue / Math.max(item.unitPrice, 1)) * scenarioDemandMultiplier);
  const forecast30 = round(baseline30 * growthBias);
  const forecast60 = round(forecast30 * (1 + Math.max(item.revenueShare, 4) / 180));
  const forecast90 = round(forecast60 * (1 + Math.max(item.capitalEfficiency, 8) / 260));
  const confidence = clamp(
    round(
      84 -
        item.supplierPressure * 26 -
        Math.max(0, 22 - item.grossMarginPct) * 0.45 -
        Math.max(0, item.riskScore - 40) * 0.22,
    ),
    48,
    95,
  );

  return {
    forecast30,
    forecast60,
    forecast90,
    confidence,
    demandTrend:
      forecast90 > forecast30 * 1.12
        ? "Rising"
        : forecast90 < forecast30 * 0.92
          ? "Softening"
          : "Stable",
  };
}

function buildAnomalyDetections(rankedItems, supplierRows, scenarioMode) {
  const anomalies = [];

  for (const item of rankedItems) {
    const coverageDays = item.availableUnits / Math.max(item.monthlyRevenue / Math.max(item.unitPrice, 1) / 30, 1);

    if (item.playbook === "grow" && item.forecast30 > item.availableUnits * 1.45) {
      anomalies.push({
        id: `anomaly-demand-${item.id}`,
        severity: "High",
        title: `${item.name} demand acceleration`,
        detail: `30-day forecast is outrunning currently available units, which means this growth item could snap into a stockout if momentum holds.`,
        owner: "Demand planner",
      });
    }

    if (item.playbook === "fix" && item.grossMarginPct < 20) {
      anomalies.push({
        id: `anomaly-margin-${item.id}`,
        severity: "Medium",
        title: `${item.name} margin decay`,
        detail: `This item is already in Fix and the margin profile is thin enough that fresh buys can destroy cash efficiency.`,
        owner: "Procurement manager",
      });
    }

    if (coverageDays < 12 && item.nextEtaDays > 14) {
      anomalies.push({
        id: `anomaly-cover-${item.id}`,
        severity: "High",
        title: `${item.name} coverage gap`,
        detail: `Available coverage is tightening faster than inbound timing, which creates a forecasted service gap before the next replenishment lands.`,
        owner: "Inventory lead",
      });
    }
  }

  const weakSupplier = supplierRows.find((supplier) => supplier.reliability < 72);
  if (weakSupplier) {
    anomalies.push({
      id: `anomaly-supplier-${weakSupplier.id}`,
      severity: scenarioMode === "supplierDelay" ? "High" : "Medium",
      title: `${weakSupplier.name} supplier drift`,
      detail: `Supplier reliability is below target and is now influencing multiple product decisions, which raises the odds of repeated inbound variance.`,
      owner: "Supplier manager",
    });
  }

  return anomalies.slice(0, 6);
}

function pickAlternateSupplier(currentSupplierId, suppliers) {
  const alternatives = suppliers
    .filter((supplier) => supplier.id !== currentSupplierId)
    .sort((a, b) => {
      const scoreA = a.reliability + a.fallbackScore * 0.35 - a.leadTimeDays * 0.4;
      const scoreB = b.reliability + b.fallbackScore * 0.35 - b.leadTimeDays * 0.4;
      return scoreB - scoreA;
    });

  return alternatives[0] || null;
}

function getSupplierStrategyProfile(supplierId, supplierStrategyMemory = {}) {
  const stored = supplierStrategyMemory[supplierId]?.strategy || null;
  const profiles = {
    preferred: { label: "preferred", scoreAdjustment: 14 },
    watch: { label: "watch", scoreAdjustment: -4 },
    reduce: { label: "reduce", scoreAdjustment: -18 },
    exit: { label: "exit", scoreAdjustment: -40 },
    neutral: { label: "neutral", scoreAdjustment: 0 },
  };

  return profiles[stored || "neutral"] || profiles.neutral;
}

function getFreightMultiplier(shippingMode) {
  if (shippingMode === "Air") {
    return 1.22;
  }

  if (shippingMode === "Air + ocean split") {
    return 1.14;
  }

  return 1.07;
}

function getShippingTransitDays(shippingMode) {
  if (shippingMode === "Air") {
    return 6;
  }

  if (shippingMode === "Air + ocean split") {
    return 11;
  }

  return 18;
}

function getComparativeUnitCost(baseUnitCost, supplier, currentSupplier) {
  if (!supplier) {
    return baseUnitCost;
  }

  if (supplier.id === currentSupplier?.id) {
    return baseUnitCost;
  }

  return round((baseUnitCost * (0.96 + (100 - supplier.reliability) / 800)) * 100) / 100;
}

function getPaymentTermsProfile(paymentTerms, arrivalDays, landedSpend) {
  if (paymentTerms === "30/70") {
    const deposit = round(landedSpend * 0.3);
    const balance = Math.max(0, round(landedSpend - deposit));

    return {
      upfrontCash: deposit,
      settlementCash: balance,
      settlementDays: Math.max(5, arrivalDays - 2),
      label: `${deposit} now / ${balance} in ${Math.max(5, arrivalDays - 2)}d`,
    };
  }

  if (paymentTerms === "50/50") {
    const deposit = round(landedSpend * 0.5);
    const balance = Math.max(0, round(landedSpend - deposit));

    return {
      upfrontCash: deposit,
      settlementCash: balance,
      settlementDays: Math.max(4, round(arrivalDays * 0.55)),
      label: `${deposit} now / ${balance} in ${Math.max(4, round(arrivalDays * 0.55))}d`,
    };
  }

  if (paymentTerms === "Net 15") {
    return {
      upfrontCash: 0,
      settlementCash: landedSpend,
      settlementDays: arrivalDays + 15,
      label: `0 now / ${landedSpend} in ${arrivalDays + 15}d`,
    };
  }

  return {
    upfrontCash: 0,
    settlementCash: landedSpend,
    settlementDays: arrivalDays + 30,
    label: `0 now / ${landedSpend} in ${arrivalDays + 30}d`,
  };
}

function formatArrivalLabel(daysUntilArrival) {
  const arrivalDate = new Date();
  arrivalDate.setDate(arrivalDate.getDate() + Math.max(1, daysUntilArrival));

  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(arrivalDate)} (${daysUntilArrival}d)`;
}

function getSupplierMemory(supplier) {
  return {
    onTimeRate: supplier.onTimeRate ?? clamp(supplier.reliability + 4, 55, 96),
    leadTimeDriftDays: supplier.leadTimeDriftDays ?? clamp(round((100 - supplier.reliability) / 6), 1, 9),
    defectRisk: supplier.defectRisk ?? clamp(round((100 - supplier.reliability) / 2.8), 6, 28),
    termsQuality: supplier.termsQuality ?? clamp(round(supplier.fallbackScore * 0.95), 45, 90),
    historicalRecommendationScore:
      supplier.historicalRecommendationScore ??
      clamp(round(supplier.reliability * 0.48 + supplier.fallbackScore * 0.52), 45, 92),
  };
}

function getServiceRiskLabel(score) {
  if (score >= 72) {
    return "High";
  }

  if (score >= 46) {
    return "Medium";
  }

  return "Low";
}

function buildSupplierComparisonRow(
  item,
  supplier,
  currentSupplier,
  shippingMode,
  supplierStrategyMemory,
) {
  const supplierMemory = getSupplierMemory(supplier);
  const strategyProfile = getSupplierStrategyProfile(
    supplier.id,
    supplierStrategyMemory,
  );
  const freightMultiplier = getFreightMultiplier(shippingMode);
  const comparativeUnitCost = getComparativeUnitCost(item.unitCost, supplier, currentSupplier);
  const landedUnitCost = round(comparativeUnitCost * freightMultiplier * 100) / 100;
  const landedMarginPct = round(
    ((item.unitPrice - landedUnitCost) / Math.max(item.unitPrice, 1)) * 100,
  );

  return {
    id: `${item.id}-${supplier.id}`,
    name: supplier.name,
    unitCost: comparativeUnitCost,
    leadTimeDays: supplier.leadTimeDays,
    reliability: supplier.reliability,
    paymentTerms: supplier.paymentTerms,
    shippingMode,
    landedUnitCost,
    landedMarginPct,
    supplierMemory,
    strategy: strategyProfile.label,
    strategyScoreAdjustment: strategyProfile.scoreAdjustment,
    recommendation:
      strategyProfile.label === "exit"
        ? "Exit lane"
        : strategyProfile.label === "reduce"
          ? "Reduced lane"
          : supplier.id === currentSupplier?.id
        ? "Current lane"
        : landedMarginPct >= item.grossMarginPct - 2 &&
            supplier.reliability >= (currentSupplier?.reliability ?? supplier.reliability)
          ? "Strong alternate"
          : "Fallback option",
  };
}

function buildAwardScenario({
  item,
  label,
  decision,
  shippingMode,
  allocations,
  scenarioMode,
  objectiveMode,
}) {
  const totalWeight = allocations.reduce((sum, allocation) => sum + allocation.share, 0);
  const normalizedAllocations = allocations.map((allocation) => ({
    ...allocation,
    share: allocation.share / Math.max(totalWeight, 0.0001),
  }));

  const weightedLeadTime = normalizedAllocations.reduce(
    (sum, allocation) => sum + allocation.comparison.leadTimeDays * allocation.share,
    0,
  );
  const weightedReliability = normalizedAllocations.reduce(
    (sum, allocation) => sum + allocation.comparison.reliability * allocation.share,
    0,
  );
  const weightedLandedUnitCost = normalizedAllocations.reduce(
    (sum, allocation) => sum + allocation.comparison.landedUnitCost * allocation.share,
    0,
  );
  const weightedTermsQuality = normalizedAllocations.reduce(
    (sum, allocation) => sum + allocation.comparison.supplierMemory.termsQuality * allocation.share,
    0,
  );
  const weightedStrategyAdjustment = normalizedAllocations.reduce(
    (sum, allocation) =>
      sum + allocation.comparison.strategyScoreAdjustment * allocation.share,
    0,
  );
  const weightedLeadTimeDrift = normalizedAllocations.reduce(
    (sum, allocation) => sum + allocation.comparison.supplierMemory.leadTimeDriftDays * allocation.share,
    0,
  );
  const weightedDefectRisk = normalizedAllocations.reduce(
    (sum, allocation) => sum + allocation.comparison.supplierMemory.defectRisk * allocation.share,
    0,
  );
  const landedMarginPct = round(
    ((item.unitPrice - weightedLandedUnitCost) / Math.max(item.unitPrice, 1)) * 100,
  );
  const transitDays = getShippingTransitDays(shippingMode);
  const scenarioDelayDays =
    scenarioMode === "supplierDelay" ? 6 : scenarioMode === "demandSpike" ? 2 : 0;
  const arrivalDays = round(weightedLeadTime + transitDays + scenarioDelayDays);
  const probabilityOfDelay = clamp(
    round(
      (100 - weightedReliability) * 0.9 +
        weightedLeadTimeDrift * 3 +
        weightedDefectRisk * 0.7 +
        (scenarioMode === "supplierDelay" ? 12 : 0),
    ),
    9,
    78,
  );
  const serviceRiskScore = clamp(
    round(
      probabilityOfDelay * 0.42 +
        Math.max(0, arrivalDays - item.daysOfCover) * 2.4 +
        Math.max(0, item.reorderPointUnits - item.availableUnits) / Math.max(item.reorderPointUnits, 1) * 36,
    ),
    12,
    94,
  );
  const landedSpend = round(weightedLandedUnitCost * item.reorderUnits);
  const cashProfiles = normalizedAllocations.map((allocation) =>
    getPaymentTermsProfile(
      allocation.comparison.paymentTerms,
      arrivalDays,
      round(landedSpend * allocation.share),
    ),
  );
  const upfrontCash = cashProfiles.reduce((sum, profile) => sum + profile.upfrontCash, 0);
  const weightedSettlementDays = round(
    cashProfiles.reduce((sum, profile, index) => sum + profile.settlementDays * normalizedAllocations[index].share, 0),
  );
  const scenarioScore =
    landedMarginPct * (objectiveMode === "cash" ? 1.2 : 1) +
    weightedReliability * 0.34 +
    weightedTermsQuality * 0.18 -
    probabilityOfDelay * 0.46 -
    serviceRiskScore * (objectiveMode === "service" ? 0.34 : 0.24) -
    upfrontCash / Math.max(item.cashImpact, 1) * (objectiveMode === "cash" ? 24 : 12) +
    weightedStrategyAdjustment;

  return {
    id: `${item.id}-${decision.toLowerCase()}`,
    label,
    decision,
    awardedSupplier: normalizedAllocations
      .map((allocation) => `${allocation.comparison.name} ${round(allocation.share * 100)}%`)
      .join(" + "),
    landedMarginPct,
    arrivalDate: formatArrivalLabel(arrivalDays),
    arrivalDays,
    serviceRisk: getServiceRiskLabel(serviceRiskScore),
    serviceRiskScore,
    cashOutTiming:
      upfrontCash > 0
        ? `$${upfrontCash} now, balance in ${weightedSettlementDays}d`
        : `$0 now, payable in ${weightedSettlementDays}d`,
    probabilityOfDelay,
    landedSpend,
    scenarioScore: round(scenarioScore),
  };
}

function buildProcurementOptimizer(
  rankedItems,
  workspace,
  constraintProfile,
  objectiveMode,
  scenarioMode,
  supplierStrategyMemory = {},
) {
  const suppliersById = Object.fromEntries(
    workspace.suppliers.map((supplier) => [supplier.id, supplier]),
  );
  const priorityItems = rankedItems
    .filter((item) => item.priority !== "Monitor" || item.playbook === "grow")
    .slice(0, 5);
  let budgetRemaining = constraintProfile.cashBudget;

  const recommendations = priorityItems.map((item) => {
    const currentSupplier = suppliersById[item.supplierId] || null;
    const alternateSupplier = pickAlternateSupplier(item.supplierId, workspace.suppliers);
    const maxAffordableUnits = Math.max(0, round(budgetRemaining / Math.max(item.unitCost, 1)));
    const bestBuyUnits = Math.max(
      0,
      Math.min(
        item.reorderUnits,
        objectiveMode === "cash"
          ? maxAffordableUnits
          : Math.max(round(maxAffordableUnits * 1.08), Math.round(item.reorderUnits * 0.82)),
      ),
    );
    const spend = round(bestBuyUnits * item.unitCost);
    budgetRemaining = Math.max(0, budgetRemaining - spend);

    const poStrategy =
      item.supplierReliability < 74 || item.poRiskCount > 0 || scenarioMode === "supplierDelay"
        ? "Split PO"
        : "Single PO";
    const shippingMode =
      item.priority === "Act now" && item.nextEtaDays > 12
        ? "Air"
        : item.priority === "Act now" && item.nextEtaDays > 8
          ? "Air + ocean split"
          : "Ocean";
    const supplierDecision =
      alternateSupplier &&
      currentSupplier &&
      (currentSupplier.reliability < 74 ||
        alternateSupplier.reliability - currentSupplier.reliability >= 8)
        ? `${currentSupplier.name} + ${alternateSupplier.name}`
        : currentSupplier?.name || "No supplier selected";
    const supplierComparisons = [currentSupplier, alternateSupplier]
      .filter(Boolean)
      .map((supplier) =>
        buildSupplierComparisonRow(
          item,
          supplier,
          currentSupplier,
          shippingMode,
          supplierStrategyMemory,
        ),
      );
    const currentComparison = supplierComparisons[0] || null;
    const alternateComparison = supplierComparisons[1] || null;
    const awardScenarios = [
      currentComparison
        ? buildAwardScenario({
            item,
            label: "Current supplier",
            decision: "Stay",
            shippingMode,
            allocations: [{ comparison: currentComparison, share: 1 }],
            scenarioMode,
            objectiveMode,
          })
        : null,
      alternateComparison
        ? buildAwardScenario({
            item,
            label: "Alternate supplier",
            decision: "Shift",
            shippingMode,
            allocations: [{ comparison: alternateComparison, share: 1 }],
            scenarioMode,
            objectiveMode,
          })
        : null,
      currentComparison && alternateComparison
        ? buildAwardScenario({
            item,
            label: "Split award",
            decision: "Split",
            shippingMode,
            allocations: [
              { comparison: currentComparison, share: 0.55 },
              { comparison: alternateComparison, share: 0.45 },
            ],
            scenarioMode,
            objectiveMode,
          })
        : null,
    ].filter(Boolean);
    const currentScenario = awardScenarios.find((scenario) => scenario.decision === "Stay") || null;
    const alternateScenario = awardScenarios.find((scenario) => scenario.decision === "Shift") || null;
    const splitScenario = awardScenarios.find((scenario) => scenario.decision === "Split") || null;
    const bestScenario = [...awardScenarios].sort((a, b) => b.scenarioScore - a.scenarioScore)[0];
    const escalationTrigger =
      awardScenarios.every((scenario) => scenario.serviceRisk === "High") ||
      (currentComparison &&
        alternateComparison &&
        currentComparison.supplierMemory.leadTimeDriftDays >= 6 &&
        alternateComparison.supplierMemory.leadTimeDriftDays >= 6);
    const strategyForcedShift =
      currentComparison?.strategy === "exit" && Boolean(alternateScenario);
    const strategyForcedReduce =
      currentComparison?.strategy === "reduce" &&
      Boolean(splitScenario || alternateScenario);
    const shiftTrigger =
      currentScenario &&
      alternateScenario &&
      alternateScenario.landedMarginPct >= currentScenario.landedMarginPct &&
      alternateScenario.probabilityOfDelay <= currentScenario.probabilityOfDelay - 8 &&
      alternateScenario.serviceRiskScore <= currentScenario.serviceRiskScore;
    const splitTrigger =
      splitScenario &&
      currentScenario &&
      alternateScenario &&
      (currentScenario.serviceRisk === "High" ||
        currentComparison?.supplierMemory.leadTimeDriftDays >= 6 ||
        Math.abs(currentScenario.probabilityOfDelay - alternateScenario.probabilityOfDelay) <= 8);
    const recommendedAward = escalationTrigger
      ? "Escalate"
      : strategyForcedShift
        ? "Shift"
        : strategyForcedReduce
          ? splitScenario
            ? "Split"
            : "Shift"
      : shiftTrigger
        ? "Shift"
        : splitTrigger
          ? "Split"
          : bestScenario?.decision || "Stay";
    const awardReason =
      recommendedAward === "Escalate"
        ? "Both supplier paths are carrying enough timing or quality risk that Auretix wants an operator review before committing fresh volume."
        : strategyForcedShift
          ? "This supplier is already in Exit strategy memory, so Auretix is steering new volume away and favoring the strongest alternate path."
          : strategyForcedReduce
            ? "This supplier is already in Reduce strategy memory, so Auretix is deliberately limiting concentration and shifting some commitment elsewhere."
        : recommendedAward === "Split"
          ? "A split award protects service while reducing concentration risk and keeping more optionality in the plan."
          : recommendedAward === "Shift"
            ? "The alternate lane is producing the best weighted mix of landed margin, timing, and supplier stability."
            : "The current lane is still the best commercial path once margin, risk, and cash timing are balanced together.";
    const supplierMemory = supplierComparisons.map((comparison) => ({
      id: comparison.id,
      name: comparison.name,
      onTimeRate: comparison.supplierMemory.onTimeRate,
      leadTimeDriftDays: comparison.supplierMemory.leadTimeDriftDays,
      defectRisk: comparison.supplierMemory.defectRisk,
      termsQuality: comparison.supplierMemory.termsQuality,
      historicalRecommendationScore: comparison.supplierMemory.historicalRecommendationScore,
      strategy: comparison.strategy,
    }));

    return {
      id: item.id,
      product: item.name,
      currentSupplier: currentSupplier?.name || "Unknown supplier",
      alternateSupplier: alternateSupplier?.name || "No alternate",
      poStrategy,
      shippingMode,
      supplierDecision,
      bestBuyUnits,
      maxAffordableUnits,
      spend,
      supplierComparisons,
      awardScenarios,
      supplierMemory,
      recommendedAward,
      awardReason,
      rationale:
        poStrategy === "Split PO"
          ? `Auretix wants to reduce supplier concentration or recover timeline risk before all volume is committed.`
          : `Auretix is comfortable keeping the buy simpler here because supplier and timing risk are currently more contained.`,
    };
  });

  const optimizerSummary = [
    `Cash budget available for this cycle: $${constraintProfile.cashBudget}.`,
    `Current recommendation set leaves $${budgetRemaining} of modeled spend still available after optimized buys.`,
    objectiveMode === "cash"
      ? "Optimizer bias: protect minimum viable coverage before overcommitting on lower-confidence demand."
      : objectiveMode === "growth"
        ? "Optimizer bias: preserve growth on the strongest products before spreading budget too thin."
        : "Optimizer bias: preserve service continuity first, then simplify where procurement risk is acceptable.",
  ];

  return {
    recommendations,
    optimizerSummary,
  };
}

function buildScenarioCompare(baseScenario, objectiveMode, businessType, workspaceOverride) {
  const modes = ["normal", "supplierDelay", "demandSpike"];

  return modes.map((mode) => {
    const queue = buildDecisionQueue({
      ...baseScenario,
      businessType,
      objectiveMode,
      scenarioMode: mode,
    }, { skipCompare: true, workspaceOverride });

    return {
      mode,
      label: queue.overview.scenarioLabel,
      highestRiskSku: queue.overview.highestRiskSku,
      immediateCash: queue.overview.totalImmediateCash,
      protectCount: queue.playbookSummary.protect,
      fixCount: queue.playbookSummary.fix,
      openAlerts: queue.workspace.alerts.length,
    };
  });
}

function buildRecordMaps(workspace) {
  const suppliersById = Object.fromEntries(
    workspace.suppliers.map((supplier) => [supplier.id, supplier]),
  );
  const inventoryByProductId = Object.fromEntries(
    workspace.inventoryPositions.map((inventory) => [inventory.productId, inventory]),
  );
  const poLinesByProductId = {};

  for (const po of workspace.purchaseOrders) {
    if (po.status === "received") {
      continue;
    }

    for (const line of po.lineItems) {
      if (!poLinesByProductId[line.productId]) {
        poLinesByProductId[line.productId] = [];
      }

      poLinesByProductId[line.productId].push({
        ...line,
        poId: po.id,
        supplierId: po.supplierId,
        poStatus: po.status,
      });
    }
  }

  return {
    suppliersById,
    inventoryByProductId,
    poLinesByProductId,
  };
}

export function buildDecisionQueue(scenario, options = {}) {
  const workspace =
    options.workspaceOverride || getSeededWorkspace(scenario.businessType);
  const { suppliersById, inventoryByProductId, poLinesByProductId } =
    buildRecordMaps(workspace);
  const objectiveMode = scenario.objectiveMode || "service";
  const scenarioMode = scenario.scenarioMode || "normal";
  const businessSignal = getBusinessSignal(scenario);
  const scenarioProfiles = {
    normal: {
      leadTimeBoost: 0,
      supplierDrop: 0,
      demandBoost: 0,
      signalBoost: 0,
      label: "Normal conditions",
    },
    supplierDelay: {
      leadTimeBoost: 0.25,
      supplierDrop: 12,
      demandBoost: 0,
      signalBoost: 10,
      label: "Supplier delay",
    },
    demandSpike: {
      leadTimeBoost: 0.04,
      supplierDrop: 0,
      demandBoost: 0.2,
      signalBoost: 12,
      label: "Demand spike",
    },
  };
  const scenarioProfile =
    scenarioProfiles[scenarioMode] || scenarioProfiles.normal;
  const signalPressure = clamp(
    (businessSignal + scenarioProfile.signalBoost) / 100,
    0,
    1.4,
  );
  const objectiveProfiles = {
    cash: {
      riskBoost: -2,
      reorderBoost: -0.14,
      cashLabel: "Cash-first",
      todayTitle: "Protect cash now",
    },
    growth: {
      riskBoost: 4,
      reorderBoost: 0.12,
      cashLabel: "Growth-first",
      todayTitle: "Protect growth now",
    },
    service: {
      riskBoost: 0,
      reorderBoost: 0,
      cashLabel: "Service-first",
      todayTitle: "Protect service now",
    },
  };
  const objective = objectiveProfiles[objectiveMode] || objectiveProfiles.service;

  const seedMonthlyTotal = workspace.products.reduce(
    (sum, product) => sum + product.monthlyUnits,
    0,
  );
  const scalingFactor =
    seedMonthlyTotal > 0 ? scenario.monthlyUnits / seedMonthlyTotal : 1;

  const baseItems = workspace.products.map((product) => {
    const supplier = suppliersById[product.supplierId];
    const inventory = inventoryByProductId[product.id];
    const poLines = poLinesByProductId[product.id] || [];
    const adjustedLead = round(
      supplier.leadTimeDays * (1 + scenarioProfile.leadTimeBoost),
    );
    const effectiveReliability = clamp(
      supplier.reliability - scenarioProfile.supplierDrop,
      1,
      100,
    );
    const supplierPressure = (100 - effectiveReliability) / 100;
    const roleWeight = getRoleWeight(product.roleIntent);
    const monthlySkuUnits = product.monthlyUnits * scalingFactor * (1 + scenarioProfile.demandBoost);
    const dailySkuUnits = monthlySkuUnits / 30;
    const onHandUnits = inventory.onHandUnits;
    const reservedUnits = inventory.reservedUnits;
    const availableUnits = Math.max(0, onHandUnits - reservedUnits);
    const inboundUnits = poLines.reduce((sum, line) => sum + line.units, 0);
    const nextEtaDays = poLines.length > 0
      ? Math.min(...poLines.map((line) => line.etaDays))
      : adjustedLead;
    const reorderPointUnits = inventory.reorderPointUnits;
    const openPoUnits = inboundUnits;
    const unitMargin = product.unitPrice - product.unitCost;
    const grossMarginPct = round((unitMargin / product.unitPrice) * 100);
    const revenueShare = round((monthlySkuUnits / Math.max(scenario.monthlyUnits, 1)) * 100);
    const monthlyRevenue = round(monthlySkuUnits * product.unitPrice);
    const monthlyProfit = round(monthlySkuUnits * unitMargin);
    const inventoryValue = round((availableUnits + inboundUnits) * product.unitCost);
    const capitalEfficiency = round(
      (monthlyProfit / Math.max(inventoryValue, 1)) * 100,
    );
    const coveragePressure = clamp(
      (adjustedLead - availableUnits / Math.max(dailySkuUnits, 1)) / adjustedLead,
      0,
      1,
    );
    const marginPressure = clamp((22 - grossMarginPct) / 22, 0, 1);
    const growthPressure = clamp(
      (scenario.growthRate + scenarioProfile.demandBoost * 100) / 35,
      0,
      1,
    );
    const supplierRiskPoCount = poLines.filter(
      (line) => line.poStatus === "supplier_risk",
    ).length;

    const riskScore = clamp(
      round(
        coveragePressure * 34 +
          supplierPressure * 18 +
          marginPressure * 8 +
          growthPressure * 8 +
          signalPressure * 13 +
          clamp(
            (reorderPointUnits - availableUnits) / Math.max(reorderPointUnits, 1),
            0,
            1,
          ) *
            10 +
          clamp(supplierRiskPoCount * 4, 0, 10) +
          ((100 - roleWeight) / 100) * 4 +
          objective.riskBoost,
      ),
      8,
      99,
    );

    const reorderUnits = round(
      monthlySkuUnits *
        (adjustedLead / 30) *
        (1.05 + supplierPressure * 0.24 + signalPressure * 0.18 + objective.reorderBoost),
    );
    const cashImpact = round(reorderUnits * product.unitCost);

    let inventoryStatus = "Healthy";
    if (availableUnits < reorderPointUnits * 0.72 || riskScore >= 70) {
      inventoryStatus = "Below reorder point";
    } else if (availableUnits < reorderPointUnits || riskScore >= 45) {
      inventoryStatus = "Tight";
    } else if (availableUnits > reorderPointUnits * 1.45) {
      inventoryStatus = "Excess";
    }

    const riskReasons = [];

    if (availableUnits < reorderPointUnits) {
      riskReasons.push(
        `${product.name} is below its reorder point, so available coverage is already tighter than the replenishment plan wants.`,
      );
    }

    if (supplierPressure > 0.25) {
      riskReasons.push(
        `${supplier.name} is only ${effectiveReliability}% reliable in this scenario, which increases the odds that inbound timing slips when you need it most.`,
      );
    }

    if (supplierRiskPoCount > 0) {
      riskReasons.push(
        `${supplierRiskPoCount} open PO line${supplierRiskPoCount > 1 ? "s are" : " is"} already carrying supplier risk, so this item has active execution exposure, not just forecast risk.`,
      );
    }

    if (grossMarginPct < 20) {
      riskReasons.push(
        `${product.name} is moving with a thinner gross-margin profile, so mistakes here consume cash faster than they create profit.`,
      );
    }

    if (riskReasons.length === 0) {
      riskReasons.push(
        `${product.name} is stable today, but Auretix is still watching it because portfolio priorities move faster than spreadsheets do.`,
      );
    }

    return {
      id: product.id,
      supplierId: product.supplierId,
      sku: product.sku,
      name: product.name,
      roleLabel: product.roleLabel,
      roleIntent: product.roleIntent,
      roleWeight,
      supplierName: supplier.name,
      supplierReliability: effectiveReliability,
      paymentTerms: supplier.paymentTerms,
      channel: product.channel,
      riskScore,
      reorderUnits,
      cashImpact,
      revenueShare,
      onHandUnits,
      reservedUnits,
      inboundUnits,
      availableUnits,
      reorderPointUnits,
      openPoUnits,
      nextEtaDays,
      inventoryStatus,
      unitCost: round(product.unitCost * 100) / 100,
      unitPrice: round(product.unitPrice * 100) / 100,
      grossMarginPct,
      monthlyRevenue,
      monthlyProfit,
      inventoryValue,
      capitalEfficiency,
      supplierPressure,
      marginPressure,
      poCount: poLines.length,
      poRiskCount: supplierRiskPoCount,
      riskReasons,
    };
  });

  const averageProfit = round(
    baseItems.reduce((sum, item) => sum + item.monthlyProfit, 0) /
      Math.max(baseItems.length, 1),
  );
  const averageMargin = round(
    baseItems.reduce((sum, item) => sum + item.grossMarginPct, 0) /
      Math.max(baseItems.length, 1),
  );

  const items = baseItems.map((item) => {
    const playbook = buildPlaybook(item, {
      averageMargin,
      averageProfit,
      objectiveMode,
      scenarioMode,
    });
    const playbookConfig = getPlaybookConfig(playbook);
    const playbookReasons = buildPlaybookReasons(item, playbook);

    let priority = "Monitor";
    if (item.riskScore >= 62 || (playbook === "protect" && item.riskScore >= 46)) {
      priority = "Act now";
    } else if (item.riskScore >= 36 || playbook === "grow" || playbook === "fix") {
      priority = "This week";
    }

    if (playbook === "deprioritize" && item.inventoryStatus === "Excess") {
      priority = "Monitor";
    }

    const action = buildActionCopy(item, playbook, objectiveMode);
    const actionPaths = buildActionPaths(item, playbook, objectiveMode, scenarioMode);
    const forecastProfile = buildForecastProfile(item, scenarioMode);

    return {
      ...item,
      playbook,
      playbookLabel: playbookConfig.label,
      playbookBadge: playbookConfig.badge,
      playbookSummary: playbookConfig.summary,
      playbookWeight: playbookConfig.weight,
      playbookReasons,
      priority,
      action,
      actionPaths,
      ...forecastProfile,
    };
  });

  const rankedItems = [...items].sort((a, b) => {
    const scoreA = a.playbookWeight * 20 + a.riskScore;
    const scoreB = b.playbookWeight * 20 + b.riskScore;
    return scoreB - scoreA;
  });

  const topActions = rankedItems.slice(0, 5).map((item, index) => ({
    rank: index + 1,
    title: item.playbookLabel,
    badge: item.playbookBadge,
    sku: item.name,
    detail: item.action,
  }));

  const cashProtectedOrder = [...rankedItems]
    .sort((a, b) => {
      const scoreA = a.playbook === "protect" ? a.cashImpact : a.cashImpact * 1.4;
      const scoreB = b.playbook === "protect" ? b.cashImpact : b.cashImpact * 1.4;
      return scoreA - scoreB;
    })
    .slice(0, 3)
    .map((item) => item.name)
    .join(", ");

  const totalOnHand = rankedItems.reduce((sum, item) => sum + item.onHandUnits, 0);
  const totalInbound = rankedItems.reduce((sum, item) => sum + item.inboundUnits, 0);
  const totalReserved = rankedItems.reduce((sum, item) => sum + item.reservedUnits, 0);
  const atRiskCount = rankedItems.filter((item) => item.priority !== "Monitor").length;
  const belowReorderCount = rankedItems.filter(
    (item) => item.availableUnits < item.reorderPointUnits,
  ).length;
  const excessCount = rankedItems.filter((item) => item.inventoryStatus === "Excess").length;
  const inboundDueSoon = rankedItems.filter((item) => item.nextEtaDays <= 14).length;
  const topProfitItem =
    [...rankedItems].sort((a, b) => b.monthlyProfit - a.monthlyProfit)[0] || null;
  const topGrowthItem =
    [...rankedItems].sort((a, b) => b.capitalEfficiency - a.capitalEfficiency)[0] || null;
  const marginLeakItem =
    [...rankedItems].sort((a, b) => a.grossMarginPct - b.grossMarginPct)[0] || null;
  const playbookSummary = {
    protect: rankedItems.filter((item) => item.playbook === "protect").length,
    grow: rankedItems.filter((item) => item.playbook === "grow").length,
    fix: rankedItems.filter((item) => item.playbook === "fix").length,
    deprioritize: rankedItems.filter((item) => item.playbook === "deprioritize").length,
  };

  const executionBoard = {
    today: rankedItems
      .filter((item) => item.priority === "Act now")
      .slice(0, 4)
      .map((item) => ({
        sku: item.name,
        title: objective.todayTitle,
        detail: `${item.playbookLabel}: ${item.action} Scenario: ${scenarioProfile.label}.`,
      })),
    thisWeek: rankedItems
      .filter((item) => item.priority === "This week")
      .slice(0, 4)
      .map((item) => ({
        sku: item.name,
        title: item.playbookLabel,
        detail: `${item.playbookSummary} This week, decide whether ${item.name} should be protected, grown, fixed, or kept lean under ${scenarioProfile.label.toLowerCase()}.`,
      })),
    later: rankedItems
      .filter((item) => item.priority === "Monitor" || item.inventoryStatus === "Excess")
      .slice(0, 4)
      .map((item) => ({
        sku: item.name,
        title: item.playbookLabel,
        detail:
          item.playbook === "deprioritize"
            ? `Keep ${item.name} lean and avoid tying up capital until the economics improve.`
            : `Keep ${item.name} on watch so it does not quietly move into a worse lane later.`,
      })),
  };

  const supplierRows = workspace.suppliers
    .map((supplier) => {
      const linkedItems = rankedItems.filter((item) => item.supplierName === supplier.name);
      const atRisk = linkedItems.filter((item) => item.priority !== "Monitor").length;
      const openPoCount = workspace.purchaseOrders.filter(
        (po) => po.supplierId === supplier.id && po.status !== "received",
      ).length;

      return {
        id: supplier.id,
        name: supplier.name,
        region: supplier.region,
        reliability: supplier.reliability,
        leadTimeDays: supplier.leadTimeDays,
        paymentTerms: supplier.paymentTerms,
        fallbackScore: supplier.fallbackScore,
        atRisk,
        openPoCount,
      };
    })
    .sort((a, b) => a.reliability - b.reliability);
  const channelAllocations = buildChannelAllocations(rankedItems);
  const supplierScorecards = buildSupplierScorecards(rankedItems, supplierRows);
  const taskWorkflow = buildTaskWorkflow(rankedItems);
  const forecastBoard = rankedItems.slice(0, 6).map((item) => ({
    id: item.id,
    name: item.name,
    channel: item.channel,
    forecast30: item.forecast30,
    forecast60: item.forecast60,
    forecast90: item.forecast90,
    confidence: item.confidence,
    trend: item.demandTrend,
  }));

  const constraintProfile = getConstraintProfile(
    scenario,
    workspace,
    rankedItems,
    supplierRows,
  );

  const purchaseOrderRows = workspace.purchaseOrders
    .map((po) => {
      const supplier = workspace.suppliers.find((entry) => entry.id === po.supplierId);
      const units = po.lineItems.reduce((sum, line) => sum + line.units, 0);
      const value = round(
        po.lineItems.reduce((sum, line) => sum + line.units * line.unitCost, 0),
      );
      const nextEtaDays =
        po.lineItems.length > 0 ? Math.min(...po.lineItems.map((line) => line.etaDays)) : 0;

      return {
        id: po.id,
        supplierId: po.supplierId,
        supplierName: supplier?.name ?? "Unknown supplier",
        paymentTerms: supplier?.paymentTerms ?? "Unknown terms",
        status: po.status,
        communicationState: po.communicationState || "waiting_on_supplier",
        escalationFlag: Boolean(po.escalationFlag),
        units,
        value,
        nextEtaDays,
        lineItems: po.lineItems.map((line) => {
          const product = workspace.products.find((entry) => entry.id === line.productId);

          return {
            productId: line.productId,
            productName: product?.name ?? "Unknown product",
            sku: product?.sku ?? line.productId,
            units: line.units,
            etaDays: line.etaDays,
            unitCost: line.unitCost,
          };
        }),
        statusHistory:
          po.statusHistory && po.statusHistory.length > 0
            ? po.statusHistory
            : [
                {
                  status: po.status,
                  timeLabel: `${po.createdDaysAgo}d ago`,
                  detail: `PO entered the current workflow as ${po.status}.`,
                },
              ],
        followUpNotes:
          po.followUpNotes && po.followUpNotes.length > 0
            ? po.followUpNotes
            : [
                {
                  note: "No supplier follow-up notes have been logged yet.",
                  communicationState: po.communicationState || "waiting_on_supplier",
                  escalationFlag: Boolean(po.escalationFlag),
                  timeLabel: `${po.createdDaysAgo}d ago`,
                },
              ],
      };
    })
    .sort((a, b) => a.nextEtaDays - b.nextEtaDays);

  const portfolioRecommendations = [
    objectiveMode === "cash"
      ? `Portfolio recommendation: protect ${cashProtectedOrder} first, then trim exposure on weaker-margin items before buying deeper into the tail.`
      : objectiveMode === "growth"
        ? `Portfolio recommendation: fund the highest-upside items first, but only where margin quality and capital efficiency stay healthy.`
        : `Portfolio recommendation: protect continuity on operationally critical items first, then grow the products that return cash efficiently.`,
    `Playbook recommendation: ${playbookSummary.protect} items are in Protect, ${playbookSummary.grow} are in Grow, ${playbookSummary.fix} are in Fix, and ${playbookSummary.deprioritize} are in Deprioritize.`,
    `Margin recommendation: ${marginLeakItem?.name ?? "N/A"} is your weakest gross-margin item, so it deserves extra caution before more inventory is committed.`,
    `Inbound recommendation: ${inboundDueSoon} tracked items have inbound arriving within the next 14 days, so timing discipline matters right now.`,
  ];

  const alerts = [
    `${supplierRows.filter((supplier) => supplier.reliability < 75).length} suppliers are below the preferred reliability threshold.`,
    `${purchaseOrderRows.filter((po) => po.status === "supplier_risk").length} purchase orders are carrying active supplier risk.`,
    `${rankedItems.filter((item) => item.poRiskCount > 0).length} products already have risky inbound tied to live PO lines.`,
  ];
  const anomalies = buildAnomalyDetections(rankedItems, supplierRows, scenarioMode);
  const procurementOptimizer = buildProcurementOptimizer(
    rankedItems,
    workspace,
    constraintProfile,
    objectiveMode,
    scenarioMode,
    options.supplierStrategyMemory || {},
  );

  const constraintRecommendations = [
    constraintProfile.spendGap > 0
      ? `Cash constraint: the recommended plan is $${constraintProfile.spendGap} above the current cash-safe budget, so approvals should be sequenced instead of released all at once.`
      : `Cash constraint: current budget can absorb the modeled recommendation set without forcing a cut to priority products.`,
    constraintProfile.capacityGap > 0
      ? `Warehouse constraint: the recommended plan would overrun current storage by ${constraintProfile.capacityGap} units, so the brain should slow lower-priority buys or stage arrivals.`
      : `Warehouse constraint: current storage capacity can support the modeled plan without forcing immediate re-slotting.`,
    constraintProfile.supplierCapacityGap > 0
      ? `Supplier constraint: the weakest supplier lane is ${constraintProfile.supplierCapacityGap} units short of the modeled demand plan, so a split PO or alternate source is needed.`
      : `Supplier constraint: modeled supplier capacity is still sufficient for the current recommendation set.`,
    `MOQ constraint: priority buying is clustering around a ${constraintProfile.moqUnits}-unit minimum, so smaller corrective moves may need bundling or supplier negotiation.`,
    `Terms constraint: ${constraintProfile.paymentPressure}`,
  ];

  const planningBoard = buildPlanningBoard(
    rankedItems,
    constraintProfile,
    objective,
    scenarioProfile,
  );
  const scenarioCompare = options.skipCompare
    ? []
    : buildScenarioCompare(
        {
          ...scenario,
        },
        objectiveMode,
        scenario.businessType,
        workspace,
      );

  return {
    items: rankedItems,
    topActions,
    executionBoard,
    portfolioRecommendations,
    constraintRecommendations,
    planningBoard,
    scenarioCompare,
    playbookSummary,
    workspace: {
      businessLabel: workspace.businessLabel,
      channels: workspace.channels,
      suppliers: supplierRows,
      supplierScorecards,
      purchaseOrders: purchaseOrderRows,
      channelAllocations,
      taskWorkflow,
      forecastBoard,
      anomalies,
      procurementOptimizer,
      alerts,
    },
    overview: {
      highestRiskSku: rankedItems[0]?.name ?? "N/A",
      highestRiskScore: rankedItems[0]?.riskScore ?? 0,
      totalImmediateCash: rankedItems
        .filter((item) => item.priority === "Act now")
        .reduce((sum, item) => sum + item.cashImpact, 0),
      cashProtectedOrder,
      totalOnHand,
      totalInbound,
      totalReserved,
      atRiskCount,
      belowReorderCount,
      excessCount,
      inboundDueSoon,
      objectiveLabel: objective.cashLabel,
      scenarioLabel: scenarioProfile.label,
      topProfitSku: topProfitItem?.name ?? "N/A",
      topProfitValue: topProfitItem?.monthlyProfit ?? 0,
      topGrowthSku: topGrowthItem?.name ?? "N/A",
      topGrowthValue: topGrowthItem?.capitalEfficiency ?? 0,
      marginLeakSku: marginLeakItem?.name ?? "N/A",
      marginLeakValue: marginLeakItem?.grossMarginPct ?? 0,
      cashBudget: constraintProfile.cashBudget,
      capacityGap: constraintProfile.capacityGap,
    },
  };
}

export function buildInitialActionState(items) {
  return Object.fromEntries(items.map((item) => [item.id, "Open"]));
}
