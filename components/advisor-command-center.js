import Link from "next/link";
import AppNavigation from "./app-navigation";
import { buildAuretixAdvisorCommandCenter } from "../lib/auretix-advisor-engine";
import { money, priorityClass } from "../lib/sku-risk-model";

function percent(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

function timeLabel(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "Just now";
  }
}

function detailList(items, fallback) {
  const lines = Array.isArray(items) ? items.filter(Boolean) : [];

  if (!lines.length) {
    return <li>{fallback}</li>;
  }

  return lines.map((line) => <li key={line}>{line}</li>);
}

function EvidenceDrilldown({ drilldown }) {
  if (!drilldown) {
    return (
      <div className="advisor-evidence-grid">
        <div>
          <span>Evidence</span>
          <ul>
            <li>Open the investigation view to inspect the underlying SKU, supplier, and cash signals.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="advisor-evidence-grid">
      <div>
        <span>Current state</span>
        <ul>{detailList(drilldown.currentState, "Current state is still being assembled.")}</ul>
      </div>
      <div>
        <span>Trend</span>
        <ul>{detailList(drilldown.trend, "Trend history is not mature yet.")}</ul>
      </div>
      <div>
        <span>Projection</span>
        <ul>{detailList(drilldown.projection, "Projection is in watch mode.")}</ul>
      </div>
      <div>
        <span>Assumptions</span>
        <ul>{detailList(drilldown.assumptions, "Assumptions use current demo operating data.")}</ul>
      </div>
      <div>
        <span>Calculation</span>
        <ul>{detailList(drilldown.calculation, "Calculation appears after SKU velocity and inventory data are available.")}</ul>
      </div>
      <div>
        <span>Confidence</span>
        <strong>{percent(drilldown.confidence?.score)}</strong>
        <ul>
          {detailList(
            drilldown.confidence?.drivers,
            "Confidence uses current inventory, supplier, demand, and outcome signals.",
          )}
        </ul>
      </div>
      <div>
        <span>Evidence</span>
        <ul>{detailList(drilldown.evidence, "No additional evidence is available yet.")}</ul>
      </div>
      <div>
        <span>Possible response paths</span>
        <ul>{detailList(drilldown.responsePaths, "Monitor current conditions.")}</ul>
      </div>
    </div>
  );
}

function impactLabel(issue) {
  if (issue.category === "Stockout Risk") {
    return "Revenue Exposure";
  }

  if (issue.category === "Cash Opportunity") {
    return "Cash Exposure";
  }

  return "Financial Impact";
}

export default function AdvisorCommandCenter() {
  const advisor = buildAuretixAdvisorCommandCenter();
  const health = advisor.healthSummary;
  const briefing = advisor.executiveBriefing;
  const advisorProblems = advisor.advisorProblems || [];

  return (
    <div className="app-shell advisor-command-shell">
      <header className="app-header advisor-topbar">
        <div>
          <div className="eyebrow">Auretix Advisor</div>
          <h1>What changed in the business today?</h1>
          <p className="hero-text">
            Auretix informs. You decide. Open any exposure to inspect the evidence.
          </p>
        </div>
        <AppNavigation />
      </header>

      <section className="advisor-command-hero advisor-briefing-hero">
        <div className="advisor-conversation-panel">
          <span className="result-label">Daily briefing</span>
          <h2>{advisor.greeting}</h2>
          <div className="advisor-conversation-copy">
            <p>{advisor.reviewedStatement}</p>
            <p>{advisor.findingSummary}</p>
            <p>{briefing.leadRisk}</p>
            <p>{briefing.consequence}</p>
            <p>{briefing.responseContext}</p>
          </div>
          <div className="advisor-secondary-findings">
            <span>Other operational changes detected:</span>
            <ul>
              {briefing.additionalFindings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          </div>
          <p className="advisor-focus-question">{briefing.focusQuestion}</p>
        </div>

        <aside className="advisor-signal-card advisor-briefing-snapshot">
          <span>Projected exposure</span>
          <details className="advisor-evidence-disclosure advisor-snapshot-disclosure">
            <summary>
              <strong>{money(health.revenueAtRisk)}</strong>
              <small>View aggregate evidence</small>
            </summary>
            <div className="advisor-mini-evidence">
              <span>Current state</span>
              <p>Aggregate revenue exposure across current inventory, supplier, and inbound timing signals.</p>
              <span>Assumption</span>
              <p>Uses the current SKU risk snapshot and existing decision-outcome history.</p>
              <span>Calculation</span>
              <p>Sum of active projected revenue exposure across the current operating queue.</p>
            </div>
          </details>
          <div className="advisor-snapshot-metrics">
            <div>
              <span>Pending</span>
              <strong>{health.pendingRecommendations}</strong>
            </div>
            <div>
              <span>Suppliers</span>
              <strong>{health.supplierRisks}</strong>
            </div>
            <div>
              <span>Cash</span>
              <strong>{money(health.cashExposure)}</strong>
            </div>
          </div>
          <small>Brief generated {timeLabel(advisor.generatedAt)}.</small>
        </aside>
      </section>

      <section className="advisor-action-section" aria-label="Advisor investigations">
        <div className="advisor-problem-grid">
          {advisorProblems.map((problem, index) => (
            <article className="advisor-problem-card" key={problem.id}>
              <div className="advisor-problem-rank">Issue {index + 1}</div>
              <span className="advisor-rank-category">{problem.label}</span>
              <h3>{problem.issue}</h3>
              <details className="advisor-evidence-disclosure">
                <summary>
                  <span>{problem.impactLabel}</span>
                  <strong>{problem.impact}</strong>
                  <small>View calculation</small>
                </summary>
                <EvidenceDrilldown drilldown={problem.evidenceDrilldown} />
              </details>
              <div className="advisor-problem-recommendation">
                <span>Projection</span>
                <p>{problem.projection}</p>
              </div>
              <div className="advisor-response-paths">
                <span>Possible response paths</span>
                <ul>{detailList(problem.responsePaths, "Monitor current conditions.")}</ul>
              </div>
              <Link className="button button-primary" href={problem.href}>
                {problem.actionLabel}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="advisor-priority-section" id="advisor-priority-list">
        <div className="results-header">
          <div>
            <span className="result-label">Ranked summary</span>
            <h3>Only expand what you want to inspect</h3>
          </div>
          <span className="tier-chip">{advisor.priorityIssues.length} priorities</span>
        </div>

        {advisor.priorityIssues.length ? (
          <div className="advisor-ranked-list">
            {advisor.priorityIssues.map((issue, index) => (
              <details className="advisor-ranked-issue" key={issue.id}>
                <summary>
                  <span className="advisor-rank-label">Priority {index + 1}</span>
                  <span className="advisor-rank-category">{issue.category}</span>
                  <strong>{issue.sku || issue.issue}</strong>
                  <span className="advisor-rank-impact">
                    {impactLabel(issue)}: {issue.impact}
                  </span>
                  <span className={`sku-priority ${priorityClass(issue.severity)}`}>
                    {issue.severity}
                  </span>
                </summary>

                <div className="advisor-ranked-detail">
                  <div className="advisor-ranked-main">
                    <div>
                      <span>Current state</span>
                      <p>{issue.issue}</p>
                    </div>
                    <div>
                      <span>Projection</span>
                      <p>{issue.projection}</p>
                    </div>
                    <div>
                      <span>Why</span>
                      <p>{issue.why}</p>
                    </div>
                  </div>

                  <div className="advisor-ranked-metrics">
                    <details className="advisor-evidence-disclosure advisor-ranked-impact-disclosure">
                      <summary>
                        <span>Financial impact</span>
                        <strong>{issue.impact}</strong>
                        <small>View calculation</small>
                      </summary>
                      <EvidenceDrilldown drilldown={issue.evidenceDrilldown} />
                    </details>
                    <div>
                      <span>Confidence</span>
                      <strong>{percent(issue.confidence)}</strong>
                    </div>
                  </div>

                  <div className="advisor-detail-columns">
                    <div>
                      <span>Evidence</span>
                      <ul>{detailList(issue.detail?.evidence, "Current operating signals need review.")}</ul>
                    </div>
                    <div>
                      <span>Projection risk</span>
                      <ul>{detailList(issue.detail?.ifIgnored, "The issue may become harder to recover later.")}</ul>
                    </div>
                    <div>
                      <span>Confidence reasoning</span>
                      <ul>
                        {detailList(
                          issue.detail?.confidenceReasoning,
                          "Confidence is based on risk, supplier, and prior decision history.",
                        )}
                      </ul>
                    </div>
                  </div>

                  <div className="advisor-response-paths advisor-ranked-response-paths">
                    <span>Possible response paths</span>
                    <ul>{detailList(issue.responsePaths, "Monitor current conditions.")}</ul>
                  </div>

                  <div className="advisor-card-actions">
                    <Link className="button button-primary" href={issue.actionHref}>
                      {issue.actionLabel}
                    </Link>
                    <Link className="button button-secondary" href={issue.secondaryActionHref}>
                      {issue.secondaryActionLabel}
                    </Link>
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="advisor-empty-state">
            <strong>No major operational changes detected.</strong>
            <span>Continue monitoring SKU, cash, supplier, and partner signals as data changes.</span>
          </div>
        )}
      </section>
    </div>
  );
}
