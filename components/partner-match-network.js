"use client";

import { useEffect, useMemo, useState } from "react";
import AppNavigation from "./app-navigation";
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

const fallbackPartnerDirectory = [
  {
    id: "preview_freight_expedite",
    partnerType: "freight",
    name: "Expedite lane partner",
    coverage: "Port, warehouse, and parcel expedite quotes",
    fitSummary: "Best when a high-value SKU has low cover and inbound ETA risk.",
    contactMethod: "Founder-introduced quote request",
    status: "candidate",
    disclosure:
      "Auretix may receive a disclosed referral or service fee only after seller approval.",
  },
  {
    id: "preview_supplier_backup",
    partnerType: "backup-supplier",
    name: "Backup supplier scout",
    coverage: "Supplier sourcing, backup factory search, and category fit checks",
    fitSummary: "Best when supplier reliability or lead time threatens an active SKU.",
    contactMethod: "Founder-led supplier introduction",
    status: "candidate",
    disclosure:
      "Auretix may receive a disclosed supplier referral or sourcing fee only after seller approval.",
  },
  {
    id: "preview_wholesale_source",
    partnerType: "wholesale",
    name: "Wholesale source desk",
    coverage: "Wholesale lots, MOQ fit, category sourcing, and margin review",
    fitSummary: "Best when Auretix recommends a buy but the seller needs a better source.",
    contactMethod: "Founder-screened wholesale lead",
    status: "candidate",
    disclosure:
      "Auretix may receive a disclosed sourcing fee, referral fee, or negotiated margin only after seller approval.",
  },
  {
    id: "preview_3pl_flow",
    partnerType: "third-party-logistics",
    name: "3PL flow support",
    coverage: "Inventory transfer, channel availability, and fulfillment-node support",
    fitSummary: "Best when stock is in the wrong place or channels are at risk.",
    contactMethod: "Founder-introduced 3PL fit check",
    status: "candidate",
    disclosure:
      "Auretix may receive a disclosed 3PL referral or onboarding fee only after seller approval.",
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

function loadLocalRequests() {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveLocalRequests(requests) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(requests));
  } catch {
    // Preview storage is best-effort only.
  }
}

function getPartnerTypeForRequest(request) {
  if (request.partnerType) {
    return request.partnerType;
  }

  return partnerTypes.find((type) => type.service === request.service)?.id || "freight";
}

