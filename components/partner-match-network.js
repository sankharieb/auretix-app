"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getScoredSkus,
  integer,
  money,
  sampleSkuCsv,
} from "../lib/sku-risk-model";

const storageKey = "auretix-partner-match-requests-v1";

const partnerTypes = [
  {
    id: "freight",
    label: "Need freight quote",
    service: "Freight quote",
    revenueModel: "Seller-approved referral or service fee",
    shareSummary: "SKU, stockout window, inbound ETA, origin/destination once supplied, and urgency.",
  },
  {
    id: "backup-supplier",
    label: "Need backup supplier",
    service: "Backup supplier",
    revenueModel: "Supplier referral fee or matched sourcing fee",
    shareSummary: "SKU category, target volume, reliability issue, lead-time need, and quality notes.",
  },
  {
    id: "wholesale",
    label: "Need wholesale source",
    service: "Wholesale source",
    revenueModel: "Supplier referral fee, sourcing fee, or negotiated margin",
    shareSummary: "Category, quantity target, unit economics, buying budget, and desired delivery window.",
  },
  {
    id: "third-party-logistics",
    label: "Need 3PL support",
    service: "3PL support",
    revenueModel: "3PL referral fee or onboarding service fee",
    shareSummary: "Channel mix, inventory imbalance, fulfillment pressure, and service-level issue.",
  },
];

function sortByRisk(a, b) {
  return b.estimatedValue - a.estimatedValue || a.daysToAct - b.daysToAct;
}

