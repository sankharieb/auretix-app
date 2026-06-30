import type {
  AllocationBreakdown,
  CostLevelKey,
  SkuProfitResult,
} from "../profit/types";
import type {
  EvidenceBundle,
  EvidenceCalculationRun,
  EvidenceLink,
  EvidenceRecord,
  EvidenceRelationship,
  EvidenceSourceType,
  EvidenceTrustSummary,
  ProfitEvidencePayload,
} from "./types";

type ProfitResultForEvidence = Omit<SkuProfitResult, "evidence">;

const PROFIT_ENGINE_VERSION = "profit_engine_v1";
const STALE_AFTER_DAYS = 7;

const COST_LEVEL_LABELS: Record<CostLevelKey, string> = {
  level_1_revenue: "Revenue",
  level_2_product: "Product Cost",
  level_3_transportation: "Transportation",
  level_4_warehouse: "Warehouse",
  level_5_marketplace: "Marketplace Fees",
  level_6_marketing: "Marketing",
  level_7_customer: "Customer Cost",
  level_8_operational: "Operational",
  level_9_labor: "Labor",
  level_10_overhead: "Overhead",
};

const COST_LEVEL_KEYS: CostLevelKey[] = [
  "level_2_product",
  "level_3_transportation",
  "level_4_warehouse",
  "level_5_marketplace",
  "level_6_marketing",
  "level_7_customer",
  "level_8_operational",
  "level_9_labor",
  "level_10_overhead",
];

export function buildEvidenceBundle(input: {
  parentType: string;
  parentId: string;
  records: EvidenceRecord[];
  links?: EvidenceLink[];
  calculationRun?: EvidenceCalculationRun | null;
}): EvidenceBundle {
  const summary = summarizeEvidenceTrust(input.records);
  const observedDates = input.records
    .map((record) => record.observed_at)
    .filter(Boolean)
    .sort();
  const staleRecordCount = input.records.filter((record) => {
    const observedAt = Date.parse(record.observed_at);

    if (!Number.isFinite(observedAt)) {
      return false;
    }

    return Date.now() - observedAt > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  }).length;

  return {
    parentType: input.parentType,
    parentId: input.parentId,
    confidence: summary.averageConfidence,
    dataFreshness: {
      oldestObservedAt: observedDates[0] || null,
      latestObservedAt: observedDates[observedDates.length - 1] || null,
      staleRecordCount,
    },
    sourceMix: {
      connected: summary.connectedCount,
      manual: summary.manualCount,
      inferred: summary.inferredCount,
      calculated: summary.calculatedCount,
    },
    evidenceRecords: input.records,
    calculationRun: input.calculationRun || null,
    summary,
  };
}

export function summarizeEvidenceTrust(records: EvidenceRecord[]): EvidenceTrustSummary {
  const connectedCount = countSource(records, "connected");
  const manualCount = countSource(records, "manual");
  const inferredCount = countSource(records, "inferred");
  const calculatedCount = countSource(records, "calculated");
  const confidenceValues = records
    .map((record) => record.confidence)
    .filter((confidence): confidence is number => typeof confidence === "number");
  const missingEvidenceWarnings = records
    .filter((record) => isMissingEvidenceWarning(record))
    .map((record) => record.label);

  if (connectedCount === 0 && records.length > 0) {
    missingEvidenceWarnings.push("No connected evidence records are present.");
  }

  return {
    totalRecords: records.length,
    connectedCount,
    manualCount,
    inferredCount,
    calculatedCount,
    averageConfidence: confidenceValues.length
      ? roundNumber(average(confidenceValues))
      : 0,
    missingEvidenceWarnings,
    sourceMixLabel: sourceMixLabel({
      total: records.length,
      connectedCount,
      manualCount,
      inferredCount,
      calculatedCount,
    }),
  };
}

