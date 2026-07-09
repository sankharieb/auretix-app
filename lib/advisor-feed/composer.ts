import type {
  AdvisorFeedCard,
  AdvisorFeedCardType,
  AdvisorFeedOptions,
  AdvisorFeedQuietState,
  AdvisorFeedResult,
  AdvisorFeedSeverity,
  AdvisorFeedSourceRecords,
  BuildAdvisorFeedInput,
  EvidenceStrength,
  SourceRecord,
  SupabaseLikeClient,
} from "./types";

const DEFAULT_OPTIONS: AdvisorFeedOptions = {
  noiseFloor: 1000,
  defaultMaxCards: 3,
  absoluteMaxCards: 5,
};

const WATCHED_AREAS = ["inventory", "cash", "suppliers", "open decisions"];

const QUIET_DAY_MESSAGE =
  "Nothing needs action today. I'm watching inventory, cash, suppliers, and open decisions. Current exposure is stable.";

type CandidateCard = Omit<AdvisorFeedCard, "severity" | "evidenceStrength">;

export async function buildAdvisorFeed({
  companyId,
  workspaceId = null,
  supabase = null,
  now = new Date(),
  options = {},
  records,
}: BuildAdvisorFeedInput): Promise<AdvisorFeedResult> {
  const resolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  const sourceRecords = records || (await loadSourceRecords(companyId, workspaceId, supabase));
  const candidates = [
    ...composeStockoutCards(sourceRecords),
    ...composeCashCards(sourceRecords, companyId, workspaceId),
    ...composeSupplierCards(sourceRecords),
    ...composeProcurementCards(sourceRecords),
    ...composeLearningCards(sourceRecords, companyId, workspaceId),
  ];
  const cards = candidates
    .filter((card) => card.projectedFinancialImpact >= resolvedOptions.noiseFloor)
    .map((card) => finalizeCard(card))
    .sort((a, b) => b.projectedFinancialImpact - a.projectedFinancialImpact);
  const highSeverityCount = cards.filter((card) => card.severity === "high").length;
  const maxCards =
    highSeverityCount > resolvedOptions.defaultMaxCards
      ? resolvedOptions.absoluteMaxCards
      : resolvedOptions.defaultMaxCards;
  const cappedCards = cards.slice(0, maxCards);

  return {
    generatedAt: now.toISOString(),
    companyId,
    workspaceId,
    rankingMode: "projected_financial_impact",
    noiseFloor: resolvedOptions.noiseFloor,
    defaultMaxCards: resolvedOptions.defaultMaxCards,
    absoluteMaxCards: resolvedOptions.absoluteMaxCards,
    cards: cappedCards,
    quietState: cappedCards.length ? null : buildQuietState(),
  };
}

async function loadSourceRecords(
  companyId: string,
  workspaceId: string | null,
  supabase: SupabaseLikeClient | null,
): Promise<AdvisorFeedSourceRecords> {
  if (!supabase) {
    return {};
  }

  const [
    riskScores,
    profitImpactRecords,
    costEvents,
    revenueEvents,
    supplierIntelligence,
    supplierPerformanceEvents,
    decisionRecommendations,
    dailyDecisionQueue,
    memoryEvents,
    memoryOutcomes,
    memoryFinancialDerivations,
    memoryPredictionActuals,
  ] = await Promise.all([
    readRows(supabase, "risk_scores", companyId, workspaceId),
    readRows(supabase, "profit_impact_records", companyId, workspaceId),
    readRows(supabase, "cost_events", companyId, workspaceId),
    readRows(supabase, "revenue_events", companyId, workspaceId),
    readRows(supabase, "supplier_intelligence", companyId, workspaceId),
    readRows(supabase, "supplier_performance_events", companyId, workspaceId),
    readRows(supabase, "decision_recommendations", companyId, workspaceId),
    readRows(supabase, "daily_decision_queue", companyId, workspaceId),
    readRows(supabase, "memory_events", companyId, workspaceId),
    readRows(supabase, "memory_outcomes", companyId, workspaceId),
    readRows(supabase, "memory_financial_derivations", companyId, workspaceId),
    readRows(supabase, "memory_prediction_actuals", companyId, workspaceId),
  ]);

  return {
    riskScores,
    profitImpactRecords,
    costEvents,
    revenueEvents,
    supplierIntelligence,
    supplierPerformanceEvents,
    decisionRecommendations,
    dailyDecisionQueue,
    memoryEvents,
    memoryOutcomes,
    memoryFinancialDerivations,
    memoryPredictionActuals,
  };
}

