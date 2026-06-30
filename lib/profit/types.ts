import type { ProfitEvidencePayload } from "../evidence/types";

export type CostSource = "connected" | "manual" | "inferred";

export type CostEventGrain = "sku" | "shipment" | "period";

export type AllocationMethod = "by_units" | "by_value" | "by_volume" | "by_weight" | "direct";

export type CostLevelId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type CostLevelKey =
  | "level_1_revenue"
  | "level_2_product"
  | "level_3_transportation"
  | "level_4_warehouse"
  | "level_5_marketplace"
  | "level_6_marketing"
  | "level_7_customer"
  | "level_8_operational"
  | "level_9_labor"
  | "level_10_overhead";

export interface ProfitPeriod {
  start: string;
  end: string;
}

export interface ProfitQueryOptions {
  workspaceId?: string;
}

export interface ProductRecord {
  id: string;
  company_id: string;
  workspace_id: string | null;
  sku: string;
  title: string;
  source?: CostSource;
}

export interface ShipmentLineRecord {
  id: string;
  company_id: string;
  workspace_id: string | null;
  shipment_id: string;
  product_id: string;
  quantity: number;
  unit_value: number;
  source?: CostSource;
}

export interface CostCategoryRecord {
  id: string;
  level_id: CostLevelId;
  code: string;
  label: string;
}

export interface CostEventRecord {
  id: string;
  company_id: string;
  workspace_id: string | null;
  category_id: string;
  category?: CostCategoryRecord | null;
  amount: number;
  currency: string;
  event_date: string;
  grain: CostEventGrain;
  product_id: string | null;
  shipment_id: string | null;
  period_start: string | null;
  period_end: string | null;
  allocation_method: AllocationMethod;
  source: CostSource;
  notes: string | null;
}

export interface RevenueEventRecord {
  id: string;
  company_id: string;
  workspace_id: string | null;
  product_id: string;
  amount: number;
  event_date: string;
  channel: string;
  units: number;
  source: CostSource;
}

export interface PeriodAllocationBasisRecord {
  product_id: string;
  units: number;
  value: number;
}

export interface ProfitDataProvider {
  getProduct(
    companyId: string,
    productId: string,
    options?: ProfitQueryOptions,
  ): Promise<ProductRecord | null>;
  listRevenueEvents(
    companyId: string,
    productId: string,
    period?: ProfitPeriod,
    options?: ProfitQueryOptions,
  ): Promise<RevenueEventRecord[]>;
  listCostEvents(
    companyId: string,
    period?: ProfitPeriod,
    options?: ProfitQueryOptions,
  ): Promise<CostEventRecord[]>;
  listShipmentLines(
    companyId: string,
    shipmentIds: string[],
    options?: ProfitQueryOptions,
  ): Promise<ShipmentLineRecord[]>;
  listPeriodAllocationBasis(
    companyId: string,
    period: ProfitPeriod,
    options?: ProfitQueryOptions,
  ): Promise<PeriodAllocationBasisRecord[]>;
}

export interface AllocationBreakdown {
  cost_event_id: string;
  category_code: string;
  category_label: string;
  level_id: CostLevelId;
  level_key: CostLevelKey;
  grain: CostEventGrain;
  allocation_method: AllocationMethod;
  source: CostSource;
  original_amount: number;
  allocated_amount: number;
  allocation_ratio: number;
  basis_numerator: number;
  basis_denominator: number;
  shipment_id: string | null;
  product_id: string | null;
  period_start: string | null;
  period_end: string | null;
  flags: string[];
  notes: string | null;
}

export interface LevelProvenance {
  connected: number;
  manual: number;
  inferred: number;
  connectedPercent: number;
  manualPercent: number;
  inferredPercent: number;
  total: number;
  hasData: boolean;
}

export interface DataCompletenessReport {
  byLevel: Record<CostLevelKey, LevelProvenance>;
  noDataLevels: Array<{
    level_id: CostLevelId;
    level_key: CostLevelKey;
    label: string;
  }>;
}

export interface SkuProfitResult {
  company_id: string;
  workspace_id: string | null;
  product_id: string;
  sku: string;
  title: string;
  period: ProfitPeriod | null;
  gross_revenue: number;
  level_2_product: number;
  level_3_transportation: number;
  level_4_warehouse: number;
  level_5_marketplace: number;
  level_6_marketing: number;
  level_7_customer: number;
  level_8_operational: number;
  level_9_labor: number;
  level_10_overhead: number;
  cost_totals_by_level: Record<CostLevelKey, number>;
  total_allocated_costs: number;
  net_realized_profit: number;
  dataCompleteness: DataCompletenessReport;
  allocationBreakdown: AllocationBreakdown[];
  evidence: ProfitEvidencePayload;
}
