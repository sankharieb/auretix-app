import { createClient } from "@supabase/supabase-js";
import { createProfitEvidenceFromResult } from "../evidence/engine";
import type {
  AllocationBreakdown,
  AllocationMethod,
  CostEventRecord,
  CostLevelId,
  CostLevelKey,
  CostSource,
  DataCompletenessReport,
  PeriodAllocationBasisRecord,
  ProfitDataProvider,
  ProfitPeriod,
  ProfitQueryOptions,
  RevenueEventRecord,
  ShipmentLineRecord,
  SkuProfitResult,
} from "./types";

const LEVEL_LABELS: Record<CostLevelId, string> = {
  1: "Revenue",
  2: "Product Cost",
  3: "Transportation",
  4: "Warehouse",
  5: "Marketplace Fees",
  6: "Marketing",
  7: "Customer Cost",
  8: "Operational",
  9: "Labor",
  10: "Overhead",
};

const LEVEL_KEYS: Record<CostLevelId, CostLevelKey> = {
  1: "level_1_revenue",
  2: "level_2_product",
  3: "level_3_transportation",
  4: "level_4_warehouse",
  5: "level_5_marketplace",
  6: "level_6_marketing",
  7: "level_7_customer",
  8: "level_8_operational",
  9: "level_9_labor",
  10: "level_10_overhead",
};

const COST_LEVEL_IDS: CostLevelId[] = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const ALL_LEVEL_IDS: CostLevelId[] = [1, ...COST_LEVEL_IDS];
const SOURCES: CostSource[] = ["connected", "manual", "inferred"];

let configuredProvider: ProfitDataProvider | null = null;

export function configureProfitEngine(provider: ProfitDataProvider | null): void {
  configuredProvider = provider;
}

export function levelKey(levelId: CostLevelId): CostLevelKey {
  return LEVEL_KEYS[levelId];
}

export function createSupabaseProfitDataProvider(supabaseClient?: any): ProfitDataProvider {
  const supabase = supabaseClient || createDefaultSupabaseClient();

  return {
    async getProduct(companyId, productId, options) {
      let query = supabase
        .from("products")
        .select("id,company_id,workspace_id,sku,title,source")
        .eq("company_id", companyId)
        .eq("id", productId);

      query = applyWorkspaceFilter(query, options);

      const { data, error } = await query.maybeSingle();

      if (error) {
        throw new Error(`Unable to load product ${productId}: ${error.message}`);
      }

      return data || null;
    },

    async listRevenueEvents(companyId, productId, period, options) {
      let query = supabase
        .from("revenue_events")
        .select("id,company_id,workspace_id,product_id,amount,event_date,channel,units,source")
        .eq("company_id", companyId)
        .eq("product_id", productId);

      query = applyWorkspaceFilter(query, options);

      if (period) {
        query = query.gte("event_date", period.start).lte("event_date", period.end);
      }

      const { data, error } = await query.order("event_date", { ascending: true });

      if (error) {
        throw new Error(`Unable to load revenue events: ${error.message}`);
      }

      return (data || []).map((event: any) => ({
        ...event,
        amount: toNumber(event.amount),
        units: toNumber(event.units),
      }));
    },

    async listCostEvents(companyId, period, options) {
      let query = supabase
        .from("cost_events")
        .select(
          "id,company_id,workspace_id,category_id,amount,currency,event_date,grain,product_id,shipment_id,period_start,period_end,allocation_method,source,notes,category:cost_categories(id,level_id,code,label)",
        )
        .eq("company_id", companyId);

      query = applyWorkspaceFilter(query, options);

      const { data, error } = await query.order("event_date", { ascending: true });

      if (error) {
        throw new Error(`Unable to load cost events: ${error.message}`);
      }

      return (data || [])
        .filter((event: any) => costEventOverlapsPeriod(event, period))
        .map((event: any) => ({
          ...event,
          amount: toNumber(event.amount),
          category: normalizeCategory(event.category),
        }));
    },

    async listShipmentLines(companyId, shipmentIds, options) {
      if (!shipmentIds.length) {
        return [];
      }

      let query = supabase
        .from("shipment_lines")
        .select("id,company_id,workspace_id,shipment_id,product_id,quantity,unit_value,source")
        .eq("company_id", companyId)
        .in("shipment_id", shipmentIds);

      query = applyWorkspaceFilter(query, options);

      const { data, error } = await query;

      if (error) {
        throw new Error(`Unable to load shipment lines: ${error.message}`);
      }

      return (data || []).map((line: any) => normalizeShipmentLine(line));
    },

    async listPeriodAllocationBasis(companyId, period, options) {
      let query = supabase
        .from("revenue_events")
        .select("product_id,amount,units")
        .eq("company_id", companyId)
        .gte("event_date", period.start)
        .lte("event_date", period.end);

      query = applyWorkspaceFilter(query, options);

      const { data, error } = await query;

      if (error) {
        throw new Error(`Unable to load period allocation basis: ${error.message}`);
      }

      return aggregatePeriodBasis(data || []);
    },
  };
}