async function readRows(
  supabase: SupabaseLikeClient,
  table: string,
  companyId: string,
  workspaceId: string | null,
): Promise<SourceRecord[]> {
  try {
    let query = supabase.from(table).select("*").eq("company_id", companyId);

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    if (query.order) {
      query = query.order("created_at", { ascending: false });
    }

    if (query.limit) {
      query = query.limit(100);
    }

    const { data, error } = await query;

    if (error || !Array.isArray(data)) {
      return [];
    }

    return data;
  } catch {
    return [];
  }
}

function composeStockoutCards(records: AdvisorFeedSourceRecords): CandidateCard[] {
  const cards: CandidateCard[] = [];

  for (const row of records.riskScores || []) {
    const text = [
      row.issue_type,
      row.reason_summary,
      row.recommended_action,
      JSON.stringify(asRecord(row.metrics)),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!containsAny(text, ["inventory", "stockout", "stock out", "demand", "revenue", "cover"])) {
      continue;
    }

    const impact = maxNumber([
      row.financial_impact,
      asRecord(row.metrics).financialImpact,
      asRecord(row.metrics).revenueAtRisk,
      asRecord(row.metrics).potentialStockoutLoss,
    ]);

    cards.push({
      id: `stockout:risk_scores:${rowId(row)}`,
      type: "stockout",
      title: `Inventory exposure: ${asString(row.sku, "SKU")}`,
      summary: asString(
        row.reason_summary,
        "Current inventory or demand signals indicate projected revenue exposure.",
      ),
      projectedFinancialImpact: impact,
      confidence: nullableNumber(asRecord(row.metrics).confidence),
      primaryMetric: {
        label: "Projected exposure",
        value: formatCurrency(impact),
      },
      whyItMatters: "A service gap can turn demand into missed revenue before replenishment catches up.",
      evidenceIds: collectEvidenceIds(row),
      drilldownTarget: {
        label: "Review stockout evidence",
        href: "/app/sku-risk",
      },
      responsePaths: [
        "Review inbound timing",
        "Review inventory redistribution",
        "Review alternate supply",
        "Monitor current conditions",
      ],
      sourceRefs: [{ table: "risk_scores", id: rowId(row) }],
    });
  }

  for (const row of records.profitImpactRecords || []) {
    const impact = maxNumber([row.revenue_at_risk, row.potential_stockout_loss]);

    cards.push({
      id: `stockout:profit_impact_records:${rowId(row)}`,
      type: "stockout",
      title: `Revenue exposure: ${asString(row.sku, "SKU")}`,
      summary: "Profit impact records show possible revenue loss tied to inventory availability.",
      projectedFinancialImpact: impact,
      confidence: nullableNumber(asRecord(row.assumptions).confidence),
      primaryMetric: {
        label: "Revenue at risk",
        value: formatCurrency(impact),
      },
      whyItMatters: "Revenue exposure is surfacing before the final operational outcome is known.",
      evidenceIds: collectEvidenceIds(row),
      drilldownTarget: {
        label: "Review revenue exposure",
        href: "/app/sku-risk",
      },
      responsePaths: [
        "Review stockout projection",
        "Review purchase timing",
        "Review channel availability",
        "Monitor current conditions",
      ],
      sourceRefs: [{ table: "profit_impact_records", id: rowId(row) }],
    });
  }

  return cards;
}

