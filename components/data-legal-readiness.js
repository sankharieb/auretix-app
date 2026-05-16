"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const storageKey = "auretix-data-legal-readiness-v1";

const statuses = [
  {
    id: "not-started",
    label: "Not started",
    description: "Nothing reliable exists yet.",
  },
  {
    id: "drafting",
    label: "Drafting",
    description: "In progress, but not ready for a live seller connection.",
  },
  {
    id: "needs-review",
    label: "Needs review",
    description: "Draft exists and should be reviewed before use.",
  },
  {
    id: "ready",
    label: "Ready",
    description: "Good enough for a controlled pilot.",
  },
  {
    id: "blocked",
    label: "Blocked",
    description: "Do not connect live data until this is fixed.",
  },
];

const readinessItems = [
  {
    id: "privacy-policy",
    category: "Legal",
    name: "Privacy policy",
    required: true,
    owner: "Founder + counsel",
    why: "Sellers need to know what Auretix collects, why, where it is stored, and how deletion works.",
    evidence: "Published Privacy Policy URL linked from app and website.",
  },
  {
    id: "terms",
    category: "Legal",
    name: "Terms of service",
    required: true,
    owner: "Founder + counsel",
    why: "Auretix is decision support. Terms should avoid guaranteed savings or guaranteed operational outcomes.",
    evidence: "Published Terms URL linked from app and website.",
  },
  {
    id: "seller-consent",
    category: "Consent",
    name: "Seller consent flow",
    required: true,
    owner: "Product",
    why: "A seller must intentionally authorize store/account access. We should never collect passwords.",
    evidence: "OAuth consent or signed pilot permission before live import.",
  },
  {
    id: "data-scope",
    category: "Data scope",
    name: "Minimum data scope",
    required: true,
    owner: "Product + engineering",
    why: "Early pilots should use the least data possible: SKU, inventory, sales velocity, cost, price, PO, and supplier timing.",
    evidence: "Scope list approved for Shopify, Amazon, QuickBooks, and CSV import.",
  },
  {
    id: "pii-avoidance",
    category: "Data scope",
    name: "Avoid customer PII in MVP",
    required: true,
    owner: "Product + engineering",
    why: "The first useful seller-risk product does not need customer names, addresses, emails, or payment data.",
    evidence: "MVP integrations exclude customer PII unless later approved.",
  },
  {
    id: "rls-company-isolation",
    category: "Security",
    name: "Company-level data isolation",
    required: true,
    owner: "Engineering",
    why: "One seller must never see another seller's products, sales, purchase orders, or risk decisions.",
    evidence: "Supabase RLS policies tested with two company workspaces.",
  },
  {
    id: "token-storage",
    category: "Security",
    name: "Secure OAuth token storage",
    required: true,
    owner: "Engineering",
    why: "Integration tokens are sensitive and must not be exposed in client code or logs.",
    evidence: "Tokens stored server-side only, encrypted or protected, never returned to browser.",
  },
  {
    id: "audit-trail",
    category: "Security",
    name: "Audit trail",
    required: true,
    owner: "Engineering",
    why: "Live recommendations need a record of who connected data, who approved actions, and what changed.",
    evidence: "Audit table records login, import, approval, and disconnect events.",
  },
  {
    id: "delete-disconnect",
    category: "Operations",
    name: "Disconnect and delete process",
    required: true,
    owner: "Operations",
    why: "Sellers need a clear path to disconnect integrations and request data deletion.",
    evidence: "Documented deletion SOP plus in-app disconnect state.",
  },
  {
    id: "shopify-readiness",
    category: "Platform",
    name: "Shopify app readiness",
    required: true,
    owner: "Engineering",
    why: "Shopify needs correct scopes, OAuth, privacy links, and app review readiness before public distribution.",
    evidence: "Read-only pilot scopes listed; app can authorize without asking for unnecessary data.",
  },
  {
    id: "amazon-readiness",
    category: "Platform",
    name: "Amazon SP-API readiness",
    required: true,
    owner: "Engineering + founder",
    why: "Amazon requires developer access, role approvals, secure handling, and tighter data protection controls.",
    evidence: "SP-API developer profile, roles, and security requirements tracked.",
  },
  {
    id: "quickbooks-readiness",
    category: "Platform",
    name: "QuickBooks readiness",
    required: false,
    owner: "Engineering",
    why: "QuickBooks is useful for cash and PO context, but can come after Shopify/Amazon or CSV pilots.",
    evidence: "Scopes and production app requirements documented before connect button is live.",
  },
  {
    id: "pilot-agreement",
    category: "Pilot",
    name: "Pilot agreement",
    required: true,
    owner: "Founder",
    why: "Early sellers should understand that Auretix is in pilot mode and recommendations need human review.",
    evidence: "Simple pilot agreement or written email confirmation stored.",
  },
  {
    id: "roi-proof-plan",
    category: "Pilot",
    name: "ROI proof plan",
    required: true,
    owner: "Founder + product",
    why: "The product must prove saved revenue, avoided stockout, or avoided bad spend.",
    evidence: "Before/after baseline: stockouts, cash tied in inventory, PO decisions, revenue at risk.",
  },
];

