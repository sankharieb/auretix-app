import Link from "next/link";
import { buildAuretixAdvisorCommandCenter } from "../lib/auretix-advisor-engine";
import { money, priorityClass } from "../lib/sku-risk-model";

const goalButtons = [
  {
    label: "Prevent stockouts",
    href: "/app/supply-chain",
    detail: "Find SKUs and inbound issues that can break service.",
  },
  {
    label: "Protect cash",
    href: "/app/procurement",
    detail: "See what to buy, defer, or stop funding.",
  },
  {
    label: "Review supplier risk",
    href: "/app/supply-chain",
    detail: "Check reliability, lead-time pressure, and backup paths.",
  },
  {
    label: "Make procurement decisions",
    href: "/app/procurement",
    detail: "Approve, defer, or watch PO recommendations.",
  },
  {
    label: "Improve forecast confidence",
    href: "/app/sku-risk",
    detail: "Review SKU-level demand and risk signals.",
  },
  {
    label: "Review learning performance",
    href: "/app/moat",
    detail: "See outcomes, accuracy, and confidence feedback.",
  },
];

const deepDiveCards = [
  {
    title: "SKU Risk",
    href: "/app/sku-risk",
    copy: "Inspect SKU-level risk, stockout timing, cash exposure, and score drivers.",
  },
  {
    title: "Procurement",
    href: "/app/procurement",
    copy: "Decide what to buy, how much cash is required, and which PO should move first.",
  },
  {
    title: "Supply Chain",
    href: "/app/supply-chain",
    copy: "Review flow risk, days of cover, inbound timing, and service continuity.",
  },
  {
    title: "Moat Engine",
    href: "/app/moat",
    copy: "Measure recommendation accuracy, financial impact, confidence feedback, and outcomes.",
  },
  {
    title: "Network",
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

export default function AdvisorCommandCenter() {
  const advisor = buildAuretixAdvisorCommandCenter();
  const health = advisor.healthSummary;

  return (
    <div className="app-shell advisor-command-shell">
      <header className="app-header advisor-topbar">
        <div>
          <div className="eyebrow">Auretix Advisor</div>
          <h1>Your AI operating brain for supply chain and procurement.</h1>
          <p className="hero-text">
            Auretix reviews inventory, supplier reliability, inbound timing, cash exposure,
            recommendation outcomes, and partner options so you know what needs attention today.
          </p>
        </div>
        <nav className="app-nav">
          <Link href="/app">Advisor</Link>
          <Link href="/app/sku-risk">SKU risk</Link>
          <Link href="/app/procurement">Procurement</Link>
          <Link href="/app/supply-chain">Supply chain</Link>
          <Link href="/app/moat">Moat engine</Link>
          <Link href="/app/network">Network</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <section className="advisor-command-hero">
        <div>
          <span className="result-label">Today&apos;s operating brief</span>
          <h2>{advisor.greeting}</h2>
          <p>{advisor.summary}</p>
          <p className="advisor-review-copy">
            I reviewed {advisor.reviewedSignals.join(", ")}. Here is what matters most.
          </p>
        </div>
        <div className="advisor-signal-card">
          <span>Generated</span>
          <strong>{timeLabel(advisor.generatedAt)}</strong>
          <small>Seeded demo intelligence is active until live integrations are connected.</small>
        </div>
      </section>

      <section className="advisor-health-grid">
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
          <small>Suppliers under target reliability.</small>
        </div>
        <div>
          <span>Pending decisions</span>
          <strong>{health.pendingRecommendations}</strong>
          <small>Recommendations still waiting for a human action.</small>
        </div>
      </section>

      <section className="advisor-priority-section">
        <div className="results-header">
          <div>
            <span className="result-label">Priority issues</span>
            <h3>What needs attention today</h3>
          </div>
          <span className="tier-chip">{advisor.priorityIssues.length} ranked</span>
        </div>

        <div className="advisor-priority-grid">
          {advisor.priorityIssues.map((issue, index) => (
            <article className="advisor-priority-card" key={issue.id}>
              <div className="advisor-card-head">
                <span className="advisor-category-badge">{issue.category}</span>
                <span className={`sku-priority ${priorityClass(issue.severity)}`}>
                  {issue.severity}
                </span>
              </div>
              <h4>
                <span>{index + 1}.</span> {issue.title}
              </h4>

              <div className="advisor-priority-impact">
                <div>
                  <span>Financial impact</span>
                  <strong>{money(issue.financialImpact)}</strong>
                </div>
                <div>
                  <span>Recommended action</span>
                  <strong>{issue.recommendedAction}</strong>
                </div>
              </div>

              <div className="advisor-reason-block">
                <span className="result-label">Why this matters</span>
                <p>{issue.whyItMatters}</p>
              </div>

              <div className="advisor-evidence-grid">
                <div>
                  <span className="result-label">Evidence</span>
                  <ul>
                    {issue.evidence.slice(0, 5).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <span className="result-label">If ignored</span>
                  <ul>
                    {issue.ifIgnored.slice(0, 4).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="advisor-confidence-row">
                <div>
                  <span>Confidence</span>
                  <strong>{percent(issue.confidence)}</strong>
                </div>
                <p>{issue.confidenceSummary}</p>
              </div>

              <div className="advisor-card-actions">
                <Link className="button button-primary" href={issue.primaryActionHref}>
                  {issue.primaryActionLabel}
                </Link>
                <Link className="button button-secondary" href={issue.secondaryActionHref}>
                  {issue.secondaryActionLabel}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="advisor-goals-section">
        <div className="results-header">
          <div>
            <span className="result-label">Ask Auretix what you want to solve</span>
            <h3>Start with the business goal</h3>
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