export async function computeSkuProfit(
  companyId: string,
  productId: string,
  period?: ProfitPeriod,
  options?: ProfitQueryOptions,
): Promise<SkuProfitResult> {
  const provider = configuredProvider || createSupabaseProfitDataProvider();

  return computeSkuProfitWithProvider(provider, companyId, productId, period, options);
}

export async function computeSkuProfitWithProvider(
  provider: ProfitDataProvider,
  companyId: string,
  productId: string,
  period?: ProfitPeriod,
  options?: ProfitQueryOptions,
): Promise<SkuProfitResult> {
  const product = await provider.getProduct(companyId, productId, options);

  if (!product) {
    throw new Error(`Product ${productId} was not found for company ${companyId}.`);
  }

  const revenueEvents = await provider.listRevenueEvents(companyId, productId, period, options);
  const costEvents = await provider.listCostEvents(companyId, period, options);
  const shipmentIds = unique(
    costEvents
      .filter((event) => event.grain === "shipment" && event.shipment_id)
      .map((event) => String(event.shipment_id)),
  );
  const shipmentLines = await provider.listShipmentLines(companyId, shipmentIds, options);
  const shipmentLinesByShipment = groupBy(shipmentLines, (line) => line.shipment_id);
  const periodBasisByKey = new Map<string, PeriodAllocationBasisRecord[]>();

  const grossRevenue = roundCurrency(sum(revenueEvents.map((event) => event.amount)));
  const costTotals = createLevelTotals();
  const provenance = createProvenanceReport();
  const allocationBreakdown: AllocationBreakdown[] = [];

  addProvenance(provenance, 1, revenueEvents);

  for (const event of costEvents) {
    const category = event.category;

    if (!category || !COST_LEVEL_IDS.includes(category.level_id)) {
      continue;
    }

    const allocation = await allocateCostEvent({
      event,
      productId,
      provider,
      shipmentLinesByShipment,
      periodBasisByKey,
      options,
    });

    if (!allocation || allocation.allocated_amount === 0) {
      continue;
    }

    costTotals[allocation.level_key] = roundCurrency(
      costTotals[allocation.level_key] + allocation.allocated_amount,
    );
    addProvenanceAmount(provenance, allocation.level_key, event.source, allocation.allocated_amount);
    allocationBreakdown.push(allocation);
  }

  const totalAllocatedCosts = roundCurrency(
    COST_LEVEL_IDS.reduce((total, levelId) => total + costTotals[levelKey(levelId)], 0),
  );

  // Net Realized Profit formula:
  // Revenue - Product - Transportation - Warehouse - Marketplace - Marketing
  // - Customer - Operational - Labor - Overhead.
  const netRealizedProfit = roundCurrency(
    grossRevenue -
      costTotals.level_2_product -
      costTotals.level_3_transportation -
      costTotals.level_4_warehouse -
      costTotals.level_5_marketplace -
      costTotals.level_6_marketing -
      costTotals.level_7_customer -
      costTotals.level_8_operational -
      costTotals.level_9_labor -
      costTotals.level_10_overhead,
  );

  const resultWithoutEvidence: Omit<SkuProfitResult, "evidence"> = {
    company_id: companyId,
    workspace_id: options?.workspaceId || product.workspace_id || null,
    product_id: productId,
    sku: product.sku,
    title: product.title,
    period: period || null,
    gross_revenue: grossRevenue,
    level_2_product: costTotals.level_2_product,
    level_3_transportation: costTotals.level_3_transportation,
    level_4_warehouse: costTotals.level_4_warehouse,
    level_5_marketplace: costTotals.level_5_marketplace,
    level_6_marketing: costTotals.level_6_marketing,
    level_7_customer: costTotals.level_7_customer,
    level_8_operational: costTotals.level_8_operational,
    level_9_labor: costTotals.level_9_labor,
    level_10_overhead: costTotals.level_10_overhead,
    cost_totals_by_level: costTotals,
    total_allocated_costs: totalAllocatedCosts,
    net_realized_profit: netRealizedProfit,
    dataCompleteness: finalizeProvenance(provenance),
    allocationBreakdown,
  };

  return {
    ...resultWithoutEvidence,
    evidence: createProfitEvidenceFromResult(resultWithoutEvidence),
  };
}

