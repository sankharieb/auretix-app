"use client";

import Link from "next/link";
import { useState } from "react";
import {
  businessScales,
  businessTypes,
  buildNeedsRecommendation,
  customerNeeds,
  dataMaturityOptions,
  featureStatusLabels,
  pricingPlans,
  supportModes,
} from "../lib/product-catalog";

const defaultLead = {
  name: "",
  email: "",
  company: "",
  supportNeed: "Starter",
  problem: "",
};

const defaultAssessment = {
  businessType: "ecommerce",
  businessScale: "growth",
  primaryNeed: "reorder-timing",
  dataMaturity: "csv",
  supportMode: "guided",
};

function getSupportNeedFromPlan(planId) {
  if (planId === "operator") {
    return "Operator+";
  }

  if (planId === "growth") {
    return "Growth";
  }

  return "Starter";
}

export default function MarketingSite() {
  const [lead, setLead] = useState(defaultLead);
  const [assessment, setAssessment] = useState(defaultAssessment);
  const [formStatus, setFormStatus] = useState({
    type: "idle",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const recommendation = buildNeedsRecommendation(assessment);
  const selectedNeed = customerNeeds.find((need) => need.id === assessment.primaryNeed);

  function updateLeadField(event) {
    const { name, value } = event.target;
    setLead((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updateAssessmentField(event) {
    const { name, value } = event.target;
    setAssessment((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function applyRecommendedPlan() {
    const supportNeed = getSupportNeedFromPlan(recommendation.recommendedPlan.id);
    const needCopy = selectedNeed?.plainLanguage || "I need Auretix to assess my procurement and supply chain needs.";

    setLead((current) => ({
      ...current,
      supportNeed,
      problem:
        current.problem ||
        `${needCopy} Recommended package: ${recommendation.recommendedPlan.name}.`,
    }));
  }

  async function submitLead(event) {
    event.preventDefault();

    if (!lead.name.trim() || !lead.email.trim() || !lead.problem.trim()) {
      setFormStatus({
        type: "error",
        message: "Please fill in your name, email, and the problem you want Auretix to solve.",
      });
      return;
    }

    setIsSubmitting(true);
    setFormStatus({
      type: "idle",
      message: "",
    });

    try {
      const response = await fetch("/api/support-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...lead,
          channel: "website",
          engineSummary: "Website support request",
          recommendedTier: lead.supportNeed,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to save the request.");
      }

      setFormStatus({
        type: "success",
        message: `Support request saved for ${payload.lead.supportNeed}. Lead ID: ${payload.lead.id}`,
      });
      setLead(defaultLead);
    } catch (error) {
      setFormStatus({
        type: "error",
        message: error.message || "Something went wrong while saving the request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="site-shell">
      <header className="hero">
        <nav className="topbar">
          <div className="brand-lockup">
            <div className="brand-mark">A</div>
            <div>
              <div className="brand-name">Auretix</div>
              <div className="brand-subtitle">AI Brain for Procurement and Supply Chain</div>
            </div>
          </div>
          <div className="topbar-links">
            <Link className="topbar-link" href="/app">
              Open app
            </Link>
            <a className="topbar-link" href="#needs-and-pricing">
              Plans
            </a>
            <a className="topbar-link" href="#request-support">
              Request support
            </a>
          </div>
        </nav>

        <div className="hero-grid">
          <section className="hero-copy">
            <div className="eyebrow">Website + app on one domain</div>
            <h1>The AI engine for procurement and supply chain decisions.</h1>
            <p className="hero-text">
              Auretix helps businesses buy the right inventory, protect operational flow,
              and know the next move before procurement or supply chain problems get expensive.
            </p>

            <div className="hero-actions">
              <Link className="button button-primary" href="/app">
                Launch the app
              </Link>
              <a className="button button-secondary" href="#engine-structure">
                See the structure
              </a>
            </div>

            <div className="hero-points">
              <div>
                <span className="point-label">Website</span>
                <strong>Explain the value, capture demand, and build trust.</strong>
              </div>
              <div>
                <span className="point-label">App</span>
                <strong>Run the engine for procurement, supply chain, and decision support across business types.</strong>
              </div>
            </div>
          </section>

          <aside className="hero-panel">
            <div className="signal-card signal-card-primary">
              <div className="signal-header">
                <span>Platform direction</span>
                <span className="signal-badge">V1 live</span>
              </div>
              <div className="signal-value">1 engine</div>
              <p>
                One decision system, two operational layers, and one clear answer for what
                to do next.
              </p>
            </div>

            <div className="signal-card-grid">
              <div className="signal-card">
              <div className="mini-label">Procurement</div>
              <strong>What to buy and when</strong>
              <p>PO size, supplier risk, reorder timing, and cash-aware purchasing for real operations.</p>
            </div>
            <div className="signal-card">
              <div className="mini-label">Supply chain</div>
              <strong>What to protect and move</strong>
              <p>Stockout risk, service continuity, inventory flow, and operational response for small to large businesses.</p>
            </div>
          </div>
        </aside>
        </div>
      </header>

      <main>
        <section className="trust-strip">
          <div>Built for ecommerce, retail, wholesale, manufacturing, distribution, and growing brands.</div>
          <div>Designed to combine procurement intelligence with supply chain action for small to large operations.</div>
          <div>Focused on decisions, not just reporting.</div>
        </section>

        <section className="content-section capabilities-section">
          <div className="section-intro">
            <div className="eyebrow">Product model</div>
            <h2>Yes, we are building the engine too.</h2>
            <p>
              The current Auretix app is a real V1 rules-based engine. It already produces
              purchasing guidance, flow risk interpretation, and support-tier recommendations
              for different kinds of businesses. Over time, we can make it smarter with live
              data integrations, account memory, and model-driven forecasting.
            </p>
          </div>

          <div className="capability-grid">
            <article className="capability-card">
              <span className="capability-number">V1 engine</span>
              <h3>Decision logic now</h3>
              <p>
                Business inputs become risk scores, PO guidance, service warnings, and recommended actions.
              </p>
            </article>
            <article className="capability-card">
              <span className="capability-number">V2 engine</span>
              <h3>Data-connected later</h3>
              <p>
                Bring in seller accounts, supplier history, inbound data, and workflow memory.
              </p>
            </article>
            <article className="capability-card">
              <span className="capability-number">Long-term</span>
              <h3>Operational copilot</h3>
              <p>
                Move from recommendations into ongoing monitoring, alerts, and team-level decision support.
              </p>
            </article>
          </div>
        </section>

        <section className="content-section pillar-section">
          <div className="section-intro">
            <div className="eyebrow">5 core engine pillars</div>
            <h2>Auretix is being built to solve the five problems sellers fight every day.</h2>
            <p>
              These are not vague features. They are the operational headaches that keep
              cash trapped, sales exposed, and teams guessing. The engine should keep
              getting better at all five.
            </p>
          </div>

          <div className="pillar-grid">
            <article className="capability-card">
              <span className="capability-number">01</span>
              <h3>Stockout prevention</h3>
              <p>
                Predict when inventory is about to fail and surface the fastest move that
                protects revenue and continuity.
              </p>
            </article>
            <article className="capability-card">
              <span className="capability-number">02</span>
              <h3>Overbuying control</h3>
              <p>
                Stop businesses from tying up too much cash in inventory that will move too
                slowly or arrive at the wrong time.
              </p>
            </article>
            <article className="capability-card">
              <span className="capability-number">03</span>
              <h3>Reorder timing</h3>
              <p>
                Tell operators what to reorder, when to reorder it, and how aggressive the
                next PO should really be.
              </p>
            </article>
            <article className="capability-card">
              <span className="capability-number">04</span>
              <h3>Supplier uncertainty</h3>
              <p>
                Turn shaky supplier timing, reliability, and dependency risk into clear
                action before inbound plans break.
              </p>
            </article>
            <article className="capability-card">
              <span className="capability-number">05</span>
              <h3>Cash flow pressure</h3>
              <p>
                Help businesses make the smartest purchasing move possible when capital is
                limited and every buying decision matters.
              </p>
            </article>
          </div>
        </section>

        <section id="engine-structure" className="content-section architecture-section">
          <div className="section-intro">
            <div className="eyebrow">Engine structure</div>
            <h2>Dedicated procurement and supply chain layers, plus one combined decision layer.</h2>
          </div>

          <div className="pricing-grid">
            <article className="capability-card">
              <span className="capability-number">/app/procurement</span>
              <h3>Buy the right amount at the right time</h3>
              <p>
                Demand, lead times, supplier reliability, margin, and cash all feed one purchasing answer.
              </p>
            </article>
            <article className="capability-card">
              <span className="capability-number">/app/supply-chain</span>
              <h3>Protect fulfillment and inventory flow</h3>
              <p>
                Coverage, service risk, and operational stability turn into movement and response decisions.
              </p>
            </article>
            <article className="capability-card">
              <span className="capability-number">/app</span>
              <h3>See the unified answer</h3>
              <p>
                Procurement and supply chain combine into one next move, one urgency signal, and one support recommendation.
              </p>
            </article>
          </div>
        </section>

        <section id="needs-and-pricing" className="content-section">
          <div className="section-intro">
            <div className="eyebrow">Needs-based packaging</div>
            <h2>Customers should buy the part of Auretix that solves their actual operating pain.</h2>
            <p>
              Some businesses only need reorder clarity. Others need supplier control,
              purchase-order workflow, permissions, and ROI proof. The packages below
              keep Auretix sellable without forcing every customer into every feature.
            </p>
          </div>

          <div className="pricing-grid">
            {pricingPlans.map((plan) => (
              <article className="capability-card" key={plan.id}>
                <span className="capability-number">{plan.badge}</span>
                <h3>{plan.name}</h3>
                <div className="result-value">{plan.priceRange}</div>
                <p>{plan.bestFor}</p>
                <div className="result-meta">{plan.setupRange}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="content-section">
          <div className="section-intro">
            <div className="eyebrow">Customer fit</div>
            <h2>Quickly assess the customer, then offer the right plan.</h2>
            <p>
              This is the first version of the needs assessment. It gives sales and
              onboarding a simple way to match business type, data maturity, and support
              level to a realistic Auretix package.
            </p>
          </div>

          <div className="form-grid">
            <div className="lab-card lead-form-card">
              <h3>Needs assessment</h3>

              <label htmlFor="assessment-businessType">Business type</label>
              <select
                id="assessment-businessType"
                name="businessType"
                onChange={updateAssessmentField}
                value={assessment.businessType}
              >
                {businessTypes.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>

              <label htmlFor="assessment-businessScale">Business scale</label>
              <select
                id="assessment-businessScale"
                name="businessScale"
                onChange={updateAssessmentField}
                value={assessment.businessScale}
              >
                {businessScales.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>

              <label htmlFor="assessment-primaryNeed">Primary pain</label>
              <select
                id="assessment-primaryNeed"
                name="primaryNeed"
                onChange={updateAssessmentField}
                value={assessment.primaryNeed}
              >
                {customerNeeds.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>

              <label htmlFor="assessment-dataMaturity">Data readiness</label>
              <select
                id="assessment-dataMaturity"
                name="dataMaturity"
                onChange={updateAssessmentField}
                value={assessment.dataMaturity}
              >
                {dataMaturityOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>

              <label htmlFor="assessment-supportMode">Support mode</label>
              <select
                id="assessment-supportMode"
                name="supportMode"
                onChange={updateAssessmentField}
                value={assessment.supportMode}
              >
                {supportModes.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>

              <div className="button-row">
                <a className="button button-secondary" href="#request-support" onClick={applyRecommendedPlan}>
                  Use this plan
                </a>
              </div>
            </div>

            <div className="lab-card form-intro-card">
              <div className="result-label">Recommended package</div>
              <div className="result-value">{recommendation.recommendedPlan.name}</div>
              <div className="result-copy">
                {recommendation.recommendedPlan.priceRange} plus {recommendation.recommendedPlan.setupRange}.
              </div>

              <div className="mini-points">
                {recommendation.reasons.map((reason) => (
                  <div key={reason}>{reason}</div>
                ))}
              </div>

              <div className="engine-pillars-card">
                <div className="result-label">Features to test for this customer</div>
                <div className="action-stack">
                  {recommendation.recommendedFeatures.map((feature) => (
                    <div className="result-block" key={feature.id}>
                      <div className="result-label">
                        {featureStatusLabels[feature.status] || feature.status}
                      </div>
                      <div className="result-value">{feature.name}</div>
                      <div className="result-meta">{feature.testCase}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="content-section product-surface-section">
          <div className="closing-card">
            <div>
              <div className="eyebrow">Product routes</div>
              <h2>Marketing site on `/`, working engine on `/app`.</h2>
              <p>
                This keeps the public experience clean while giving Auretix a real product surface we can keep expanding.
              </p>
            </div>
            <Link className="button button-primary" href="/app">
              Open the engine
            </Link>
          </div>
        </section>

        <section id="request-support" className="content-section form-section">
          <div className="section-intro">
            <div className="eyebrow">Request support</div>
            <h2>Capture website visitors who want help now.</h2>
            <p>
              This form is connected to the backend and stores leads so Auretix can follow up with the right offer.
            </p>
          </div>

          <div className="form-grid">
            <div className="lab-card form-intro-card">
              <div className="result-label">What happens here</div>
              <div className="result-value">Website visitors become qualified leads.</div>
              <div className="result-copy">
                Use this for operators who understand the value quickly and want direct help
                before logging into the app.
              </div>
            </div>

            <form className="lab-card lead-form-card" onSubmit={submitLead}>
              <h3>Get Auretix support</h3>

              <label htmlFor="name">Full name</label>
              <input id="name" name="name" onChange={updateLeadField} type="text" value={lead.name} />

              <label htmlFor="email">Work email</label>
              <input id="email" name="email" onChange={updateLeadField} type="email" value={lead.email} />

              <label htmlFor="company">Brand or company</label>
              <input id="company" name="company" onChange={updateLeadField} type="text" value={lead.company} />

              <label htmlFor="supportNeed">Support tier</label>
              <select id="supportNeed" name="supportNeed" onChange={updateLeadField} value={lead.supportNeed}>
                <option value="Starter">Starter</option>
                <option value="Growth">Growth</option>
                <option value="Operator+">Operator+</option>
              </select>

              <label htmlFor="problem">What do you need help with?</label>
              <textarea
                id="problem"
                name="problem"
                onChange={updateLeadField}
                rows="5"
                value={lead.problem}
              />

              <div className="button-row">
                <button className="button button-primary" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Saving request..." : "Request support"}
                </button>
              </div>

              {formStatus.message ? (
                <div className={`form-status ${formStatus.type}`}>{formStatus.message}</div>
              ) : null}
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
