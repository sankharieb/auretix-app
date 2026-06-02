"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildMoatEngineSnapshot, buildOutcomeLearningSummary } from "../lib/moat-engine";
import { money, priorityClass } from "../lib/sku-risk-model";

function sourceLabel(source, migrationRequired) {
  if (migrationRequired) {
    return "Schema migration needed";
  }

  if (source === "supabase") {
    return "Supabase learning mode";
  }

  if (source === "json") {
    return "Server JSON learning mode";
  }

  return "Preview learning mode";
}

function actionLabel(action) {
  if (action === "approved") {
    return "Approved";
  }

  if (action === "deferred") {
    return "Deferred";
  }

  if (action === "request_partner_help") {
    return "Partner help";
  }

  return "Watched";
}

function formatTime(value) {
  if (!value) {
    return "Not yet";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function accuracyLabel(status) {
  if (status === "accurate") {
    return "Accurate";
  }

  if (status === "partially accurate") {
    return "Partially accurate";
  }

  if (status === "inaccurate") {
    return "Inaccurate";
  }

  return "Pending";
}

function defaultOutcomeFormFor(decision) {
  return {
    actualResult: decision
      ? `${decision.sku} outcome: record what actually happened after this recommendation was approved.`
      : "",
    actualFinancialImpact: decision?.estimatedFinancialImpact
      ? String(Math.round(decision.estimatedFinancialImpact))
      : "",
    accuracyStatus: "accurate",
  };
}

function localDecisionFrom(recommendation, userAction, workspaceId) {
  return {
    id: `local_${recommendation.id}_${Date.now()}`,
    workspaceId,
    sku: recommendation.sku,
    issueType: recommendation.issueType,
    recommendationType: recommendation.recommendationType,
    recommendedAction: recommendation.recommendedAction,
    userAction,
    status: actionLabel(userAction),
    estimatedFinancialImpact: recommendation.financialImpact,
    confidence: recommendation.confidence,
    reasonSummary: recommendation.whyItMatters,
    accuracyStatus: "pending",
    createdAt: new Date().toISOString(),
  };
}

export default function MoatCommandCenter() {
  const localSnapshot = useMemo(() => buildMoatEngineSnapshot(), []);
  const [snapshot, setSnapshot] = useState(localSnapshot);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState(
    localSnapshot.recommendations[0]?.id || null,
  );
  const [decisionHistory, setDecisionHistory] = useState(localSnapshot.decisionHistory || []);
  const [decisionOutcomes, setDecisionOutcomes] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("workspace_demo");
  const [source, setSource] = useState("preview");
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedOutcomeDecisionId, setSelectedOutcomeDecisionId] = useState(null);
  const [outcomeForm, setOutcomeForm] = useState(defaultOutcomeFormFor(null));

  const selectedRecommendation =
    snapshot.recommendations.find((item) => item.id === selectedRecommendationId) ||
    snapshot.recommendations[0];
  const executiveSummary = snapshot.executiveSummary;
  const criticalQueue = snapshot.dailyDecisionQueue.slice(0, 5);
  const approvedDecisions = useMemo(
    () => decisionHistory.filter((decision) => decision.userAction === "approved"),
    [decisionHistory],
  );
  const selectedOutcomeDecision =
    approvedDecisions.find((decision) => decision.id === selectedOutcomeDecisionId) ||
    approvedDecisions[0] ||
    null;
  const latestOutcomeByRecommendation = useMemo(() => {
    const latest = new Map();

    for (const outcome of [...decisionOutcomes].sort(
      (left, right) =>
        new Date(right.recordedAt || right.createdAt || 0).getTime() -
        new Date(left.recordedAt || left.createdAt || 0).getTime(),
    )) {
      if (!latest.has(outcome.recommendationId)) {
        latest.set(outcome.recommendationId, outcome);
      }
    }

    return latest;
  }, [decisionOutcomes]);
  const outcomeSummary = useMemo(
    () => buildOutcomeLearningSummary(decisionHistory, decisionOutcomes),
    [decisionHistory, decisionOutcomes],
  );

  useEffect(() => {
    let isActive = true;

    async function loadMoatEngine() {
      try {
        const response = await fetch("/api/moat-engine?workspaceId=workspace_demo");

        if (!response.ok) {
          throw new Error("Moat engine API is not available in preview mode.");
        }

        const data = await response.json();

        if (!isActive) {
          return;
        }

        setSnapshot(data);
        setWorkspaceId(data.workspaceId || "workspace_demo");
        setDecisionHistory(data.decisionHistory || []);
        setDecisionOutcomes(data.decisionOutcomes || []);
        setSource(data.source || "supabase");
        setMigrationRequired(Boolean(data.migrationRequired));
        setSelectedRecommendationId(data.recommendations?.[0]?.id || null);
      } catch {
        if (!isActive) {
          return;
        }

        setSource("preview");
        setMigrationRequired(false);
      }
    }

    loadMoatEngine();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!approvedDecisions.length) {
      setSelectedOutcomeDecisionId(null);
      setOutcomeForm(defaultOutcomeFormFor(null));
      return;
    }

    const selectedStillExists = approvedDecisions.some(
      (decision) => decision.id === selectedOutcomeDecisionId,
    );

    if (!selectedOutcomeDecisionId || !selectedStillExists) {
      setSelectedOutcomeDecisionId(approvedDecisions[0].id);
      setOutcomeForm(defaultOutcomeFormFor(approvedDecisions[0]));
    }
  }, [approvedDecisions, selectedOutcomeDecisionId]);

  function selectOutcomeDecision(decision) {
    setSelectedOutcomeDecisionId(decision.id);
    setOutcomeForm(defaultOutcomeFormFor(decision));
  }

  function updateOutcomeForm(field, value) {
    setOutcomeForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function recordDecision(recommendation, userAction) {
    if (!recommendation) {
      setMessage("No recommendation is selected yet.");
      return;
    }

    setSelectedRecommendationId(recommendation.id);
    setIsSaving(true);

    const payload = {
      workspaceId,
      sku: recommendation.sku,
      product: recommendation.product,
      issueType: recommendation.issueType,
      recommendationType: recommendation.recommendationType,
      recommendedAction: recommendation.recommendedAction,
      userAction,
      estimatedFinancialImpact: recommendation.financialImpact,
      confidence: recommendation.confidence,
      reasonSummary: recommendation.whyItMatters,
      riskIndex: recommendation.riskIndex,
      profitImpact: recommendation.profitImpact,
      partnerSupport: recommendation.partnerSupport,
      supplier: recommendation.supplier,
    };

    try {
      const response = await fetch("/api/moat-engine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Decision could not be saved to the server.");
      }

      const data = await response.json();
      setDecisionHistory((current) => [data.decision, ...current]);
      setMessage(
        `${actionLabel(userAction)} recorded for ${recommendation.sku}. Audit-ready financial impact: ${money(recommendation.financialImpact)}.`,
      );
    } catch {
      const localDecision = localDecisionFrom(recommendation, userAction, workspaceId);
      setDecisionHistory((current) => [localDecision, ...current]);
      setSource("preview");
      setMessage(
        `${actionLabel(userAction)} recorded in preview mode for ${recommendation.sku}. Run the Moat Engine migration for Supabase learning history.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function recordOutcome(event) {
    event.preventDefault();

    if (!selectedOutcomeDecision) {
      setMessage("Approve a recommendation before recording an outcome.");
      return;
    }

    const actualResult = outcomeForm.actualResult.trim();
    const actualFinancialImpact = Number(outcomeForm.actualFinancialImpact);

    if (!actualResult) {
      setMessage("Add a short actual result summary before saving the outcome.");
      return;
    }

    if (!Number.isFinite(actualFinancialImpact)) {
      setMessage("Add a valid actual financial impact amount before saving the outcome.");
      return;
    }

    setIsSaving(true);

    const payload = {
      workspaceId,
      recommendationId: selectedOutcomeDecision.id,
      sku: selectedOutcomeDecision.sku,
      accuracyStatus: outcomeForm.accuracyStatus,
      actualResult,
      actualFinancialImpact,
    };

    try {
      const response = await fetch("/api/moat-engine", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Outcome could not be saved.");
      }

      const data = await response.json();
      setDecisionOutcomes((current) => [data.outcome, ...current]);
      setDecisionHistory((current) =>
        current.map((entry) =>
          entry.id === selectedOutcomeDecision.id
            ? {
                ...entry,
                accuracyStatus: outcomeForm.accuracyStatus,
              }
            : entry,
        ),
      );
      setMessage(
        `${accuracyLabel(outcomeForm.accuracyStatus)} outcome recorded for ${selectedOutcomeDecision.sku}. Actual impact: ${money(actualFinancialImpact)}.`,
      );
    } catch {
      setDecisionOutcomes((current) => [
        {
          id: `local_outcome_${Date.now()}`,
          recommendationId: selectedOutcomeDecision.id,
          sku: selectedOutcomeDecision.sku,
          accuracyStatus: outcomeForm.accuracyStatus,
          actualResult,
          actualFinancialImpact,
          recordedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      setDecisionHistory((current) =>
        current.map((entry) =>
          entry.id === selectedOutcomeDecision.id
            ? {
                ...entry,
                accuracyStatus: outcomeForm.accuracyStatus,
              }
            : entry,
        ),
      );
      setMessage(
        `${accuracyLabel(outcomeForm.accuracyStatus)} outcome recorded locally for ${selectedOutcomeDecision.sku}.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="app-shell seller-risk-shell moat-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Auretix Moat Engine</div>
          <h1>Turn every rescue decision into operating intelligence.</h1>
          <p className="hero-text">
            The moat layer tracks risk scores, expected profit impact, supplier behavior,
            partner match outcomes, and whether each recommendation was right over time.
          </p>
        </div>
        <nav className="app-nav">
          <Link href="/app">Rescue board</Link>
          <Link href="/app/moat">Moat engine</Link>
          <Link href="/app/network">Network</Link>
          <Link href="/app/sku-risk">SKU risk</Link>
          <Link href="/app/procurement">Procurement</Link>
          <Link href="/app/supply-chain">Supply chain</Link>
          <Link href="/app/data-readiness">Data readiness</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <section className={`moat-status-card ${migrationRequired ? "moat-status-warning" : ""}`}>
        <div>
          <span className="result-label">Learning layer</span>
          <strong>{sourceLabel(source, migrationRequired)}</strong>
          <p>
            {migrationRequired
              ? "The UI is usable now, but Supabase needs the Moat Engine migration before persisted learning tables are available."
              : "Decisions can be recorded now and attached to risk, profit, supplier, and outcome context."}
          </p>
        </div>
        <span className="tier-chip">{snapshot.modelVersion}</span>
      </section>

      <section className="seller-risk-metric-grid moat-metric-grid">
        <div className="result-block">
          <div className="result-label">Revenue at risk</div>
          <div className="result-value">{money(executiveSummary.totalRevenueAtRisk)}</div>
          <div className="result-meta">Potential sales exposure across active risk items.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Margin at risk</div>
          <div className="result-value">{money(executiveSummary.totalMarginAtRisk)}</div>
          <div className="result-meta">Modeled gross margin exposed by poor timing or flow.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Critical SKUs</div>
          <div className="result-value">{executiveSummary.criticalSkus}</div>
          <div className="result-meta">{executiveSummary.inboundRisks} inbound or stockout risks.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Losses prevented</div>
          <div className="result-value">
            {money(outcomeSummary.lossesPrevented || executiveSummary.estimatedLossesPrevented)}
          </div>
          <div className="result-meta">
            {outcomeSummary.totalOutcomes
              ? `${outcomeSummary.totalOutcomes} outcome-backed result(s).`
              : `${executiveSummary.recommendationsApproved} approved recommendations.`}
          </div>
        </div>
      </section>

      <section className="moat-command-grid">
        <div className="lab-card moat-queue-card">
          <div className="results-header">
            <h3>What needs action today</h3>
            <span className="tier-chip">{snapshot.dailyDecisionQueue.length} ranked</span>
          </div>
          <div className="moat-decision-list">
            {criticalQueue.map((item) => (
              <button
                className={`moat-decision-item ${
                  selectedRecommendation?.id === item.id ? "active" : ""
                }`}
                key={item.id}
                onClick={() => setSelectedRecommendationId(item.id)}
                type="button"
              >
                <span className={`sku-priority ${priorityClass(item.riskIndex.riskLevel)}`}>
                  {item.riskIndex.riskLevel}
                </span>
                <strong>{item.problem}</strong>
                <small>{item.whyItMatters}</small>
                <em>{money(item.financialImpact)} impact | {item.confidence}% confidence</em>
              </button>
            ))}
          </div>
        </div>

        <div className="lab-card moat-focus-card">
          <div className="results-header">
            <h3>Recommended move</h3>
            <span className={`sku-priority ${priorityClass(selectedRecommendation?.riskIndex.riskLevel || "watch")}`}>
              {selectedRecommendation?.riskIndex.score}/100
            </span>
          </div>
          <div className="moat-risk-index">
            <div>
              <span className="result-label">Auretix Risk Index</span>
              <strong>{selectedRecommendation?.riskIndex.riskLevel}</strong>
              <p>{selectedRecommendation?.riskIndex.reasonSummary}</p>
            </div>
            <div>
              <span className="result-label">Financial impact estimate</span>
              <strong>{money(selectedRecommendation?.financialImpact || 0)}</strong>
              <p>{selectedRecommendation?.profitImpact.expectedBenefitCopy}</p>
            </div>
          </div>
          <div className="moat-selected-body">
            <div>
              <span className="result-label">Why this is risky</span>
              <p>{selectedRecommendation?.whyItMatters}</p>
            </div>
            <div>
              <span className="result-label">Expected outcome</span>
              <p>
                {selectedRecommendation?.recommendedAction} should protect about{" "}
                {money(selectedRecommendation?.profitImpact.expectedBenefit || 0)} in modeled benefit.
              </p>
            </div>
          </div>
          <div className="button-row moat-action-row">
            <button
              className="button button-primary"
              disabled={isSaving}
              onClick={() => recordDecision(selectedRecommendation, "approved")}
              type="button"
            >
              Approve
            </button>
            <button
              className="button button-secondary"
              disabled={isSaving}
              onClick={() => recordDecision(selectedRecommendation, "deferred")}
              type="button"
            >
              Defer
            </button>
            <button
              className="button button-secondary"
              disabled={isSaving}
              onClick={() => recordDecision(selectedRecommendation, "watched")}
              type="button"
            >
              Watch
            </button>
            <button
              className="button button-secondary"
              disabled={isSaving}
              onClick={() => recordDecision(selectedRecommendation, "request_partner_help")}
              type="button"
            >
              Request partner help
            </button>
          </div>
          {message ? <div className="flow-run-result moat-run-result">{message}</div> : null}
        </div>
      </section>

      <section className="moat-profit-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Money at risk</h3>
            <span className="tier-chip">Profit Impact Engine</span>
          </div>
          <div className="moat-impact-strip">
            <div>
              <span>Revenue at risk</span>
              <strong>{money(selectedRecommendation?.profitImpact.revenueAtRisk || 0)}</strong>
            </div>
            <div>
              <span>Margin at risk</span>
              <strong>{money(selectedRecommendation?.profitImpact.marginAtRisk || 0)}</strong>
            </div>
            <div>
              <span>Cash tied up</span>
              <strong>{money(selectedRecommendation?.profitImpact.cashTiedUp || 0)}</strong>
            </div>
            <div>
              <span>Cost of delay</span>
              <strong>{money(selectedRecommendation?.profitImpact.costOfDelay || 0)}</strong>
            </div>
          </div>
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Decision status</h3>
            <span className="tier-chip">Outcome loop</span>
          </div>
          <div className="moat-impact-strip">
            <div>
              <span>Pending</span>
              <strong>{executiveSummary.recommendationsPending}</strong>
            </div>
            <div>
              <span>Approved</span>
              <strong>{executiveSummary.recommendationsApproved}</strong>
            </div>
            <div>
              <span>Supplier risks</span>
              <strong>{executiveSummary.supplierRisks}</strong>
            </div>
            <div>
              <span>Partner opens</span>
              <strong>{executiveSummary.partnerRequestsOpen}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="moat-learning-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Outcome learning scorecard</h3>
            <span className="tier-chip">{outcomeSummary.totalOutcomes} outcomes</span>
          </div>
          <div className="moat-learning-metrics">
            <div>
              <span>Accurate</span>
              <strong>{outcomeSummary.accuratePercent}%</strong>
              <small>{outcomeSummary.accurateCount} latest outcome(s)</small>
            </div>
            <div>
              <span>Partially accurate</span>
              <strong>{outcomeSummary.partiallyAccuratePercent}%</strong>
              <small>{outcomeSummary.partiallyAccurateCount} latest outcome(s)</small>
            </div>
            <div>
              <span>Inaccurate</span>
              <strong>{outcomeSummary.inaccuratePercent}%</strong>
              <small>{outcomeSummary.inaccurateCount} latest outcome(s)</small>
            </div>
            <div>
              <span>Estimated vs actual</span>
              <strong>{money(outcomeSummary.estimatedFinancialImpact)}</strong>
              <small>
                Actual {money(outcomeSummary.actualFinancialImpact)} | variance{" "}
                {money(outcomeSummary.impactVariance)}
              </small>
            </div>
            <div>
              <span>Losses prevented</span>
              <strong>{money(outcomeSummary.lossesPrevented)}</strong>
              <small>Accurate and partially accurate outcomes.</small>
            </div>
            <div>
              <span>Awaiting result</span>
              <strong>{outcomeSummary.pendingOutcomeCount}</strong>
              <small>Approved decisions still need actual results.</small>
            </div>
          </div>
        </div>

        <form className="lab-card moat-outcome-form" onSubmit={recordOutcome}>
          <div className="results-header">
            <h3>Record actual outcome</h3>
            <span className="tier-chip">Learning loop</span>
          </div>
          {approvedDecisions.length ? (
            <>
              <label className="moat-field">
                Approved recommendation
                <select
                  value={selectedOutcomeDecision?.id || ""}
                  onChange={(event) => {
                    const nextDecision = approvedDecisions.find(
                      (decision) => decision.id === event.target.value,
                    );

                    if (nextDecision) {
                      selectOutcomeDecision(nextDecision);
                    }
                  }}
                >
                  {approvedDecisions.map((decision) => (
                    <option key={decision.id} value={decision.id}>
                      {decision.sku} - {decision.recommendedAction}
                    </option>
                  ))}
                </select>
              </label>

              <div className="moat-outcome-reference">
                <div>
                  <span>Recommendation ID</span>
                  <strong>{selectedOutcomeDecision?.id}</strong>
                </div>
                <div>
                  <span>SKU</span>
                  <strong>{selectedOutcomeDecision?.sku}</strong>
                </div>
                <div>
                  <span>Estimated impact</span>
                  <strong>{money(selectedOutcomeDecision?.estimatedFinancialImpact || 0)}</strong>
                </div>
                <div>
                  <span>Recorded timestamp</span>
                  <strong>Captured on submit</strong>
                </div>
              </div>

              <label className="moat-field">
                Actual result summary
                <textarea
                  rows={4}
                  value={outcomeForm.actualResult}
                  onChange={(event) => updateOutcomeForm("actualResult", event.target.value)}
                />
              </label>

              <div className="moat-field-grid">
                <label className="moat-field">
                  Actual financial impact
                  <input
                    type="number"
                    value={outcomeForm.actualFinancialImpact}
                    onChange={(event) =>
                      updateOutcomeForm("actualFinancialImpact", event.target.value)
                    }
                  />
                </label>
                <label className="moat-field">
                  Accuracy status
                  <select
                    value={outcomeForm.accuracyStatus}
                    onChange={(event) => updateOutcomeForm("accuracyStatus", event.target.value)}
                  >
                    <option value="accurate">Accurate</option>
                    <option value="partially accurate">Partially accurate</option>
                    <option value="inaccurate">Inaccurate</option>
                  </select>
                </label>
              </div>

              <button className="button button-primary" disabled={isSaving} type="submit">
                Save outcome
              </button>
            </>
          ) : (
            <p className="result-meta">
              Approve a recommendation first. Auretix records outcomes only after a human decision
              exists, so the learning loop stays auditable.
            </p>
          )}
        </form>
      </section>

      <section className="seller-risk-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Supplier Intelligence Graph</h3>
            <span className="tier-chip">Feeds Risk Index</span>
          </div>
          <div className="moat-supplier-list">
            {snapshot.supplierIntelligence.map((supplier) => (
              <div key={supplier.id}>
                <strong>{supplier.supplierName}</strong>
                <span>{supplier.reliabilityScore}/100 reliability</span>
                <small>
                  Expected {supplier.expectedLeadTime}d, actual {supplier.actualLeadTime}d,
                  average delay {supplier.averageDelay}d, on-time {supplier.onTimePercentage}%.
                </small>
                <small>
                  {supplier.skuRelationships.length} SKU links | {supplier.issueHistory.length} issue events.
                </small>
              </div>
            ))}
          </div>
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Partner Network Intelligence</h3>
            <span className="tier-chip">Resolution moat</span>
          </div>
          <div className="moat-partner-grid">
            {snapshot.partnerIntelligence.map((partner) => (
              <div key={partner.partnerType}>
                <strong>{partner.matchRequestType}</strong>
                <span>{partner.matchedPartnerSentStatus}</span>
                <small>
                  {partner.consentStatus}; {partner.referralDisclosureStatus}.
                </small>
                <small>
                  {partner.partnerSuccessRating}/100 partner fit | {partner.timeToResponseHours}h response target.
                </small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lab-card moat-history-card">
        <div className="results-header">
          <h3>Decision history</h3>
          <span className="tier-chip">{decisionHistory.length} saved</span>
        </div>
        {decisionHistory.length ? (
          <div className="moat-history-list">
            {decisionHistory.slice(0, 8).map((decision) => {
              const latestOutcome = latestOutcomeByRecommendation.get(decision.id);

              return (
                <div className="moat-history-item" key={decision.id}>
                  <span>
                    <strong>{decision.sku}</strong>
                    <small>{formatTime(decision.createdAt)}</small>
                  </span>
                  <span>{decision.recommendedAction}</span>
                  <span>{decision.status || actionLabel(decision.userAction)}</span>
                  <span>{money(decision.estimatedFinancialImpact || 0)}</span>
                  <span>{accuracyLabel(latestOutcome?.accuracyStatus || decision.accuracyStatus)}</span>
                  <span className="partner-status-actions moat-outcome-actions">
                    {decision.userAction === "approved" ? (
                      <button
                        disabled={isSaving}
                        onClick={() => selectOutcomeDecision(decision)}
                        type="button"
                      >
                        Record outcome
                      </button>
                    ) : (
                      <small>Approve first</small>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="result-meta">
            No decisions have been recorded yet. Approve, defer, watch, or request partner help
            from Today&apos;s Decisions to start building the learning history.
          </p>
        )}
        {decisionOutcomes.length ? (
          <p className="result-meta moat-outcome-note">
            {decisionOutcomes.length} outcome record(s) attached to this workspace.
          </p>
        ) : null}
      </section>

      <section className="lab-card moat-history-card">
        <div className="results-header">
          <h3>Outcome history</h3>
          <span className="tier-chip">{decisionOutcomes.length} recorded</span>
        </div>
        {outcomeSummary.recentOutcomes.length ? (
          <div className="moat-outcome-list">
            {outcomeSummary.recentOutcomes.slice(0, 8).map((outcome) => (
              <div className="moat-outcome-item" key={outcome.id}>
                <span>
                  <strong>{outcome.sku}</strong>
                  <small>{formatTime(outcome.recordedAt || outcome.createdAt)}</small>
                </span>
                <span>{accuracyLabel(outcome.accuracyStatus)}</span>
                <span>{money(outcome.estimatedFinancialImpact || 0)} estimated</span>
                <span>{money(outcome.actualFinancialImpact || 0)} actual</span>
                <span>{money(outcome.impactVariance || 0)} variance</span>
                <p>{outcome.actualResult}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="result-meta">
            No outcomes have been recorded yet. Save an actual result from the Learning loop card
            to prove whether Auretix was right.
          </p>
        )}
      </section>
    </div>
  );
}