function composeCashCards(
  records: AdvisorFeedSourceRecords,
  companyId: string,
  workspaceId: string | null,
): CandidateCard[] {
  const cards: CandidateCard[] = [];

  for (const row of records.profitImpactRecords || []) {
    const impact = maxNumber([
      row.cash_tied_up,
      row.margin_at_risk,
      row.overstock_exposure,
      row.cost_of_delay,
      row.expected_benefit,
    ]);

    cards.push({
      id: `cash:profit_impact_records:${rowId(row)}`,
      type: "cash",
      title: `Cash exposure: ${asString(row.sku, "SKU")}`,
      summary: "Financial impact records indicate cash, margin, or overstock pressure.",
      projectedFinancialImpact: impact,
      confidence: nullableNumber(asRecord(row.assumptions).confidence),
      primaryMetric: {
        label: "Cash or margin exposure",
        value: formatCurrency(impact),
      },
      whyItMatters: "Cash tied to the wrong inventory reduces room to fund the next operational move.",
      evidenceIds: collectEvidenceIds(row),
      drilldownTarget: {
        label: "Review cash exposure",
        href: "/app/procurement",
      },
      responsePaths: [
        "Review cash-safe buying",
        "Review overstock exposure",
        "Review margin pressure",
        "Monitor current conditions",
      ],
      sourceRefs: [{ table: "profit_impact_records", id: rowId(row) }],
    });
  }

  const costRows = records.costEvents || [];
  const revenueRows = records.revenueEvents || [];
  const totalCost = sum(costRows.map((row) => nullableNumber(row.amount)));
  const totalRevenue = sum(revenueRows.map((row) => nullableNumber(row.amount)));

  if (costRows.length && totalCost > 0) {
    const marginText =
      totalRevenue > 0
        ? ` Revenue in the same window is ${formatCurrency(totalRevenue)}.`
        : "";

    cards.push({
      id: `cash:cost_events:${companyId}:${workspaceId || "all"}`,
      type: "cash",
      title: "Operating cost pressure detected",
      summary: `Recorded cost events total ${formatCurrency(totalCost)}.${marginText}`,
      projectedFinancialImpact: totalCost,
      confidence: confidenceFromSources(costRows),
      primaryMetric: {
        label: "Recorded cost pressure",
        value: formatCurrency(totalCost),
      },
      whyItMatters: "Cost pressure can quietly reduce realized profit even when revenue is still moving.",
      evidenceIds: collectEvidenceIds(...costRows),
      drilldownTarget: {
        label: "Review cost events",
        href: "/app/procurement",
      },
      responsePaths: [
        "Review landed cost detail",
        "Review margin leakage",
        "Review slow inventory exposure",
        "Monitor current conditions",
      ],
      sourceRefs: costRows.map((row) => ({ table: "cost_events", id: rowId(row) })),
    });
  }

  return cards;
}

function composeSupplierCards(records: AdvisorFeedSourceRecords): CandidateCard[] {
  const cards: CandidateCard[] = [];

  for (const row of records.supplierIntelligence || []) {
    const reliability = nullableNumber(row.reliability_score);
    const issueHistory = Array.isArray(row.issue_history) ? row.issue_history : [];
    const impact = maxNumber([
      row.financial_impact,
      row.estimated_financial_impact,
      asRecord(row.metadata).projectedFinancialImpact,
      ...issueHistory.map((item) => maxNumber([asRecord(item).financialImpact, asRecord(item).impact])),
    ]);

    if (impact <= 0 && (reliability === null || reliability >= 80)) {
      continue;
    }

    cards.push({
      id: `supplier:supplier_intelligence:${rowId(row)}`,
      type: "supplier",
      title: `Supplier watch: ${asString(row.supplier_name, "supplier")}`,
      summary: `Supplier reliability is ${reliability === null ? "unknown" : `${reliability}%`}.`,
      projectedFinancialImpact: impact,
      confidence: reliability,
      primaryMetric: {
        label: "Supplier exposure",
        value: formatCurrency(impact),
      },
      whyItMatters: "Supplier performance can shift lead times and turn a planning issue into a service gap.",
      evidenceIds: collectEvidenceIds(row),
      drilldownTarget: {
        label: "Review supplier activity",
        href: "/app/supply-chain",
      },
      responsePaths: [
        "Review supplier trend",
        "Review backup supplier path",
        "Review inbound timing",
        "Monitor current conditions",
      ],
      sourceRefs: [{ table: "supplier_intelligence", id: rowId(row) }],
    });
  }

  for (const row of records.supplierPerformanceEvents || []) {
    const delayDays = nullableNumber(row.delay_days);
    const impact = maxNumber([row.financial_impact, row.estimated_financial_impact, asRecord(row.metadata).impact]);

    cards.push({
      id: `supplier:supplier_performance_events:${rowId(row)}`,
      type: "supplier",
      title: `Supplier event: ${asString(row.supplier_name, "supplier")}`,
      summary: `A supplier performance event was recorded${delayDays ? ` with ${delayDays} delay days` : ""}.`,
      projectedFinancialImpact: impact,
      confidence: null,
      primaryMetric: {
        label: "Supplier event exposure",
        value: formatCurrency(impact),
      },
      whyItMatters: "Supplier events can affect replenishment timing and service reliability.",
      evidenceIds: collectEvidenceIds(row),
      drilldownTarget: {
        label: "Review supplier event",
        href: "/app/supply-chain",
      },
      responsePaths: [
        "Review supplier event",
        "Review lead-time assumptions",
        "Review alternate supply",
        "Monitor current conditions",
      ],
      sourceRefs: [{ table: "supplier_performance_events", id: rowId(row) }],
    });
  }

  return cards;
}

