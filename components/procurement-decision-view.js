"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  buildDraftPo,
  getScoredSkus,
  integer,
  money,
  priorityClass,
  sampleSkuCsv,
} from "../lib/sku-risk-model";

export default function ProcurementDecisionView() {
  const [cashBudget, setCashBudget] = useState(25000);
  const [decisionState, setDecisionState] = useState({});
  const [selectedSku, setSelectedSku] = useState(null);
  const [draftPo, setDraftPo] = useState("");
  const [runMessage, setRunMessage] = useState("");

  const { rows } = useMemo(() => getScoredSkus(sampleSkuCsv, cashBudget), [cashBudget]);
  const selectedItem = rows.find((item) => item.sku === selectedSku) || rows[0];
  const totalCashRequired = rows.reduce((sum, item) => sum + item.cashRequired, 0);
  const riskyBestSellers = rows.filter(
    (item) => item.monthlySales >= 1000 && item.recommendedPo > 0,
  ).length;
  const overbuyRisk = rows.filter((item) => item.cashTrapped > 0).length;
  const supplierWatch = rows.filter((item) => item.supplierReliability < 75).length;
  const approvedCash = rows.reduce(
    (sum, item) => (decisionState[item.sku] === "Approved" ? sum + item.cashRequired : sum),
    0,
  );

  function setDecision(item, status) {
    setSelectedSku(item.sku);
    setDecisionState((current) => ({
      ...current,
      [item.sku]: status,
    }));

    if (status === "Approved") {
      setDraftPo(buildDraftPo(item));
    }
  }

  function runBuyingCheck() {
    const top = rows[0];
    setSelectedSku(top?.sku || null);
    setRunMessage(
      top
        ? `Buying check complete: ${top.sku} is first priority. ${top.action} requiring ${money(top.cashRequired)}.`
        : "Buying check complete: no SKU data is available.",
    );
  }

  return (
    <div className="app-shell seller-risk-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Procurement cockpit</div>
          <h1>What should I buy, how much, and can I afford it?</h1>
          <p className="hero-text">
            A focused buying view for sellers: prioritize POs, protect best-selling
            SKUs, avoid slow-inventory overbuying, and keep cash pointed at the right items.
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

      <section className="seller-risk-metric-grid">
        <div className="result-block">
          <div className="result-label">Best sellers at risk</div>
          <div className="result-value">{riskyBestSellers}</div>
          <div className="result-meta">High velocity SKUs that need buying decisions.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Recommended cash</div>
          <div className="result-value">{money(totalCashRequired)}</div>
          <div className="result-meta">Cash needed if all recommended POs are approved.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Supplier watch</div>
          <div className="result-value">{supplierWatch}</div>
          <div className="result-meta">SKUs with supplier reliability below 75%.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Overbuy risk</div>
          <div className="result-value">{overbuyRisk}</div>
          <div className="result-meta">Slow inventory that should not receive new cash.</div>
        </div>
      </section>

      <section className="seller-risk-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Buying controls</h3>
            <span className="tier-chip">Cash discipline</span>
          </div>
          <label className="seller-risk-field">
            Available cash for this buy cycle
            <input
              min="0"
              onChange={(event) => setCashBudget(Number(event.target.value) || 0)}
              type="number"
              value={cashBudget}
            />
          </label>
          <button className="button button-primary" onClick={runBuyingCheck} type="button">
            Run buying priority
          </button>
          {runMessage ? <div className="flow-run-result procurement-run-result">{runMessage}</div> : null}
          <div className="seller-risk-focus-list">
            <div>Running out of best-selling SKUs</div>
            <div>Buying too much slow inventory</div>
            <div>Spending cash on the wrong items</div>
            <div>Supplier lead time changing</div>
            <div>Not knowing which PO to approve first</div>
          </div>
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Cash approval state</h3>
            <span className="tier-chip">{money(approvedCash)} approved</span>
          </div>
          <div className="seller-risk-progress">
            <span style={{ width: `${Math.min(100, (approvedCash / Math.max(cashBudget, 1)) * 100)}%` }} />
          </div>
          <p className="result-meta">
            Auretix should keep approved buying decisions inside the cash budget unless a stockout risk is worth the tradeoff.
          </p>
        </div>
      </section>

      <section className="lab-card seller-risk-table-card">
        <div className="results-header">
          <h3>Recommended buy list</h3>
          <span className="tier-chip">PO approval order</span>
        </div>
        <div className="procurement-buy-table">
          <div className="procurement-buy-row procurement-buy-header">
            <span>SKU</span>
            <span>Risk</span>
            <span>PO quantity</span>
            <span>Cash required</span>
            <span>Supplier risk</span>
            <span>Margin</span>
            <span>Decision</span>
          </div>
          {rows.map((item) => (
            <button
              className={`procurement-buy-row procurement-buy-button ${
                selectedItem?.sku === item.sku ? "selected-row" : ""
              }`}
              key={item.sku}
              onClick={() => setSelectedSku(item.sku)}
              type="button"
            >
              <span>
                <strong>{item.sku}</strong>
                <small>{item.name}</small>
              </span>
              <span className={`sku-priority ${priorityClass(item.priority)}`}>
                {item.riskScore}/100
              </span>
              <span>{integer(item.recommendedPo)} units</span>
              <span>{money(item.cashRequired)}</span>
              <span>{100 - item.supplierReliability}%</span>
              <span>{item.marginPct.toFixed(0)}%</span>
              <span>{decisionState[item.sku] || "Open"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="seller-risk-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Approve, defer, or watch</h3>
            <span className="tier-chip">{selectedItem?.sku}</span>
          </div>
          {selectedItem ? (
            <>
              <div className="seller-risk-selected">
                <h4>{selectedItem.name}</h4>
                <p>
                  {selectedItem.action}. This SKU has {selectedItem.daysOfCover.toFixed(1)} days
                  of cover, {money(selectedItem.revenueAtRisk)} revenue at risk, and requires
                  {` ${money(selectedItem.cashRequired)} `}to protect the buying plan.
                </p>
              </div>
              <div className="button-row">
                <button className="button button-primary" onClick={() => setDecision(selectedItem, "Approved")} type="button">
                  Approve PO
                </button>
                <button className="button button-secondary" onClick={() => setDecision(selectedItem, "Watch")} type="button">
                  Watch
                </button>
                <button className="button button-secondary" onClick={() => setDecision(selectedItem, "Deferred")} type="button">
                  Defer
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Draft PO</h3>
            <span className="tier-chip">{draftPo ? "Ready" : "Awaiting approval"}</span>
          </div>
          {draftPo ? (
            <pre className="sku-draft-po">{draftPo}</pre>
          ) : (
            <p className="result-meta">
              Approve a recommended buy to generate the draft PO with quantity, cash required,
              supplier reliability, and reason.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