async function allocateCostEvent({
  event,
  productId,
  provider,
  shipmentLinesByShipment,
  periodBasisByKey,
  options,
}: {
  event: CostEventRecord;
  productId: string;
  provider: ProfitDataProvider;
  shipmentLinesByShipment: Map<string, ShipmentLineRecord[]>;
  periodBasisByKey: Map<string, PeriodAllocationBasisRecord[]>;
  options?: ProfitQueryOptions;
}): Promise<AllocationBreakdown | null> {
  const category = event.category;

  if (!category) {
    return null;
  }

  if (event.grain === "sku") {
    if (event.product_id !== productId) {
      return null;
    }

    return buildAllocation(event, {
      allocatedAmount: event.amount,
      ratio: 1,
      numerator: event.amount,
      denominator: event.amount,
      flags: [],
    });
  }

  if (event.grain === "shipment") {
    const shipmentId = event.shipment_id;

    if (!shipmentId) {
      return null;
    }

    const lines = shipmentLinesByShipment.get(shipmentId) || [];
    const targetLine = lines.find((line) => line.product_id === productId);

    if (!targetLine) {
      return null;
    }

    return buildAllocation(
      event,
      allocationFromShipmentLines(event, targetLine, lines),
    );
  }

  if (event.grain === "period") {
    if (event.allocation_method === "direct") {
      if (event.product_id !== productId) {
        return null;
      }

      return buildAllocation(event, {
        allocatedAmount: event.amount,
        ratio: 1,
        numerator: event.amount,
        denominator: event.amount,
        flags: ["direct_period_cost"],
      });
    }

    const allocationPeriod = {
      start: event.period_start || "",
      end: event.period_end || "",
    };
    const key = `${allocationPeriod.start}:${allocationPeriod.end}`;

    if (!periodBasisByKey.has(key)) {
      periodBasisByKey.set(
        key,
        await provider.listPeriodAllocationBasis(event.company_id, allocationPeriod, options),
      );
    }

    const basis = periodBasisByKey.get(key) || [];
    const targetBasis = basis.find((item) => item.product_id === productId);

    if (!targetBasis) {
      return null;
    }

    return buildAllocation(
      event,
      allocationFromPeriodBasis(event, targetBasis, basis),
    );
  }

  return null;
}