function buildNetworkOpportunities(rows) {
  const opportunities = [];
  const freightSkus = rows.filter(
    (item) => item.serviceGapDays > 0 || item.inboundDelayRisk >= 35,
  );
  const supplierSkus = rows.filter((item) => item.supplierReliability < 75);
  const wholesaleSkus = rows.filter((item) => item.recommendedPo > 0);
  const logisticsSkus = rows.filter(
    (item) =>
      item.locationIssue !== "No location break" ||
      item.channelAvailability !== "Channels covered",
  );

  if (freightSkus.length) {
    const top = freightSkus.sort((a, b) => b.revenueAtRisk - a.revenueAtRisk)[0];
    opportunities.push({
      ...partnerTypes[0],
      sku: top.sku,
      product: top.name,
      problem: `${top.daysOfCover.toFixed(1)} days cover, inbound ETA ${top.inboundEtaDate}`,
      recommendedPartnerBrief: "Find forwarders who can quote expedite or alternate lane options before stockout.",
      estimatedValue: Math.max(top.revenueAtRisk, top.proofValue),
      deadline: top.stockoutDate,
      daysToAct: top.daysOfCover,
      riskReason: top.channelAvailability,
      dataPreview: [
        `SKU: ${top.sku}`,
        `Product: ${top.name}`,
        `Days of cover: ${top.daysOfCover.toFixed(1)}`,
        `Inbound ETA: ${top.inboundEtaDate}`,
        `Revenue at risk: ${money(top.revenueAtRisk)}`,
      ],
    });
  }

  if (supplierSkus.length) {
    const top = supplierSkus.sort((a, b) => a.supplierReliability - b.supplierReliability)[0];
    opportunities.push({
      ...partnerTypes[1],
      sku: top.sku,
      product: top.name,
      problem: `${top.supplierReliability}% supplier reliability with ${top.inboundDelayDays} delay days`,
      recommendedPartnerBrief: "Match backup suppliers who can support this SKU category and lead-time window.",
      estimatedValue: Math.max(top.revenueAtRisk, top.cashRequired * 0.2),
      deadline: top.inboundEtaDate,
      daysToAct: Math.max(1, top.daysOfCover),
      riskReason: "Supplier reliability is below pilot threshold.",
      dataPreview: [
        `SKU: ${top.sku}`,
        `Category: ${top.category}`,
        `Monthly sales: ${integer(top.monthlySales)}`,
        `Target PO: ${integer(top.recommendedPo)} units`,
        `Supplier reliability: ${top.supplierReliability}%`,
      ],
    });
  }

  if (wholesaleSkus.length) {
    const top = wholesaleSkus.sort((a, b) => b.recommendedPo - a.recommendedPo)[0];
    opportunities.push({
      ...partnerTypes[2],
      sku: top.sku,
      product: top.name,
      problem: `${integer(top.recommendedPo)} units recommended, ${money(top.cashRequired)} cash required`,
      recommendedPartnerBrief: "Find wholesale or sourcing options that fit the buy quantity, margin, and delivery window.",
      estimatedValue: Math.max(top.revenueAtRisk, top.cashRequired),
      deadline: "Before next PO approval",
      daysToAct: Math.max(1, top.daysOfCover),
      riskReason: `${top.marginPct.toFixed(0)}% gross margin needs a cash-aware source.`,
      dataPreview: [
        `SKU: ${top.sku}`,
        `Recommended buy: ${integer(top.recommendedPo)} units`,
        `Estimated cash required: ${money(top.cashRequired)}`,
        `Unit cost: ${money(top.unitCost)}`,
        `Unit price: ${money(top.unitPrice)}`,
      ],
    });
  }

  if (logisticsSkus.length) {
    const top = logisticsSkus.sort(
      (a, b) => b.locationImbalancePct - a.locationImbalancePct,
    )[0];
    opportunities.push({
      ...partnerTypes[3],
      sku: top.sku,
      product: top.name,
      problem: `${top.locationIssue}; ${top.channelAvailability.toLowerCase()}`,
      recommendedPartnerBrief: "Match 3PL or fulfillment support for transfer, channel availability, or location balancing.",
      estimatedValue: Math.max(top.revenueAtRisk, top.proofValue * 0.7),
      deadline: top.stockoutDate,
      daysToAct: Math.max(1, top.daysOfCover),
      riskReason: `${top.locationImbalancePct.toFixed(0)}% location imbalance.`,
      dataPreview: [
        `SKU: ${top.sku}`,
        `Amazon cover: ${top.amazonCoverDays.toFixed(1)} days`,
        `Shopify cover: ${top.shopifyCoverDays.toFixed(1)} days`,
        `Location issue: ${top.locationIssue}`,
        `Recommended move: ${top.recommendedMove}`,
      ],
    });
  }

  return opportunities.sort(sortByRisk);
}

function createEmptyConsent() {
  return {
    shareApproved: false,
    feeAcknowledged: false,
    humanReview: false,
  };
}