export function createProfitEvidenceFromResult(
  profitResult: ProfitResultForEvidence,
): ProfitEvidencePayload {
  const records: EvidenceRecord[] = [];
  const now = new Date().toISOString();
  const parentType = "sku_profit";
  const parentId = profitResult.product_id;

  const addRecord = (record: Omit<EvidenceRecord, "id" | "company_id" | "workspace_id">): EvidenceRecord => {
    const fullRecord = {
      ...record,
      id: evidenceId(profitResult, records.length + 1, record.evidence_type, record.entity_type),
      company_id: profitResult.company_id,
      workspace_id: profitResult.workspace_id,
    };

    records.push(fullRecord);
    return fullRecord;
  };

  addRecord({
    source_id: null,
    entity_type: "profit_result",
    entity_id: profitResult.product_id,
    evidence_type: "current_state",
    label: "Gross revenue used in net realized profit calculation",
    value_numeric: profitResult.gross_revenue,
    value_text: null,
    value_json: {
      period: profitResult.period,
      sku: profitResult.sku,
    },
    unit: "USD",
    observed_at: now,
    confidence: confidenceForLevel(profitResult, "level_1_revenue"),
    source_type: "calculated",
  });

  for (const levelKey of COST_LEVEL_KEYS) {
    const amount = profitResult.cost_totals_by_level[levelKey];

    if (amount <= 0) {
      continue;
    }

    addRecord({
      source_id: null,
      entity_type: "profit_result",
      entity_id: profitResult.product_id,
      evidence_type: "calculation",
      label: `${COST_LEVEL_LABELS[levelKey]} total included in profit calculation`,
      value_numeric: amount,
      value_text: null,
      value_json: {
        level_key: levelKey,
        source_provenance: profitResult.dataCompleteness.byLevel[levelKey],
      },
      unit: "USD",
      observed_at: now,
      confidence: confidenceForLevel(profitResult, levelKey),
      source_type: "calculated",
    });
  }

  for (const allocation of profitResult.allocationBreakdown) {
    addAllocationEvidence(profitResult, addRecord, allocation, now);
  }

  for (const [levelKey, provenance] of Object.entries(profitResult.dataCompleteness.byLevel) as Array<
    [CostLevelKey, ProfitResultForEvidence["dataCompleteness"]["byLevel"][CostLevelKey]]
  >) {
    for (const sourceType of ["connected", "manual", "inferred"] as EvidenceSourceType[]) {
      const amount = provenance[sourceType];

      if (amount <= 0) {
        continue;
      }

      addRecord({
        source_id: null,
        entity_type: "profit_result",
        entity_id: profitResult.product_id,
        evidence_type: "source_quality",
        label: `${COST_LEVEL_LABELS[levelKey]} includes ${sourceType} evidence`,
        value_numeric: amount,
        value_text: null,
        value_json: {
          level_key: levelKey,
          source_type: sourceType,
          percent_of_level: provenance[`${sourceType}Percent`],
        },
        unit: "USD",
        observed_at: now,
        confidence: confidenceForSource(sourceType),
        source_type: sourceType,
      });
    }
  }

  for (const missingLevel of profitResult.dataCompleteness.noDataLevels) {
    addRecord({
      source_id: null,
      entity_type: "profit_result",
      entity_id: profitResult.product_id,
      evidence_type: "source_quality",
      label: `No data available for ${missingLevel.label}`,
      value_numeric: null,
      value_text: "This cost level was not included because no connected, manual, or inferred evidence exists yet.",
      value_json: {
        level_id: missingLevel.level_id,
        level_key: missingLevel.level_key,
      },
      unit: null,
      observed_at: now,
      confidence: 35,
      source_type: "inferred",
    });
  }

  addRecord({
    source_id: null,
    entity_type: "profit_result",
    entity_id: profitResult.product_id,
    evidence_type: "calculation",
    label: "Net realized profit formula",
    value_numeric: profitResult.net_realized_profit,
    value_text: "Revenue - Product - Transportation - Warehouse - Marketplace - Marketing - Customer - Operational - Labor - Overhead",
    value_json: {
      gross_revenue: profitResult.gross_revenue,
      total_allocated_costs: profitResult.total_allocated_costs,
      cost_totals_by_level: profitResult.cost_totals_by_level,
    },
    unit: "USD",
    observed_at: now,
    confidence: 85,
    source_type: "calculated",
  });

  const trustSummary = summarizeEvidenceTrust(records);
  const calculationRun: EvidenceCalculationRun = {
    id: calculationRunId(profitResult),
    company_id: profitResult.company_id,
    workspace_id: profitResult.workspace_id,
    calculation_type: "sku_profit",
    target_type: "product",
    target_id: profitResult.product_id,
    engine_version: PROFIT_ENGINE_VERSION,
    input_hash: simpleHash(JSON.stringify({
      product_id: profitResult.product_id,
      period: profitResult.period,
      gross_revenue: profitResult.gross_revenue,
      cost_totals_by_level: profitResult.cost_totals_by_level,
      allocation_count: profitResult.allocationBreakdown.length,
    })),
    result_json: {
      sku: profitResult.sku,
      gross_revenue: profitResult.gross_revenue,
      total_allocated_costs: profitResult.total_allocated_costs,
      net_realized_profit: profitResult.net_realized_profit,
      data_completeness: {
        no_data_levels: profitResult.dataCompleteness.noDataLevels.map((level) => level.label),
      },
    },
    confidence: trustSummary.averageConfidence,
    created_at: now,
  };

  const links = records.map((record, index) => ({
    id: linkId(profitResult, index + 1, record.id),
    company_id: profitResult.company_id,
    workspace_id: profitResult.workspace_id,
    parent_type: parentType,
    parent_id: parentId,
    evidence_record_id: record.id,
    relationship: relationshipForRecord(record),
    weight: weightForRecord(record),
  }));

  return {
    calculationRun,
    records,
    links,
    trustSummary,
  };
}

