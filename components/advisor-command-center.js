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
          <h1>What can cost money today?</h1>
          <p className="hero-text">
            Auretix decides what matters first. Deeper tools stay behind investigations.
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
            <p>{briefing.recommendation}</p>
          </div>
          <div className="advisor-secondary-findings">
            <span>I also identified:</span>
            <ul>
              {briefing.additionalFindings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          </div>
          <p className="advisor-focus-question">{briefing.focusQuestion}</p>
        </div>

        <aside className="advisor-signal-card advisor-briefing-snapshot">
          <span>Business exposure</span>
          <strong>{money(health.revenueAtRisk)}</strong>
          <small>Revenue at risk across today&apos;s operating issues.</small>
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
              <div className="advisor-problem-impact">
                <span>{problem.impactLabel}</span>
                <strong>{problem.impact}</strong>
              </div>
              <div className="advisor-problem-recommendation">
                <span>Recommended action</span>
                <p>{problem.recommendation}</p>
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
                      <span>Issue</span>
                      <p>{issue.issue}</p>
                    </div>
                    <div>
                      <span>Recommendation</span>
                      <p>{issue.recommendation}</p>
                    </div>
                    <div>
                      <span>Why</span>
                      <p>{issue.why}</p>
                    </div>
                  </div>

                  <div className="advisor-ranked-metrics">
                    <div>
                      <span>Financial impact</span>
                      <strong>{issue.impact}</strong>
                    </div>
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
                      <span>If ignored</span>
                      <ul>{detailList(issue.detail?.ifIgnored, "The issue may become harder to recover later.")}</ul>
                    </div>
                    <div>
                      <span>Confidence reasoning</span>
                      <ul>
                        {detailList(
                          issue.detail?.confidenceReasoning,
                          "Confidence is based on risk, supplier, and recommendation history.",
                        )}
                      </ul>
                    </div>
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
            <strong>No urgent decisions found.</strong>
            <span>Review the deep dives below when you want to inspect SKU, cash, supplier, or partner signals.</span>
          </div>
        )}
      </section>
    </div>
  );
}