function formatCreatedAt(value) {
  if (!value) {
    return "Not yet";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function PartnerMatchNetwork() {
  const [selectedType, setSelectedType] = useState("freight");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [requestNotes, setRequestNotes] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [consent, setConsent] = useState(createEmptyConsent);
  const [requests, setRequests] = useState([]);
  const [partnerDirectory, setPartnerDirectory] = useState(fallbackPartnerDirectory);
  const [networkSource, setNetworkSource] = useState("loading");
  const [workspaceId, setWorkspaceId] = useState("workspace_demo");
  const [message, setMessage] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { rows } = useMemo(() => getScoredSkus(sampleSkuCsv, 25000), []);
  const opportunities = useMemo(() => buildNetworkOpportunities(rows), [rows]);
  const selectedOpportunity =
    opportunities.find((item) => item.id === selectedType) || opportunities[0];
  const candidatePartners = useMemo(
    () =>
      partnerDirectory.filter(
        (partner) => partner.partnerType === (selectedOpportunity?.id || selectedType),
      ),
    [partnerDirectory, selectedOpportunity?.id, selectedType],
  );
  const selectedPartner =
    candidatePartners.find((partner) => partner.id === selectedPartnerId) ||
    candidatePartners[0] ||
    null;
  const totalMatchValue = opportunities.reduce((sum, item) => sum + item.estimatedValue, 0);
  const pendingRequests = requests.filter((request) => request.status === "Pending match").length;
  const matchedRequests = requests.filter(
    (request) => request.status === "Matched partner sent",
  ).length;
  const networkSourceLabel =
    networkSource === "supabase"
      ? "Supabase + audit"
      : networkSource === "json"
        ? "Server JSON fallback"
        : networkSource === "preview"
          ? "Preview local queue"
          : "Loading";

  useEffect(() => {
    let isActive = true;

    async function loadPartnerNetwork() {
      try {
        const response = await fetch("/api/partner-network?workspaceId=workspace_demo");

        if (!response.ok) {
          throw new Error("Partner network API is not available in preview mode.");
        }

        const data = await response.json();

        if (!isActive) {
          return;
        }

        setWorkspaceId(data.workspaceId || "workspace_demo");
        setPartnerDirectory(data.partners?.length ? data.partners : fallbackPartnerDirectory);
        setRequests(data.requests || []);
        setNetworkSource(data.source || "supabase");
      } catch {
        if (!isActive) {
          return;
        }

        setPartnerDirectory(fallbackPartnerDirectory);
        setRequests(loadLocalRequests());
        setNetworkSource("preview");
      } finally {
        if (isActive) {
          setIsHydrated(true);
        }
      }
    }

    loadPartnerNetwork();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!candidatePartners.length) {
      setSelectedPartnerId("");
      return;
    }

    if (!candidatePartners.some((partner) => partner.id === selectedPartnerId)) {
      setSelectedPartnerId(candidatePartners[0].id);
    }
  }, [candidatePartners, selectedPartnerId]);

  useEffect(() => {
    if (!isHydrated || networkSource !== "preview") {
      return;
    }

    saveLocalRequests(requests);
  }, [isHydrated, networkSource, requests]);

  function updateConsent(key, checked) {
    setConsent((current) => ({
      ...current,
      [key]: checked,
    }));
  }

  function buildLocalRequest() {
    return {
      id: `${selectedOpportunity.id}-${Date.now()}`,
      workspaceId,
      partnerType: selectedOpportunity.id,
      service: selectedOpportunity.service,
      sku: selectedOpportunity.sku,
      product: selectedOpportunity.product,
      problem: selectedOpportunity.problem,
      estimatedValue: selectedOpportunity.estimatedValue,
      deadline: selectedOpportunity.deadline,
      dataPreview: selectedOpportunity.dataPreview,
      selectedPartnerId: selectedPartner?.id || null,
      matchedPartnerSnapshot: null,
      contactEmail: contactEmail.trim(),
      notes: requestNotes.trim(),
      status: "Pending match",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      disclosure:
        "Seller approved sharing the listed risk summary and acknowledged Auretix may receive a referral or service fee.",
    };
  }

  async function requestPartnerMatch() {
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

    const payload = {
      workspaceId,
      partnerType: selectedOpportunity.id,
      service: selectedOpportunity.service,
      sku: selectedOpportunity.sku,
      product: selectedOpportunity.product,
      problem: selectedOpportunity.problem,
      estimatedValue: selectedOpportunity.estimatedValue,
      deadline: selectedOpportunity.deadline,
      dataPreview: selectedOpportunity.dataPreview,
      selectedPartnerId: selectedPartner?.id || null,
      contactEmail: contactEmail.trim(),
      notes: requestNotes.trim(),
      consent,
    };

    setIsSaving(true);

    try {
      if (networkSource !== "preview") {
        const response = await fetch("/api/partner-network", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Partner request could not be saved to the server.");
        }

        const data = await response.json();
        setRequests((current) => [data.partnerRequest, ...current]);
        setMessage(
          `${selectedOpportunity.service} request saved with audit trail for ${selectedOpportunity.sku}. No partner data is shared until the seller approves the next step.`,
        );
      } else {
        const nextRequest = buildLocalRequest();
        setRequests((current) => [nextRequest, ...current]);
        setMessage(
          `${selectedOpportunity.service} request logged in preview mode for ${selectedOpportunity.sku}. Sign in after Supabase schema is updated to save this with audit history.`,
        );
      }

      setRequestNotes("");
      setConsent(createEmptyConsent());
    } catch (error) {
      const nextRequest = buildLocalRequest();
      setRequests((current) => [nextRequest, ...current]);
      setNetworkSource("preview");
      setMessage(
        `${selectedOpportunity.service} request logged locally because the server queue is not ready yet. Run the updated Supabase schema before relying on persisted partner matches.`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  function patchLocalRequest(requestId, status, partner = null) {
    setRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status,
              selectedPartnerId: partner?.id || request.selectedPartnerId || null,
              matchedPartnerSnapshot:
                status === "Matched partner sent" && partner
                  ? {
                      id: partner.id,
                      name: partner.name,
                      partnerType: partner.partnerType,
                      coverage: partner.coverage,
                      disclosure: partner.disclosure,
                      sentAt: new Date().toISOString(),
                    }
                  : request.matchedPartnerSnapshot || null,
              updatedAt: new Date().toISOString(),
            }
          : request,
      ),
    );
  }

  function findPartnerForRequest(request) {
    const requestPartnerType = getPartnerTypeForRequest(request);

    return (
      partnerDirectory.find((partner) => partner.id === request.selectedPartnerId) ||
      partnerDirectory.find((partner) => partner.partnerType === requestPartnerType) ||
      null
    );
  }

  async function updateRequestStatus(requestId, status, partnerId = null) {
    const request = requests.find((entry) => entry.id === requestId);
    const partner =
      partnerDirectory.find((entry) => entry.id === partnerId) ||
      (request ? findPartnerForRequest(request) : null);

    setIsSaving(true);

    try {
      if (networkSource !== "preview") {
        const response = await fetch("/api/partner-network", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            workspaceId,
            requestId,
            status,
            partnerId: partner?.id || null,
          }),
        });

        if (!response.ok) {
          throw new Error("Partner request status could not be saved.");
        }

        const data = await response.json();
        setRequests((current) =>
          current.map((entry) => (entry.id === requestId ? data.partnerRequest : entry)),
        );
        setMessage(
          status === "Matched partner sent"
            ? `Matched partner sent for ${data.partnerRequest.sku}; audit trail updated.`
            : `Partner request updated to ${status}.`,
        );
      } else {
        patchLocalRequest(requestId, status, partner);
        setMessage(
          status === "Matched partner sent"
            ? "Matched partner marked as sent in preview mode."
            : `Partner request updated to ${status} in preview mode.`,
        );
      }
    } catch {
      patchLocalRequest(requestId, status, partner);
      setNetworkSource("preview");
      setMessage("Status updated locally because the persisted partner queue is not ready.");
    } finally {
      setIsSaving(false);
    }
  }

  function sendMatchedPartner(request) {
    const partner = findPartnerForRequest(request);

    if (!partner) {
      setMessage("Add a partner directory candidate before sending a matched partner.");
      return;
    }

    updateRequestStatus(request.id, "Matched partner sent", partner.id);
  }

  return (
    <div className="app-shell partner-network-shell seller-risk-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Partner investigation</div>
          <h1>Route seller risk to the right partner at the right time.</h1>
          <p className="hero-text">
            Auretix can become more than software: when a SKU risk needs freight,
            supplier, wholesale, or 3PL help, the seller can request a vetted partner
            match with consent and fee disclosure built in.
          </p>
        </div>
        <AppNavigation />
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
          <div className="result-meta">{matchedRequests} matched partner sends recorded.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Queue storage</div>
          <div className="result-value">{networkSourceLabel}</div>
          <div className="result-meta">Signed-in queues write to Supabase and audit events.</div>
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

              <div className="partner-directory-picker">
                <div className="results-header">
                  <h4>Partner directory candidates</h4>
                  <span className="partner-source-chip">{candidatePartners.length} available</span>
                </div>
                <div className="partner-directory-list">
                  {candidatePartners.map((partner) => (
                    <button
                      className={`partner-directory-card ${
                        selectedPartner?.id === partner.id ? "active" : ""
                      }`}
                      key={partner.id}
                      onClick={() => setSelectedPartnerId(partner.id)}
                      type="button"
                    >
                      <strong>{partner.name}</strong>
                      <span>{partner.coverage}</span>
                      <small>{partner.fitSummary}</small>
                    </button>
                  ))}
                </div>
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

              <button
                className="button button-primary"
                disabled={isSaving}
                onClick={requestPartnerMatch}
                type="button"
              >
                {isSaving ? "Saving..." : "Request matched partner"}
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
          <div className="partner-guardrail-card">
            <div className="result-label">Directory source</div>
            <p>
              {networkSource === "supabase"
                ? "Partner candidates are loaded from Supabase for this company workspace."
                : "Preview partners are shown until the signed-in Supabase queue is ready."}
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
              <span>Partner</span>
              <span>Status</span>
              <span>Disclosure</span>
            </div>
            {requests.map((request) => {
              const requestPartner = findPartnerForRequest(request);

              return (
                <div className="partner-request-row partner-request-item" key={request.id}>
                  <span>
                    <strong>{request.service}</strong>
                    <small>{formatCreatedAt(request.createdAt)}</small>
                  </span>
                  <span>
                    {request.sku}
                    <small>{request.product}</small>
                  </span>
                  <span>{money(request.estimatedValue)}</span>
                  <span>
                    {request.matchedPartnerSnapshot?.name || requestPartner?.name || "Not selected"}
                    <small>
                      {request.matchedPartnerSnapshot ? "Sent to seller" : requestPartner?.coverage}
                    </small>
                  </span>
                  <span className="partner-status-actions">
                    <strong>{request.status}</strong>
                    <button
                      disabled={isSaving}
                      onClick={() => updateRequestStatus(request.id, "Contacted partner")}
                      type="button"
                    >
                      Contacted
                    </button>
                    <button
                      disabled={isSaving}
                      onClick={() => sendMatchedPartner(request)}
                      type="button"
                    >
                      Send match
                    </button>
                    <button
                      disabled={isSaving}
                      onClick={() => updateRequestStatus(request.id, "Introduced")}
                      type="button"
                    >
                      Introduced
                    </button>
                    <button
                      disabled={isSaving}
                      onClick={() => updateRequestStatus(request.id, "Closed")}
                      type="button"
                    >
                      Closed
                    </button>
                  </span>
                  <span>
                    {request.disclosure}
                    {request.matchedPartnerSnapshot ? (
                      <small className="partner-match-sent">
                        Match sent {formatCreatedAt(request.matchedPartnerSnapshot.sentAt)}
                      </small>
                    ) : null}
                  </span>
                </div>
              );
            })}
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