function addAllocationEvidence(
  profitResult: ProfitResultForEvidence,
  addRecord: (record: Omit<EvidenceRecord, "id" | "company_id" | "workspace_id">) => EvidenceRecord,
  allocation: AllocationBreakdown,
  observedAt: string,
): void {
  addRecord({
    source_id: null,
    entity_type: "cost_event",
    entity_id: allocation.cost_event_id,
    evidence_type: "calculation",
    label: `${allocation.category_label} allocated to ${profitResult.sku}`,
    value_numeric: allocation.allocated_amount,
    value_text: null,
    value_json: {
      original_amount: allocation.original_amount,
      allocation_method: allocation.allocation_method,
      allocation_ratio: allocation.allocation_ratio,
      basis_numerator: allocation.basis_numerator,
      basis_denominator: allocation.basis_denominator,
      grain: allocation.grain,
      flags: allocation.flags,
      notes: allocation.notes,
    },
    unit: "USD",
    observed_at: observedAt,
    confidence: allocation.flags.length ? 60 : confidenceForSource(allocation.source),
    source_type: "calculated",
  });

  for (const flag of allocation.flags) {
    addRecord({
      source_id: null,
      entity_type: "cost_event",
      entity_id: allocation.cost_event_id,
      evidence_type: "confidence_driver",
      label: `Allocation confidence reduced: ${flag}`,
      value_numeric: null,
      value_text: flag,
      value_json: {
        category_code: allocation.category_code,
        allocation_method: allocation.allocation_method,
        grain: allocation.grain,
      },
      unit: null,
      observed_at: observedAt,
      confidence: 45,
      source_type: "inferred",
    });
  }
}

function confidenceForLevel(profitResult: ProfitResultForEvidence, levelKey: CostLevelKey): number {
  const provenance = profitResult.dataCompleteness.byLevel[levelKey];

  if (!provenance || !provenance.hasData) {
    return 35;
  }

  return roundNumber(
    provenance.connectedPercent * 0.9 +
      provenance.manualPercent * 0.72 +
      provenance.inferredPercent * 0.45,
  );
}

function confidenceForSource(sourceType: EvidenceSourceType): number {
  if (sourceType === "connected") {
    return 90;
  }

  if (sourceType === "manual") {
    return 72;
  }

  if (sourceType === "calculated") {
    return 85;
  }

  return 45;
}

function relationshipForRecord(record: EvidenceRecord): EvidenceRelationship {
  if (record.evidence_type === "assumption") {
    return "assumption";
  }

  if (record.evidence_type === "confidence_driver" || isMissingEvidenceWarning(record)) {
    return "reduces_confidence";
  }

  if (record.evidence_type === "calculation") {
    return "calculation_input";
  }

  if (record.evidence_type === "source_quality") {
    return "source";
  }

  return "supports";
}

function weightForRecord(record: EvidenceRecord): number | null {
  if (typeof record.confidence !== "number") {
    return null;
  }

  return roundNumber(record.confidence / 100);
}

function countSource(records: EvidenceRecord[], sourceType: EvidenceSourceType): number {
  return records.filter((record) => record.source_type === sourceType).length;
}

function isMissingEvidenceWarning(record: EvidenceRecord): boolean {
  const label = record.label.toLowerCase();

  return label.includes("no data") || label.includes("fallback") || label.includes("reduced");
}

function sourceMixLabel(input: {
  total: number;
  connectedCount: number;
  manualCount: number;
  inferredCount: number;
  calculatedCount: number;
}): string {
  if (input.total === 0) {
    return "No evidence";
  }

  if (input.connectedCount / input.total >= 0.6) {
    return "Connected-heavy evidence";
  }

  if (input.calculatedCount / input.total >= 0.6) {
    return "Calculation-heavy evidence";
  }

  if (input.manualCount / input.total >= 0.5) {
    return "Manual-heavy evidence";
  }

  if (input.inferredCount / input.total >= 0.4) {
    return "Inference-heavy evidence";
  }

  return "Mixed evidence";
}

function evidenceId(
  profitResult: ProfitResultForEvidence,
  index: number,
  evidenceType: string,
  entityType: string,
): string {
  return [
    "evidence",
    safeId(profitResult.company_id),
    safeId(profitResult.product_id),
    safeId(evidenceType),
    safeId(entityType),
    String(index).padStart(3, "0"),
  ].join("_");
}

function linkId(profitResult: ProfitResultForEvidence, index: number, recordId: string): string {
  return [
    "evidence_link",
    safeId(profitResult.company_id),
    safeId(profitResult.product_id),
    String(index).padStart(3, "0"),
    safeId(recordId).slice(0, 24),
  ].join("_");
}

function calculationRunId(profitResult: ProfitResultForEvidence): string {
  const periodKey = profitResult.period
    ? `${profitResult.period.start}_${profitResult.period.end}`
    : "all_time";

  return [
    "evidence_calc",
    safeId(profitResult.company_id),
    safeId(profitResult.product_id),
    safeId(periodKey),
  ].join("_");
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function simpleHash(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return `hash_${Math.abs(hash)}`;
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundNumber(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
