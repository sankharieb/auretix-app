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

const goalButtons = [
  {
    label: "Prevent stockouts",
    href: "/app/supply-chain",
    detail: "Find SKUs, inbound timing, and service gaps that can break availability.",
  },
  {
    label: "Protect cash",
    href: "/app/procurement",
    detail: "See which buys to approve, defer, or stop before cash gets trapped.",
  },
  {
    label: "Review supplier risk",
    href: "/app/network",
    detail: "Check backup paths, partner help, lead-time pressure, and reliability.",
  },
  {
    label: "Make procurement decisions",
    href: "/app/procurement",
    detail: "Review purchase quantities, cash required, margin impact, and PO priority.",
  },
  {
    label: "Improve forecast confidence",
    href: "/app/sku-risk",
    detail: "Review SKU-level demand, forecast pressure, and risk score drivers.",
  },
  {
    label: "Review learning performance",
    href: "/app/moat",
    detail: "See outcomes, accuracy, confidence feedback, and verified impact.",
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

export default function AdvisorCommandCenter() {
  const advisor = buildAuretixAdvisorCommandCenter();
  const health = advisor.healthSummary;

  return (
    <div className="app-shell advisor-command-shell">
      <header className="app-header advisor-topbar">
        <div>
          <div className="eyebrow">Auretix Advisor</div>
          <h1>Daily business review.</h1>
          <p className="hero-text">
            A calm command center for the seller decisions that can cost money this week.
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

      <section className="advisor-command-hero">
        <div className="advisor-conversation-panel">
          <span className="result-label">Daily briefing</span>
          <h2>{advisor.greeting}</h2>
          <div className="advisor-conversation-copy">
            <p>{advisor.reviewedStatement}</p>
            <p>{advisor.findingSummary}</p>
            <p>{advisor.closingLine}</p>
          </div>
        </div>
        <div className="advisor-signal-card">
          <span>Brief generated</span>
          <strong>{timeLabel(advisor.generatedAt)}</strong>
          <small>Seeded demo data is active until live seller integrations are connected.</small>
        </div>
      </section>

      <section className="advisor-health-grid" aria-label="Money at risk">
        <div>
          <span>Revenue at risk</span>
          <strong>{money(health.revenueAtRisk)}</strong>
          <small>Sales exposure from today&apos;s operating issues.</small>
        </div>
        <div>
          <span>Margin at risk</span>
          <strong>{money(health.marginAtRisk)}</strong>
          <small>Gross margin exposed by timing, stockout, and buying decisions.</small>
        </div>
        <div>
          <span>Cash exposure</span>
          <strong>{money(health.cashExposure)}</strong>
          <small>Cash tied up or requested by recommended actions.</small>
        </div>
        <div>
          <span>Supplier risks</span>
          <strong>{health.supplierRisks}</strong>
          <small>Suppliers below target reliability or service confidence.</small>
        </div>
        <div>
          <span>Pending decisions</span>
          <strong>{health.pendingRecommendations}</strong>
          <small>Recommendations still waiting for owner action.</small>
        </div>
      </section>

      <section className="advisor-priority-section">
        <div className="results-header">
          <div>
            <span className="result-label">What needs action today</span>
            <h3>Here&apos;s what I recommend next</h3>
          </div>
          <span className="tier-chip">{advisor.priorityIssues.length} ranked</span>
        </div>

        {advisor.priorityIssues.length ? (
          <div className="advisor-issue-grid">
            {advisor.priorityIssues.map((issue, index) => (
              <article className="advisor-issue-card" key={issue.id}>
                <div className="advisor-card-head">
                  <span className="advisor-category-badge">{issue.category}</span>
                  <span className={`sku-priority ${priorityClass(issue.severity)}`}>
                    {issue.severity}
                  </span>
                </div>

                <h4>
                  <span>{index + 1}.</span> {issue.issue}
                </h4>

                <div className="advisor-issue-block">
                  <span>Recommendation</span>
                  <p>{issue.recommendation}</p>
                </div>

                <div className="advisor-issue-block">
                  <span>Why</span>
                  <p>{issue.why}</p>
                </div>

                <div className="advisor-compact-metrics">
                  <div>
                    <span>Impact</span>
                    <strong>{issue.impact}</strong>
                  </div>
                  <div>
                    <span>Confidence</span>
                    <strong>{percent(issue.confidence)}</strong>
                  </div>
                </div>

                <details className="advisor-reasoning-details">
                  <summary>Why Auretix thinks this</summary>
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
                </details>

                <div className="advisor-card-actions">
                  <Link className="button button-primary" href={issue.actionHref}>
                    {issue.actionLabel}
                  </Link>
                  <Link className="button button-secondary" href={issue.secondaryActionHref}>
                    {issue.secondaryActionLabel}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="advisor-empty-state">
            <strong>No urgent decisions found.</strong>
            <span>Review the deep dives below when you want to inspect SKU, cash, supplier, or partner signals.</span>
          </div>
        )}
      </section>

      <section className="advisor-goals-section">
        <div className="results-header">
          <div>
            <span className="result-label">Choose the next move</span>
            <h3>What would you like to solve?</h3>
          </div>
          <span className="tier-chip">Goal based</span>
        </div>
        <div className="advisor-goal-grid">
          {goalButtons.map((goal) => (
            <Link className="advisor-goal-card" href={goal.href} key={goal.label}>
              <strong>{goal.label}</strong>
              <span>{goal.detail}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="advisor-deep-dive-section">
        <div className="results-header">
          <div>
            <span className="result-label">Deep dives</span>
            <h3>Specialized views stay available when you need detail</h3>
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