function composeProcurementCards(records: AdvisorFeedSourceRecords): CandidateCard[] {
  const cards: CandidateCard[] = [];

  for (const row of records.decisionRecommendations || []) {
    const userAction = asString(row.user_action, "").toLowerCase();
    const status = asString(row.status, "").toLowerCase();

    if (userAction === "approved" || status === "approved" || status === "complete") {
      continue;
    }

    const impact = maxNumber([row.estimated_financial_impact, asRecord(row.metadata).projectedFinancialImpact]);

    cards.push({
      id: `procurement:decision_recommendations:${rowId(row)}`,
      type: "procurement",
      title: `Open decision: ${asString(row.sku, "SKU")}`,
      summary: asString(row.reason_summary, "A decision recommendation is still awaiting review."),
      projectedFinancialImpact: impact,
      confidence: nullableNumber(row.confidence),
      primaryMetric: {
        label: "Decision exposure",
        value: formatCurrency(impact),
      },
      whyItMatters: "Open procurement decisions can delay the action that protects cash or service levels.",
      evidenceIds: collectEvidenceIds(row),
      drilldownTarget: {
        label: "Review procurement decision",
        href: "/app/procurement",
      },
      responsePaths: [
        "Review purchase quantity",
        "Review cash impact",
        "Review supplier path",
        "Monitor current conditions",
      ],
      sourceRefs: [{ table: "decision_recommendations", id: rowId(row) }],
    });
  }

  for (const row of records.dailyDecisionQueue || []) {
    const status = asString(row.status, "").toLowerCase();

    if (status === "approved" || status === "complete" || status === "done") {
      continue;
    }

    const impact = maxNumber([row.financial_impact, asRecord(row.metadata).projectedFinancialImpact]);

    cards.push({
      id: `procurement:daily_decision_queue:${rowId(row)}`,
      type: "procurement",
      title: `Decision queue: ${asString(row.sku, "SKU")}`,
      summary: asString(row.problem, "A queued procurement decision is still open."),
      projectedFinancialImpact: impact,
      confidence: nullableNumber(row.confidence),
      primaryMetric: {
        label: "Queue exposure",
        value: formatCurrency(impact),
      },
      whyItMatters: asString(row.why_it_matters, "The decision queue is where unresolved exposure can accumulate."),
      evidenceIds: collectEvidenceIds(row),
      drilldownTarget: {
        label: "Review decision queue",
        href: "/app/procurement",
      },
      responsePaths: [
        "Review decision context",
        "Review financial exposure",
        "Review response paths",
        "Monitor current conditions",
      ],
      sourceRefs: [{ table: "daily_decision_queue", id: rowId(row) }],
    });
  }

  return cards;
}

