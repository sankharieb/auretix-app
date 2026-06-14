import Link from "next/link";
import { buildAuretixAdvisorCommandCenter } from "../lib/auretix-advisor-engine";
import { money, priorityClass } from "../lib/sku-risk-model";

const navLinks = [
  { label: "Advisor", href: "/app" },
  { label: "Stockouts", href: "/app/supply-chain" },
  { label: "Cash", href: "/app/procurement" },
  { label: "Suppliers", href: "/app/network" },
  { label: "Procurement", href: "/app/procurement" },
  { label: "Learning", href: "/app/moat" },
  { label: "Partners", href: "/app/network" },
  { label: "Sign in", href: "/login" },
];

const advisorActions = [
  {
    label: "Review Stockouts",
    href: "/app/supply-chain",
    detail: "Stockout dates, inbound risk, and service gaps.",
  },
  {
    label: "Protect Cash",
    href: "/app/procurement",
    detail: "Buying decisions, cash required, and PO priority.",
  },
  {
    label: "Review Suppliers",
    href: "/app/network",
    detail: "Reliability concerns, backup paths, and partner support.",
  },
  {
    label: "Review Procurement Decisions",
    href: "/app/procurement",
    detail: "Approve, defer, or watch purchase decisions.",
  },
  {
    label: "Review Learning & Accuracy",
    href: "/app/moat",
    detail: "Outcomes, accuracy, confidence, and verified impact.",
  },
  {
    label: "Show Everything",
    href: "#advisor-priority-list",
    detail: "Open the full ranked summary below.",
  },
];

const deepDiveCards = [
  {
    title: "SKU Risk",
    href: "/app/sku-risk",
    copy: "Inspect stockout timing, cash exposure, score drivers, and SKU-level assumptions.",
  },
  {
    title: "Procurement",
    href: "/app/procurement",
    copy: "Decide what to buy, how much to spend, and which PO should move first.",
  },
  {
    title: "Supply Chain",
    href: "/app/supply-chain",
    copy: "Review days of cover, inbound timing, service continuity, and flow risk.",
  },
  {
    title: "Learning",
    href: "/app/moat",
    copy: "Measure recommendation accuracy, financial impact, confidence feedback, and outcomes.",
  },
  {
    title: "Partners",
    href: "/app/network",
    copy: "Request freight, backup supplier, wholesale, or 3PL partner support.",
  },
];

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

  return (
    <div className="app-shell advisor-command-shell">
      <header className="app-header advisor-topbar">
        <div>
          <div className="eyebrow">Auretix Advisor</div>
          <h1>Advisor briefing.</h1>
          <p className="hero-text">
            Auretix starts with what matters, then lets you drill into the details.
          </p>
        </div>
        <nav className="app-nav">
          {navLinks.map((link) => (
            <Link href={link.href} key={`${link.label}-${link.href}`}>
              {link.label}
            </Link>
          ))}
        </nav>
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

      <section className="advisor-action-section" aria-label="Advisor actions">
        <div className="advisor-action-grid">
          {advisorActions.map((action) => (
            <Link className="advisor-action-button" href={action.href} key={action.label}>
              <strong>{action.label}</strong>
              <span>{action.detail}</span>
            </Link>
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

      <section className="advisor-deep-dive-section">
        <div className="results-header">
          <div>
            <span className="result-label">Dashboards second</span>
            <h3>Deep dives stay available when you need detail</h3>
          </div>
          <span className="tier-chip">Drill down</span>
        </div>
        <div className="advisor-deep-dive-grid">
          {deepDiveCards.map((card) => (
            <Link className="advisor-deep-dive-card" href={card.href} key={card.title}>
              <strong>{card.title}</strong>
              <span>{card.copy}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