function allocationFromShipmentLines(
  event: CostEventRecord,
  targetLine: ShipmentLineRecord,
  lines: ShipmentLineRecord[],
): AllocationMath {
  if (event.allocation_method === "direct") {
    if (event.product_id && event.product_id === targetLine.product_id) {
      return {
        allocatedAmount: event.amount,
        ratio: 1,
        numerator: event.amount,
        denominator: event.amount,
        flags: ["direct_shipment_cost"],
      };
    }

    return emptyAllocation(["direct_allocation_without_target_product"]);
  }

  const method = normalizeAllocationMethod(event.allocation_method);
  const flags = method.flags;
  const numerator =
    method.method === "by_value"
      ? targetLine.quantity * targetLine.unit_value
      : targetLine.quantity;
  const denominator = lines.reduce((total, line) => {
    return total + (method.method === "by_value" ? line.quantity * line.unit_value : line.quantity);
  }, 0);

  return allocationMath(event.amount, numerator, denominator, flags);
}

function allocationFromPeriodBasis(
  event: CostEventRecord,
  targetBasis: PeriodAllocationBasisRecord,
  basis: PeriodAllocationBasisRecord[],
): AllocationMath {
  const method = normalizeAllocationMethod(event.allocation_method);
  const flags = method.flags;
  const numerator = method.method === "by_value" ? targetBasis.value : targetBasis.units;
  const denominator = basis.reduce((total, item) => {
    return total + (method.method === "by_value" ? item.value : item.units);
  }, 0);

  return allocationMath(event.amount, numerator, denominator, flags);
}

function normalizeAllocationMethod(method: AllocationMethod): {
  method: "by_units" | "by_value";
  flags: string[];
} {
  if (method === "by_value") {
    return { method: "by_value", flags: [] };
  }

  if (method === "by_volume" || method === "by_weight") {
    return {
      method: "by_units",
      flags: [`TODO_${method}_requires_dimensions_fell_back_to_by_units`],
    };
  }

  return { method: "by_units", flags: [] };
}

interface AllocationMath {
  allocatedAmount: number;
  ratio: number;
  numerator: number;
  denominator: number;
  flags: string[];
}

function allocationMath(
  amount: number,
  numerator: number,
  denominator: number,
  flags: string[] = [],
): AllocationMath {
  if (denominator <= 0 || numerator <= 0) {
    return emptyAllocation([...flags, "missing_allocation_basis"]);
  }

  const ratio = numerator / denominator;

  return {
    allocatedAmount: roundCurrency(amount * ratio),
    ratio,
    numerator,
    denominator,
    flags,
  };
}

function emptyAllocation(flags: string[]): AllocationMath {
  return {
    allocatedAmount: 0,
    ratio: 0,
    numerator: 0,
    denominator: 0,
    flags,
  };
}

function buildAllocation(event: CostEventRecord, math: AllocationMath): AllocationBreakdown {
  const levelId = event.category?.level_id || 2;
  const level_key = levelKey(levelId);

  return {
    cost_event_id: event.id,
    category_code: event.category?.code || "unknown",
    category_label: event.category?.label || "Unknown cost",
    level_id: levelId,
    level_key,
    grain: event.grain,
    allocation_method: event.allocation_method,
    source: event.source,
    original_amount: roundCurrency(event.amount),
    allocated_amount: roundCurrency(math.allocatedAmount),
    allocation_ratio: Number(math.ratio.toFixed(6)),
    basis_numerator: roundCurrency(math.numerator),
    basis_denominator: roundCurrency(math.denominator),
    shipment_id: event.shipment_id,
    product_id: event.product_id,
    period_start: event.period_start,
    period_end: event.period_end,
    flags: math.flags,
    notes: event.notes,
  };
}

function createLevelTotals(): Record<CostLevelKey, number> {
  return {
    level_1_revenue: 0,
    level_2_product: 0,
    level_3_transportation: 0,
    level_4_warehouse: 0,
    level_5_marketplace: 0,
    level_6_marketing: 0,
    level_7_customer: 0,
    level_8_operational: 0,
    level_9_labor: 0,
    level_10_overhead: 0,
  };
}

