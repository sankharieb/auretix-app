export type AdvisorFeedCardType =
  | "stockout"
  | "cash"
  | "supplier"
  | "procurement"
  | "learning";

export type AdvisorFeedSeverity = "high" | "medium" | "low";

export type EvidenceStrength = "strong" | "moderate" | "limited";

export interface AdvisorFeedCard {
  id: string;
  type: AdvisorFeedCardType;
  title: string;
  summary: string;
  projectedFinancialImpact: number;
  severity: AdvisorFeedSeverity;
  confidence: number | null;
  evidenceStrength: EvidenceStrength;
  primaryMetric: {
    label: string;
    value: string;
  };
  whyItMatters: string;
  evidenceIds: string[];
  drilldownTarget: {
    label: string;
    href: string;
  };
  responsePaths: string[];
  sourceRefs: Array<{
    table: string;
    id: string;
  }>;
}

export interface AdvisorFeedQuietState {
  isQuiet: true;
  message: string;
  watchedAreas: string[];
}

export interface AdvisorFeedResult {
  generatedAt: string;
  companyId: string;
  workspaceId?: string | null;
  rankingMode: "projected_financial_impact";
  noiseFloor: number;
  defaultMaxCards: number;
  absoluteMaxCards: number;
  cards: AdvisorFeedCard[];
  quietState: AdvisorFeedQuietState | null;
}

export interface AdvisorFeedSourceRecords {
  riskScores?: SourceRecord[];
  profitImpactRecords?: SourceRecord[];
  costEvents?: SourceRecord[];
  revenueEvents?: SourceRecord[];
  supplierIntelligence?: SourceRecord[];
  supplierPerformanceEvents?: SourceRecord[];
  decisionRecommendations?: SourceRecord[];
  dailyDecisionQueue?: SourceRecord[];
  memoryEvents?: SourceRecord[];
  memoryOutcomes?: SourceRecord[];
  memoryFinancialDerivations?: SourceRecord[];
  memoryPredictionActuals?: SourceRecord[];
}

export interface BuildAdvisorFeedInput {
  companyId: string;
  workspaceId?: string | null;
  supabase?: SupabaseLikeClient | null;
  now?: Date;
  options?: Partial<AdvisorFeedOptions>;
  records?: AdvisorFeedSourceRecords;
}

export interface AdvisorFeedOptions {
  noiseFloor: number;
  defaultMaxCards: number;
  absoluteMaxCards: number;
}

export interface SourceRecord {
  id?: string | number | null;
  company_id?: string | null;
  workspace_id?: string | null;
  [key: string]: unknown;
}

export interface SupabaseLikeClient {
  from(table: string): SupabaseLikeQuery;
}

export interface SupabaseLikeQuery extends PromiseLike<{ data: SourceRecord[] | null; error: Error | null }> {
  select(columns?: string): SupabaseLikeQuery;
  eq(column: string, value: unknown): SupabaseLikeQuery;
  order?(column: string, options?: { ascending?: boolean }): SupabaseLikeQuery;
  limit?(count: number): SupabaseLikeQuery;
}