function createDefaultState() {
  return Object.fromEntries(
    readinessItems.map((item) => [
      item.id,
      {
        status: "not-started",
        note: "",
        updatedAt: "",
      },
    ]),
  );
}

function getStatus(statusId) {
  return statuses.find((status) => status.id === statusId) || statuses[0];
}

function getGateState(rows) {
  const requiredRows = rows.filter((row) => row.required);
  const blocked = requiredRows.filter((row) => row.status === "blocked");
  const ready = requiredRows.filter((row) => row.status === "ready");
  const review = requiredRows.filter((row) => row.status === "needs-review");
  const missing = requiredRows.filter((row) =>
    ["not-started", "drafting"].includes(row.status),
  );

  if (blocked.length) {
    return {
      label: "Blocked",
      className: "blocked",
      message: `${blocked.length} required item${blocked.length === 1 ? "" : "s"} blocked. Do not connect live seller data.`,
    };
  }

  if (missing.length) {
    return {
      label: "Not cleared",
      className: "not-cleared",
      message: `${missing.length} required item${missing.length === 1 ? "" : "s"} still missing before live integrations.`,
    };
  }

  if (review.length) {
    return {
      label: "Needs review",
      className: "review",
      message: `${review.length} required item${review.length === 1 ? "" : "s"} drafted but needs review before live data.`,
    };
  }

  return {
    label: "Pilot ready",
    className: "ready",
    message: `${ready.length} required controls ready for a controlled seller pilot.`,
  };
}

