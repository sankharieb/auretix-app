export type EvidenceSourceType = "connected" | "manual" | "inferred" | "calculated";

export type EvidenceType =
  | "current_state"
  | "trend"
  | "projection"
  | "assumption"
  | "calculation"
  | "confidence_driver"
  | "source_quality";

export type EvidenceRelationship =
  | "supports"
  | "reduces_confidence"
  | "increases_confidence"
  | "calculation_input"
  | "assumption"
  | "source";

export interface EvidenceSource {
  id: string;
  company_id: string;
  workspace_id: string | null;
  source_type: EvidenceSourceType;
  system: string;
  label: string;
  reliability_score: number | null;
  last_seen_at: string;
  created_at?: string;
}

export interface EvidenceRecord {
  id: string;
  company_id: string;
  workspace_id: string | null;
  source_id: string | null;
  entity_type: string;
  entity_id: string;
  evidence_type: EvidenceType;
  label: string;
  value_numeric: number | null;
  value_text: string | null;
  value_json: Record<string, unknown> | null;
  unit: string | null;
  observed_at: string;
  confidence: number | null;
  source_type: EvidenceSourceType;
  created_at?: string;
}

export interface EvidenceLink {
  id: string;
  company_id: string;
  workspace_id: string | null;
  parent_type: string;
  parent_id: string;
  evidence_record_id: string;
  relationship: EvidenceRelationship;
  weight: number | null;
  created_at?: string;
}

export interface EvidenceCalculationRun {
  id: string;
  company_id: string;
  workspace_id: string | null;
  calculation_type: string;
  target_type: string;
  target_id: string;
  engine_version: string;
  input_hash: string | null;
  result_json: Record<string, unknown>;
  confidence: number | null;
  created_at: string;
}

export interface EvidenceTrustSummary {
  totalRecords: number;
  connectedCount: number;
  manualCount: number;
  inferredCount: number;
  calculatedCount: number;
  averageConfidence: number;
  missingEvidenceWarnings: string[];
  sourceMixLabel: string;
}

export interface EvidenceBundle {
  parentType: string;
  parentId: string;
  confidence: number;
  dataFreshness: {
    latestObservedAt: string | null;
    oldestObservedAt: string | null;
    staleRecordCount: number;
  };
  sourceMix: {
    connected: number;
    manual: number;
    inferred: number;
    calculated: number;
  };
  evidenceRecords: EvidenceRecord[];
  calculationRun: EvidenceCalculationRun | null;
  summary: EvidenceTrustSummary;
}

export interface ProfitEvidencePayload {
  calculationRun: EvidenceCalculationRun;
  records: EvidenceRecord[];
  links: EvidenceLink[];
  trustSummary: EvidenceTrustSummary;
}