export default function PartnerMatchNetwork() {
  const [selectedType, setSelectedType] = useState("freight");
  const [requestNotes, setRequestNotes] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [consent, setConsent] = useState(createEmptyConsent);
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);

  const { rows } = useMemo(() => getScoredSkus(sampleSkuCsv, 25000), []);
  const opportunities = useMemo(() => buildNetworkOpportunities(rows), [rows]);
  const selectedOpportunity =
    opportunities.find((item) => item.id === selectedType) || opportunities[0];
  const totalMatchValue = opportunities.reduce((sum, item) => sum + item.estimatedValue, 0);
  const pendingRequests = requests.filter((request) => request.status === "Pending match").length;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);

      if (saved) {
        setRequests(JSON.parse(saved));
      }
    } catch {
      setRequests([]);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(requests));
  }, [isHydrated, requests]);

  function updateConsent(key, checked) {
    setConsent((current) => ({
      ...current,
      [key]: checked,
    }));
  }

  function requestPartnerMatch() {
    if (!selectedOpportunity) {
      setMessage("No partner opportunity is selected.");
      return;
    }

    if (!contactEmail.trim()) {
      setMessage("Add a seller contact email before requesting a match.");
      return;
    }

    if (!consent.shareApproved || !consent.feeAcknowledged || !consent.humanReview) {
      setMessage("Confirm data sharing, fee disclosure, and human approval before requesting a partner match.");
      return;
    }

    const nextRequest = {
      id: `${selectedOpportunity.id}-${Date.now()}`,
      service: selectedOpportunity.service,
      sku: selectedOpportunity.sku,
      product: selectedOpportunity.product,
      estimatedValue: selectedOpportunity.estimatedValue,
      contactEmail: contactEmail.trim(),
      notes: requestNotes.trim(),
      status: "Pending match",
      createdAt: new Date().toLocaleString(),
      disclosure:
        "Seller approved sharing the listed risk summary and acknowledged Auretix may receive a referral or service fee.",
    };

    setRequests((current) => [nextRequest, ...current]);
    setMessage(
      `${selectedOpportunity.service} request logged for ${selectedOpportunity.sku}. No partner data is shared until the seller approves the next step.`,
    );
    setRequestNotes("");
    setConsent(createEmptyConsent());
  }

  function updateRequestStatus(requestId, status) {
    setRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status,
            }
          : request,
      ),
    );
  }

  return (
    <div className="app-shell partner-network-shell seller-risk-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Auretix Network</div>
          <h1>Route seller risk to the right partner at the right time.</h1>
          <p className="hero-text">
            Auretix can become more than software: when a SKU risk needs freight,
            supplier, wholesale, or 3PL help, the seller can request a vetted partner
            match with consent and fee disclosure built in.
          </p>
        </div>
        <nav className="app-nav">
          <Link href="/app">Rescue board</Link>
          <Link href="/app/network">Network</Link>
          <Link href="/app/sku-risk">SKU risk</Link>
          <Link href="/app/procurement">Procurement</Link>
          <Link href="/app/supply-chain">Supply chain</Link>
          <Link href="/app/readiness">Readiness</Link>
          <Link href="/app/data-readiness">Data readiness</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <section className="seller-risk-metric-grid">
        <div className="result-block">
          <div className="result-label">Partner opportunities</div>
          <div className="result-value">{opportunities.length}</div>
          <div className="result-meta">Risk-driven partner needs found in the demo SKU data.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Seller value exposed</div>
          <div className="result-value">{money(totalMatchValue)}</div>
          <div className="result-meta">Potential revenue, cash, or service risk tied to partner requests.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Pending matches</div>
          <div className="result-value">{pendingRequests}</div>
          <div className="result-meta">Requests waiting for founder-led partner outreach.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Disclosure stance</div>
          <div className="result-value">Consent first</div>
          <div className="result-meta">Seller approves shared data and any Auretix fee model.</div>
        </div>
      </section>

      <section className="partner-opportunity-strip">
        {opportunities.map((opportunity) => (
          <button
            className={`partner-opportunity-card ${
              selectedOpportunity?.id === opportunity.id ? "active" : ""
            }`}
            key={opportunity.id}
            onClick={() => {
              setSelectedType(opportunity.id);
              setMessage("");
            }}
            type="button"
          >
            <span className="result-label">{opportunity.label}</span>
            <strong>{opportunity.sku}</strong>
            <small>{opportunity.problem}</small>
            <em>{money(opportunity.estimatedValue)} exposed</em>
          </button>
        ))}
      </section>

      <section className="partner-network-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Request matched partner</h3>
            <span className="tier-chip">{selectedOpportunity?.service}</span>
          </div>

          {selectedOpportunity ? (
            <>
              <div className="partner-selected-summary">
                <div>
                  <span className="result-label">Seller risk trigger</span>
                  <h4>{selectedOpportunity.problem}</h4>
                  <p>{selectedOpportunity.recommendedPartnerBrief}</p>
                </div>
                <div className="partner-value-box">
                  <strong>{money(selectedOpportunity.estimatedValue)}</strong>
                  <span>value exposed</span>
                </div>
              </div>

              <div className="partner-data-preview">
                <div className="result-label">Data seller is approving to share</div>
                {selectedOpportunity.dataPreview.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>

              <label className="seller-risk-field">
                Seller contact email
                <input
                  inputMode="email"
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="operator@example.com"
                  type="text"
                  value={contactEmail}
                />
              </label>

              <label className="seller-risk-field">
                Partner request notes
                <textarea
                  onChange={(event) => setRequestNotes(event.target.value)}
                  placeholder="Add lane, target delivery window, supplier constraints, product category, or preferred partner requirements."
                  rows="5"
                  value={requestNotes}
                />
              </label>

              <div className="partner-disclosure-box">
                <h4>Consent and fee disclosure</h4>
                <label>
                  <input
                    checked={consent.shareApproved}
                    onChange={(event) => updateConsent("shareApproved", event.target.checked)}
                    type="checkbox"
                  />
                  Seller approves sharing the listed risk summary with matched partner candidates.
                </label>
                <label>
                  <input
                    checked={consent.feeAcknowledged}
                    onChange={(event) => updateConsent("feeAcknowledged", event.target.checked)}
                    type="checkbox"
                  />
                  Seller understands Auretix may receive a disclosed referral, service, or success fee.
                </label>
                <label>
                  <input
                    checked={consent.humanReview}
                    onChange={(event) => updateConsent("humanReview", event.target.checked)}
                    type="checkbox"
                  />
                  Seller will review and approve any quote, vendor, or partner agreement before action.
                </label>
              </div>

              <button className="button button-primary" onClick={requestPartnerMatch} type="button">
                Request matched partner
              </button>
            </>
          ) : (
            <p className="result-meta">No partner opportunities found in the current SKU data.</p>
          )}
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Network model</h3>
            <span className="tier-chip">Referral marketplace</span>
          </div>
          <div className="partner-model-list">
            {partnerTypes.map((type) => (
              <div key={type.id}>
                <strong>{type.label}</strong>
                <span>{type.revenueModel}</span>
                <small>{type.shareSummary}</small>
              </div>
            ))}
          </div>
          <div className="partner-guardrail-card">
            <div className="result-label">Trust guardrail</div>
            <p>
              Auretix should start as a referral marketplace. It should not secretly sell
              seller data or arrange regulated freight services without proper approvals,
              disclosures, and operating authority where required.
            </p>
          </div>
        </div>
      </section>

      {message ? <div className="flow-run-result partner-run-result">{message}</div> : null}

      <section className="lab-card partner-request-card">
        <div className="results-header">
          <h3>Partner request queue</h3>
          <span className="tier-chip">{requests.length} logged</span>
        </div>

        {requests.length ? (
          <div className="partner-request-table">
            <div className="partner-request-row partner-request-header">
              <span>Request</span>
              <span>SKU</span>
              <span>Value exposed</span>
              <span>Seller contact</span>
              <span>Status</span>
              <span>Disclosure</span>
            </div>
            {requests.map((request) => (
              <div className="partner-request-row partner-request-item" key={request.id}>
                <span>
                  <strong>{request.service}</strong>
                  <small>{request.createdAt}</small>
                </span>
                <span>
                  {request.sku}
                  <small>{request.product}</small>
                </span>
                <span>{money(request.estimatedValue)}</span>
                <span>{request.contactEmail}</span>
                <span className="partner-status-actions">
                  <strong>{request.status}</strong>
                  <button onClick={() => updateRequestStatus(request.id, "Contacted partner")} type="button">
                    Contacted
                  </button>
                  <button onClick={() => updateRequestStatus(request.id, "Introduced")} type="button">
                    Introduced
                  </button>
                  <button onClick={() => updateRequestStatus(request.id, "Closed")} type="button">
                    Closed
                  </button>
                </span>
                <span>{request.disclosure}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="result-meta">
            No partner requests yet. Use the request form to log a consent-based partner match.
          </p>
        )}
      </section>
    </div>
  );
}
