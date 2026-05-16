"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  getScoredSkus,
  integer,
  money,
  priorityClass,
  sampleSkuCsv,
} from "../lib/sku-risk-model";

function formatDays(days) {
  return `${Math.max(0, Math.ceil(days))} days`;
}

function problemFor(item) {
  if (item.daysOfCover <= 7 && item.serviceGapDays > 0) {
    return "Best seller can stock out";
  }

  if (item.cashTrapped > 0) {
    return "Slow inventory traps cash";
  }

  if (item.supplierReliability < 70) {
    return "Supplier delay can break flow";
  }

  if (item.locationIssue.includes("imbalance")) {
    return "Inventory is in the wrong place";
  }

  if (item.recommendedPo > 0) {
    return "Reorder decision is due";
  }

  return "Watch for drift";
}

function actionFor(item, cashBudget) {
  if (item.cashTrapped > item.revenueAtRisk && item.recommendedPo === 0) {
    return "Hold buying";
  }

  if (item.serviceGapDays > 10 && item.inboundDelayDays > 0) {
    return "Expedite inbound";
  }

  if (item.locationIssue.includes("imbalance")) {
    return "Transfer stock";
  }

  if (item.supplierReliability < 70) {
    return "Split supplier";
  }

  if (item.recommendedPo > 0 && item.cashRequired <= cashBudget) {
    return "Approve PO";
  }

  if (item.recommendedPo > 0) {
    return "Approve partial PO";
  }

  return "Watch";
}

function deadlineFor(item) {
  if (item.daysOfCover <= 14) {
    return `${item.stockoutDate} (${formatDays(item.daysOfCover)})`;
  }

  if (item.inboundDelayRisk >= 45) {
    return `${item.inboundEtaDate} ETA risk`;
  }

  if (item.cashTrapped > 0) {
    return "Before next PO";
  }

  return "This week";
}

function whyFor(item) {
  if (item.daysOfCover <= 7) {
    return `${item.daysOfCover.toFixed(1)} days cover, inbound ETA ${item.inboundEtaDate}, ${item.channelAvailability.toLowerCase()}.`;
  }

  if (item.cashTrapped > 0) {
    return `${money(item.cashTrapped)} is tied up in excess coverage. Do not put more cash behind it.`;
  }

  if (item.supplierReliability < 70) {
    return `${item.supplierReliability}% supplier reliability with ${item.inboundDelayDays} modeled delay days.`;
  }

  if (item.locationIssue.includes("imbalance")) {
    return `${item.locationImbalancePct.toFixed(0)}% location imbalance while channel demand keeps moving.`;
  }

  return `${integer(item.recommendedPo)} units recommended against a ${item.targetCoverDays}-day target.`;
}

function buildRescueRows(rows, cashBudget) {
  return rows
    .map((item) => {
      const dollarRisk = Math.max(item.proofValue, item.revenueAtRisk, item.cashTrapped * 0.35);
      const recommendedAction = actionFor(item, cashBudget);

      return {
        ...item,
        problem: problemFor(item),
        dollarRisk,
        deadline: deadlineFor(item),
        recommendedAction,
        why: whyFor(item),
      };
    })
    .sort(
      (a, b) =>
        b.dollarRisk - a.dollarRisk ||
        a.daysOfCover - b.daysOfCover ||
        b.riskScore - a.riskScore,
    );
}