function createProvenanceReport(): Record<CostLevelKey, Record<CostSource, number>> {
  const report = {} as Record<CostLevelKey, Record<CostSource, number>>;

  for (const levelId of ALL_LEVEL_IDS) {
    report[levelKey(levelId)] = {
      connected: 0,
      manual: 0,
      inferred: 0,
    };
  }

  return report;
}

function addProvenance(
  report: Record<CostLevelKey, Record<CostSource, number>>,
  levelId: CostLevelId,
  events: Array<{ amount: number; source: CostSource }>,
): void {
  for (const event of events) {
    addProvenanceAmount(report, levelKey(levelId), event.source, event.amount);
  }
}

function addProvenanceAmount(
  report: Record<CostLevelKey, Record<CostSource, number>>,
  level: CostLevelKey,
  source: CostSource,
  amount: number,
): void {
  report[level][source] = roundCurrency(report[level][source] + amount);
}

function finalizeProvenance(
  report: Record<CostLevelKey, Record<CostSource, number>>,
): DataCompletenessReport {
  const byLevel = {} as DataCompletenessReport["byLevel"];
  const noDataLevels: DataCompletenessReport["noDataLevels"] = [];

  for (const levelId of ALL_LEVEL_IDS) {
    const key = levelKey(levelId);
    const totals = report[key];
    const total = roundCurrency(SOURCES.reduce((sumTotal, source) => sumTotal + totals[source], 0));

    byLevel[key] = {
      connected: totals.connected,
      manual: totals.manual,
      inferred: totals.inferred,
      connectedPercent: percentOf(totals.connected, total),
      manualPercent: percentOf(totals.manual, total),
      inferredPercent: percentOf(totals.inferred, total),
      total,
      hasData: total > 0,
    };

    if (levelId !== 1 && total === 0) {
      noDataLevels.push({
        level_id: levelId,
        level_key: key,
        label: LEVEL_LABELS[levelId],
      });
    }
  }

  return { byLevel, noDataLevels };
}

function applyWorkspaceFilter(query: any, options?: ProfitQueryOptions): any {
  if (!options?.workspaceId) {
    return query;
  }

  return query.eq("workspace_id", options.workspaceId);
}

function createDefaultSupabaseClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to compute profit from Supabase.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function aggregatePeriodBasis(rows: Array<{ product_id: string; amount: number; units: number }>): PeriodAllocationBasisRecord[] {
  const map = new Map<string, PeriodAllocationBasisRecord>();

  for (const row of rows) {
    const current = map.get(row.product_id) || {
      product_id: row.product_id,
      units: 0,
      value: 0,
    };

    current.units += toNumber(row.units);
    current.value += toNumber(row.amount);
    map.set(row.product_id, current);
  }

  return Array.from(map.values()).map((item) => ({
    product_id: item.product_id,
    units: roundCurrency(item.units),
    value: roundCurrency(item.value),
  }));
}

function normalizeCategory(category: any): CostEventRecord["category"] {
  const normalized = Array.isArray(category) ? category[0] : category;

  if (!normalized) {
    return null;
  }

  return {
    id: normalized.id,
    level_id: Number(normalized.level_id) as CostLevelId,
    code: normalized.code,
    label: normalized.label,
  };
}

function normalizeShipmentLine(line: any): ShipmentLineRecord {
  return {
    ...line,
    quantity: toNumber(line.quantity),
    unit_value: toNumber(line.unit_value),
  };
}

function costEventOverlapsPeriod(event: CostEventRecord, period?: ProfitPeriod): boolean {
  if (!period) {
    return true;
  }

  if (event.grain === "period") {
    const start = event.period_start || event.event_date;
    const end = event.period_end || event.event_date;

    return start <= period.end && end >= period.start;
  }

  return event.event_date >= period.start && event.event_date <= period.end;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key) || [];

    group.push(item);
    map.set(key, group);
  }

  return map;
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + toNumber(value), 0);
}

function toNumber(value: unknown): number {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function roundCurrency(value: number): number {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function percentOf(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 10000) / 100;
}