function composeLearningCards(
  records: AdvisorFeedSourceRecords,
  companyId: string,
  workspaceId: string | null,
): CandidateCard[] {
  const completedComparisons = (records.memoryPredictionActuals || []).filter((row) => {
    return asString(row.comparison_status, "").toLowerCase() === "complete";
  });
  const derivations = records.memoryFinancialDerivations || [];

  if (!completedComparisons.length || !derivations.length) {
    return [];
  }

  const varianceImpact = sum(
    completedComparisons.map((row) => Math.abs(nullableNumber(row.variance) || 0)),
  );

  if (varianceImpact <= 0) {
    return [];
  }

  return [
    {
      id: `learning:memory:${companyId}:${workspaceId || "all"}`,
      type: "learning",
      title: "Learning history changed",
      summary: `${completedComparisons.length} completed prediction comparisons are now available for review.`,
      projectedFinancialImpact: varianceImpact,
      confidence: confidenceFromSources(derivations),
      primaryMetric: {
        label: "Observed variance",
        value: formatCurrency(varianceImpact),
      },
      whyItMatters: "Recorded outcomes are the basis for understanding how well prior projections matched reality.",
      evidenceIds: collectEvidenceIds(...derivations, ...completedComparisons),
      drilldownTarget: {
        label: "Review learning history",
        href: "/app/moat",
      },
      responsePaths: [
        "Review outcome history",
        "Review variance drivers",
        "Review source evidence",
        "Monitor current conditions",
      ],
      sourceRefs: [
        ...derivations.map((row) => ({ table: "memory_financial_derivations", id: rowId(row) })),
        ...completedComparisons.map((row) => ({ table: "memory_prediction_actuals", id: rowId(row) })),
      ],
    },
  ];
}

function finalizeCard(card: CandidateCard): AdvisorFeedCard {
  return {
    ...card,
    projectedFinancialImpact: roundMoney(card.projectedFinancialImpact),
    severity: severityFromImpact(card.projectedFinancialImpact),
    evidenceStrength: evidenceStrengthFromConfidence(card.confidence),
  };
}

function buildQuietState(): AdvisorFeedQuietState {
  return {
    isQuiet: true,
    message: QUIET_DAY_MESSAGE,
    watchedAreas: WATCHED_AREAS,
  };
}

function severityFromImpact(impact: number): AdvisorFeedSeverity {
  if (impact >= 25000) {
    return "high";
  }

  if (impact >= 5000) {
    return "medium";
  }

  return "low";
}

function evidenceStrengthFromConfidence(confidence: number | null): EvidenceStrength {
  if (confidence !== null && confidence >= 80) {
    return "strong";
  }

  if (confidence !== null && confidence >= 50) {
    return "moderate";
  }

  return "limited";
}

function confidenceFromSources(rows: SourceRecord[]): number | null {
  const values = rows
    .map((row) => {
      if (row.confidence !== undefined) {
        return nullableNumber(row.confidence);
      }

      if (row.source === "connected") {
        return 80;
      }

      if (row.source === "manual") {
        return 60;
      }

      if (row.source === "inferred") {
        return 40;
      }

      return null;
    })
    .filter((value): value is number => value !== null);

  if (!values.length) {
    return null;
  }

  return Math.round(sum(values) / values.length);
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function collectEvidenceIds(...rows: SourceRecord[]): string[] {
  const ids = new Set<string>();

  for (const row of rows) {
    for (const key of ["evidence_id", "evidence_record_id", "evidence_bundle_id", "risk_score_id"]) {
      const value = row[key];

      if (typeof value === "string" && value) {
        ids.add(value);
      }
    }
  }

  return Array.from(ids);
}

function asRecord(value: unknown): SourceRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as SourceRecord;
}

function asString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function maxNumber(values: unknown[]): number {
  return Math.max(0, ...values.map((value) => nullableNumber(value) || 0));
}

function sum(values: Array<number | null>): number {
  return values.reduce((total, value) => total + (value || 0), 0);
}

function rowId(row: SourceRecord): string {
  const value = row.id;

  if (typeof value === "string" && value) {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "unknown";
}

function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