export default function SellerRescueBoard() {
  const [cashBudget, setCashBudget] = useState(25000);
  const [selectedSku, setSelectedSku] = useState(null);
  const [actionState, setActionState] = useState({});
  const [boardMessage, setBoardMessage] = useState("");

  const { rows } = useMemo(() => getScoredSkus(sampleSkuCsv, cashBudget), [cashBudget]);
  const rescueRows = useMemo(() => buildRescueRows(rows, cashBudget), [cashBudget, rows]);
  const selectedItem =
    rescueRows.find((item) => item.sku === selectedSku) || rescueRows[0];
  const weeklyRisk = rescueRows.reduce((sum, item) => sum + item.dollarRisk, 0);
  const thisWeekStockouts = rescueRows.filter((item) => item.daysOfCover <= 7).length;
  const cashNeeded = rescueRows.reduce((sum, item) => sum + item.cashRequired, 0);
  const approvedActions = Object.values(actionState).filter((status) => status === "Approved").length;

  function approveAction(item) {
    setSelectedSku(item.sku);
    setActionState((current) => ({
      ...current,
      [item.sku]: "Approved",
    }));
    setBoardMessage(
      `${item.recommendedAction} approved for ${item.sku}. ${item.why}`,
    );
  }

  function watchAction(item) {
    setSelectedSku(item.sku);
    setActionState((current) => ({
      ...current,
      [item.sku]: "Watch",
    }));
    setBoardMessage(`${item.sku} moved to watch. ${item.why}`);
  }

  return (
    <div className="app-shell rescue-shell seller-risk-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Seller Rescue Board</div>
          <h1>Find the SKUs that will cost you money this week.</h1>
          <p className="hero-text">
            Auretix turns procurement and supply-chain risk into one action queue:
            what is wrong, how much money is exposed, the deadline, and the move to approve.
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

      <section className="rescue-hero-grid">
        <div className="rescue-command-card">
          <div className="results-header">
            <h3>Today&apos;s seller risk</h3>
            <span className="tier-chip">Seeded demo data</span>
          </div>
          <div className="rescue-impact-grid">
            <div>
              <span>Money exposed</span>
              <strong>{money(weeklyRisk)}</strong>
            </div>
            <div>
              <span>Can stock out this week</span>
              <strong>{thisWeekStockouts}</strong>
            </div>
            <div>
              <span>Cash requested</span>
              <strong>{money(cashNeeded)}</strong>
            </div>
            <div>
              <span>Actions approved</span>
              <strong>{approvedActions}</strong>
            </div>
          </div>
          <label className="seller-risk-field">
            Available cash for this rescue cycle
            <input
              min="0"
              onChange={(event) => setCashBudget(Number(event.target.value) || 0)}
              type="number"
              value={cashBudget}
            />
          </label>
        </div>

        <div className="rescue-command-card rescue-next-card">
          <div className="results-header">
            <h3>Next best action</h3>
            <span className={`sku-priority ${priorityClass(selectedItem.priority)}`}>
              {selectedItem.priority}
            </span>
          </div>
          <strong>{selectedItem.sku}</strong>
          <p>{selectedItem.problem}</p>
          <div className="rescue-next-meta">
            <span>{money(selectedItem.dollarRisk)} exposed</span>
            <span>{selectedItem.deadline}</span>
            <span>{selectedItem.recommendedAction}</span>
          </div>
          <div className="button-row">
            <button className="button button-primary" onClick={() => approveAction(selectedItem)} type="button">
              Approve action
            </button>
            <button className="button button-secondary" onClick={() => watchAction(selectedItem)} type="button">
              Watch
            </button>
          </div>
        </div>
      </section>

      {boardMessage ? <div className="flow-run-result rescue-run-result">{boardMessage}</div> : null}

      <section className="lab-card rescue-board-card">
        <div className="results-header">
          <h3>Seller Rescue Board</h3>
          <span className="tier-chip">Problem, money, deadline, action</span>
        </div>
        <div className="rescue-board-table">
          <div className="rescue-board-row rescue-board-header">
            <span>SKU</span>
            <span>Problem</span>
            <span>Dollar risk</span>
            <span>Deadline</span>
            <span>Recommended action</span>
            <span>Why</span>
            <span>Approve action</span>
          </div>
          {rescueRows.map((item) => (
            <div
              className={`rescue-board-row rescue-board-item ${
                selectedItem.sku === item.sku ? "selected-row" : ""
              }`}
              key={item.sku}
            >
              <button className="rescue-sku-button" onClick={() => setSelectedSku(item.sku)} type="button">
                <strong>{item.sku}</strong>
                <small>{item.name}</small>
              </button>
              <span className="rescue-problem">{item.problem}</span>
              <span>{money(item.dollarRisk)}</span>
              <span>{item.deadline}</span>
              <span>{item.recommendedAction}</span>
              <span>{item.why}</span>
              <span className="rescue-action-cell">
                <button className="button button-primary" onClick={() => approveAction(item)} type="button">
                  Approve
                </button>
                <button className="button button-secondary" onClick={() => watchAction(item)} type="button">
                  Watch
                </button>
                <small>{actionState[item.sku] || "Open"}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="seller-risk-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Why this gets seller attention</h3>
            <span className="tier-chip">Not another dashboard</span>
          </div>
          <div className="seller-risk-focus-list">
            <div>It starts with money at risk.</div>
            <div>It makes one SKU decision at a time.</div>
            <div>It shows deadline before theory.</div>
            <div>It connects buying and flow in one row.</div>
          </div>
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Proof needed next</h3>
            <span className="tier-chip">SaaS path</span>
          </div>
          <p className="result-meta">
            The board becomes hard to ignore when it uses live Shopify, Amazon, QuickBooks,
            inventory, supplier, and cash data, then proves which approved actions saved
            revenue or avoided bad spend.
          </p>
          <div className="hero-actions">
            <Link className="button button-secondary" href="/app/procurement">
              Buying drill-down
            </Link>
            <Link className="button button-secondary" href="/app/supply-chain">
              Flow drill-down
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