export default function DataLegalReadiness() {
  const [boardState, setBoardState] = useState(createDefaultState);
  const [filter, setFilter] = useState("all");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);

      if (saved) {
        setBoardState({
          ...createDefaultState(),
          ...JSON.parse(saved),
        });
      }
    } catch {
      setBoardState(createDefaultState());
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(boardState));
  }, [boardState, isHydrated]);

  const rows = useMemo(
    () =>
      readinessItems.map((item) => {
        const state = boardState[item.id] || {
          status: "not-started",
          note: "",
          updatedAt: "",
        };

        return {
          ...item,
          ...state,
        };
      }),
    [boardState],
  );

  const filteredRows =
    filter === "all" ? rows : rows.filter((row) => row.category === filter);
  const gateState = getGateState(rows);
  const readyCount = rows.filter((row) => row.status === "ready").length;
  const blockedCount = rows.filter((row) => row.status === "blocked").length;
  const requiredReadyCount = rows.filter((row) => row.required && row.status === "ready").length;
  const requiredTotal = rows.filter((row) => row.required).length;
  const categories = ["all", ...new Set(readinessItems.map((item) => item.category))];

  function updateItem(itemId, patch) {
    setBoardState((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        ...patch,
        updatedAt: new Date().toLocaleDateString(),
      },
    }));
  }

  function resetChecklist() {
    const nextState = createDefaultState();
    setBoardState(nextState);
    window.localStorage.setItem(storageKey, JSON.stringify(nextState));
  }

  return (
    <div className="app-shell data-readiness-shell seller-risk-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Live data gate</div>
          <h1>Data + Legal Readiness</h1>
          <p className="hero-text">
            Before Auretix connects a real Shopify, Amazon, QuickBooks, or seller CSV account,
            we need consent, minimum data scope, security controls, platform readiness, and proof tracking.
          </p>
        </div>
        <nav className="app-nav">
          <Link href="/app">Rescue board</Link>
          <Link href="/app/sku-risk">SKU risk</Link>
          <Link href="/app/procurement">Procurement</Link>
          <Link href="/app/supply-chain">Supply chain</Link>
          <Link href="/app/readiness">Readiness</Link>
          <Link href="/app/data-readiness">Data readiness</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <section className={`data-gate-card data-gate-${gateState.className}`}>
        <div>
          <div className="result-label">Live integration gate</div>
          <h2>{gateState.label}</h2>
          <p>{gateState.message}</p>
        </div>
        <div className="data-gate-progress">
          <strong>
            {requiredReadyCount}/{requiredTotal}
          </strong>
          <span>required controls ready</span>
        </div>
      </section>

      <section className="seller-risk-metric-grid">
        <div className="result-block">
          <div className="result-label">Ready controls</div>
          <div className="result-value">{readyCount}</div>
          <div className="result-meta">Items marked ready for a controlled pilot.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Blocked</div>
          <div className="result-value">{blockedCount}</div>
          <div className="result-meta">Items that stop live seller data access.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Required controls</div>
          <div className="result-value">{requiredTotal}</div>
          <div className="result-meta">Must be ready or reviewed before live integrations.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Pilot stance</div>
          <div className="result-value">Read-only</div>
          <div className="result-meta">Start with CSV/import or read-only OAuth whenever possible.</div>
        </div>
      </section>

      <section className="seller-risk-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Minimum safe pilot</h3>
            <span className="tier-chip">Recommended path</span>
          </div>
          <div className="seller-risk-focus-list">
            <div>Use CSV import or read-only OAuth first.</div>
            <div>Avoid customer PII in the MVP.</div>
            <div>Ask only for SKU, inventory, sales, cost, price, PO, and supplier timing.</div>
            <div>Store tokens server-side only.</div>
            <div>Keep every recommendation human-approved.</div>
            <div>Track proof before claiming savings.</div>
          </div>
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Filter checklist</h3>
            <button className="button button-secondary" onClick={resetChecklist} type="button">
              Reset checklist
            </button>
          </div>
          <div className="seller-risk-tab-row data-category-tabs">
            {categories.map((category) => (
              <button
                className={`seller-risk-tab ${filter === category ? "active" : ""}`}
                key={category}
                onClick={() => setFilter(category)}
                type="button"
              >
                {category === "all" ? "All" : category}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="lab-card data-checklist-card">
        <div className="results-header">
          <h3>Data + Legal checklist</h3>
          <span className="tier-chip">Before live seller accounts</span>
        </div>
        <div className="data-checklist-table">
          <div className="data-checklist-row data-checklist-header">
            <span>Control</span>
            <span>Why it matters</span>
            <span>Owner</span>
            <span>Evidence needed</span>
            <span>Status</span>
            <span>Notes</span>
          </div>
          {filteredRows.map((item) => {
            const status = getStatus(item.status);

            return (
              <article className="data-checklist-row data-checklist-item" key={item.id}>
                <div>
                  <div className="result-label">{item.category}</div>
                  <h4>{item.name}</h4>
                  <span className={`data-required-chip ${item.required ? "required" : "optional"}`}>
                    {item.required ? "Required" : "Later"}
                  </span>
                </div>
                <p>{item.why}</p>
                <span>{item.owner}</span>
                <p>{item.evidence}</p>
                <div className="data-status-stack">
                  <span className={`tier-chip data-status-${item.status}`}>{status.label}</span>
                  <select
                    aria-label={`${item.name} status`}
                    onChange={(event) =>
                      updateItem(item.id, {
                        status: event.target.value,
                      })
                    }
                    value={item.status}
                  >
                    {statuses.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="data-quick-actions">
                    <button onClick={() => updateItem(item.id, { status: "drafting" })} type="button">
                      Draft
                    </button>
                    <button onClick={() => updateItem(item.id, { status: "needs-review" })} type="button">
                      Review
                    </button>
                    <button onClick={() => updateItem(item.id, { status: "ready" })} type="button">
                      Ready
                    </button>
                    <button onClick={() => updateItem(item.id, { status: "blocked" })} type="button">
                      Block
                    </button>
                  </div>
                </div>
                <label>
                  <span>Notes</span>
                  <textarea
                    onChange={(event) =>
                      updateItem(item.id, {
                        note: event.target.value,
                      })
                    }
                    placeholder="Add document link, missing owner, question, or decision."
                    rows="4"
                    value={item.note}
                  />
                  <small>Updated: {item.updatedAt || "Not yet"}</small>
                </label>
              </article>
            );
          })}
        </div>
      </section>

      <section className="seller-risk-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Documents to prepare</h3>
            <span className="tier-chip">Founder action</span>
          </div>
          <div className="flow-action-list">
            <div>
              <strong>Privacy Policy</strong>
              <span>What data we collect, why, retention, deletion, subprocessors, and contact path.</span>
            </div>
            <div>
              <strong>Terms of Service</strong>
              <span>Decision-support limits, no guaranteed savings, user responsibility, and payment terms.</span>
            </div>
            <div>
              <strong>Pilot Agreement</strong>
              <span>Controlled beta language, data permission, human approval, and feedback expectations.</span>
            </div>
            <div>
              <strong>Deletion SOP</strong>
              <span>How we disconnect a seller, remove imported data, and record completion.</span>
            </div>
          </div>
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Founder next steps</h3>
            <span className="tier-chip">Practical order</span>
          </div>
          <ol className="data-next-steps">
            <li>Keep the first pilot CSV or read-only, not full automation.</li>
            <li>Prepare Privacy Policy, Terms, and pilot permission language.</li>
            <li>Define exact Shopify/Amazon/QuickBooks scopes before building connect buttons.</li>
            <li>Test company isolation and token handling before any outside seller connects.</li>
            <li>Collect before/after ROI proof from each approved action.</li>
          </ol>
          <p className="result-meta">
            This checklist is an operating readiness tool. Final legal wording should still be reviewed by counsel before public launch or paid customer pilots.
          </p>
        </div>
      </section>
    </div>
  );
}
