import Link from "next/link";

const differenceCards = [
  {
    title: "Every number has evidence.",
    copy: "No black-box AI. Every conclusion traces back to business data, assumptions, and supporting records.",
  },
  {
    title: "Business Memory",
    copy: "Auretix remembers outcomes, not conversations. Every business decision becomes institutional knowledge.",
  },
  {
    title: "One Business Briefing",
    copy: "Instead of multiple dashboards, receive one prioritized briefing ranked by financial impact.",
  },
  {
    title: "Built for Operators",
    copy: "Procurement, supply chain, operations, finance, and leadership see the same operating truth.",
  },
];

const architectureSteps = [
  "Business Data",
  "Profit Engine",
  "Evidence Engine",
  "Memory Engine",
  "Business Briefing",
  "Decision",
  "Business Outcome",
];

const userGroups = [
  {
    title: "Procurement Leaders",
    copy: "Understand what changed before purchase orders consume cash.",
  },
  {
    title: "Supply Chain Leaders",
    copy: "See where flow, coverage, or inbound timing may break.",
  },
  {
    title: "Operations",
    copy: "Turn daily noise into a small set of issues worth reviewing.",
  },
  {
    title: "Finance",
    copy: "Trace projected exposure, margin impact, and cash pressure.",
  },
  {
    title: "Executive Leadership",
    copy: "Start the day with the business already reviewed.",
  },
];

function AdvisorPreview() {
  return (
    <aside className="landing-advisor-preview" aria-label="Advisor Briefing preview">
      <div className="landing-preview-header">
        <div>
          <span className="result-label">Advisor briefing</span>
          <h2>Good morning, Michel.</h2>
        </div>
        <span className="signal-badge">Live briefing</span>
      </div>

      <div className="landing-preview-copy">
        <p>I've reviewed everything that changed since your last briefing.</p>
        <p>Three developments deserve your attention.</p>
      </div>

      <div className="landing-preview-risk">
        <div>
          <span className="point-label">Stockout Risk</span>
          <strong>Projected revenue exposure</strong>
        </div>
        <div className="landing-preview-impact">$232,450</div>
      </div>

      <div className="landing-preview-metrics">
        <div>
          <span>Confidence</span>
          <strong>92%</strong>
        </div>
        <div>
          <span>Supplier</span>
          <strong>Review</strong>
        </div>
        <div>
          <span>Cash</span>
          <strong>Watch</strong>
        </div>
        <div>
          <span>Learning</span>
          <strong>Strong</strong>
        </div>
      </div>

      <div className="landing-preview-evidence">
        <span>Why it matters</span>
        <p>
          Current inventory coverage is tightening before inbound replenishment arrives.
          Auretix surfaces the exposure, confidence, and evidence so the operator can decide.
        </p>
      </div>
    </aside>
  );
}

export default function MarketingSite() {
  return (
    <div className="site-shell landing-shell">
      <header className="landing-hero">
        <nav className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark">A</div>
            <div>
              <div className="brand-name">Auretix</div>
              <div className="brand-subtitle">AI Business Operating System</div>
            </div>
          </div>
          <div className="topbar-links">
            <Link className="topbar-link" href="/app">
              Launch Auretix
            </Link>
            <a className="topbar-link" href="#how-it-works">
              How it works
            </a>
            <a className="topbar-link" href="mailto:hello@auretix.ai?subject=Request%20an%20Auretix%20Demo">
              Request a demo
            </a>
          </div>
        </nav>

        <div className="landing-hero-grid">
          <section className="landing-hero-copy">
            <h1>Your business has already been reviewed.</h1>
            <p className="hero-text">
              Auretix continuously watches procurement, inventory, suppliers, cash flow,
              and operational decisions.
            </p>
            <p className="hero-text">
              Instead of overwhelming you with dashboards, it delivers one calm business
              briefing showing what changed, why it matters, and the financial impact
              behind every insight.
            </p>

            <div className="hero-actions">
              <Link className="button button-primary" href="/app">
                Experience Your First Briefing
              </Link>
              <a className="button button-secondary" href="#how-it-works">
                See How It Works
              </a>
            </div>
          </section>

          <AdvisorPreview />
        </div>
      </header>

      <main>
        <section className="landing-statement">
          <p>Auretix continuously reviews your business before you do.</p>
          <div className="landing-statement-grid">
            <span>What changed</span>
            <span>Why it matters</span>
            <span>Financial impact</span>
            <span>Supporting evidence</span>
          </div>
        </section>

        <section className="content-section landing-difference-section">
          <div className="section-intro">
            <div className="eyebrow">Why Auretix is different</div>
            <h2>Every briefing is prioritized by business impact.</h2>
            <p>
              Every conclusion is explainable. Every number is traceable. The point is
              not more charts. The point is knowing what deserves attention.
            </p>
          </div>

          <div className="landing-card-grid">
            {differenceCards.map((card) => (
              <article className="landing-glass-card" key={card.title}>
                <h3>{card.title}</h3>
                <p>{card.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="content-section landing-architecture-section">
          <div className="section-intro">
            <div className="eyebrow">How Auretix works</div>
            <h2>A calm briefing built from operating truth.</h2>
            <p>
              Auretix connects the path from business data to decisions and outcomes
              without hiding the evidence behind the conclusion.
            </p>
          </div>

          <div className="landing-architecture-flow" aria-label="Auretix architecture">
            {architectureSteps.map((step, index) => (
              <div className="landing-architecture-step" key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="content-section landing-philosophy-section">
          <div className="landing-philosophy-card">
            <div>
              <div className="eyebrow">Our philosophy</div>
              <h2>AI shouldn't replace judgment.</h2>
            </div>
            <div>
              <p>
                Auretix explains every conclusion. Shows confidence. Shows evidence.
                Shows financial impact. Then lets people decide.
              </p>
              <strong>Auretix informs. You decide.</strong>
            </div>
          </div>
        </section>

        <section className="content-section landing-users-section">
          <div className="section-intro">
            <div className="eyebrow">Who uses Auretix</div>
            <h2>For teams responsible for the operating day.</h2>
          </div>

          <div className="landing-user-grid">
            {userGroups.map((group) => (
              <article className="landing-user-card" key={group.title}>
                <h3>{group.title}</h3>
                <p>{group.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="content-section landing-final-section">
          <div className="landing-final-card">
            <div>
              <div className="eyebrow">Start with the briefing</div>
              <h2>Experience your first business briefing.</h2>
              <p>See how Auretix reviews your business before you start your day.</p>
            </div>
            <div className="hero-actions">
              <Link className="button button-primary" href="/app">
                Launch Auretix
              </Link>
              <a className="button button-secondary" href="mailto:hello@auretix.ai?subject=Request%20an%20Auretix%20Demo">
                Request a Demo
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
