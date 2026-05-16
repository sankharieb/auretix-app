"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  getScoredSkus,
  integer,
  priorityClass,
  sampleSkuCsv,
} from "../lib/sku-risk-model";

const moveFilters = [
  "All",
  "Expedite inbound",
  "Transfer stock",
  "Split supplier",
  "Hold",
  "Watch",
];

function actionCopy(item) {
  if (!item) {
    return "";
  }

  if (item.recommendedMove === "Expedite inbound") {
    return `Expedite ${item.openPo || item.recommendedPo || "open"} units before ${item.stockoutDate}. Inbound ETA is ${item.inboundEtaDate} with ${item.inboundDelayDays} delay days already modeled.`;
  }

  if (item.recommendedMove === "Transfer stock") {
    return `Transfer inventory toward the constrained channel. Location imbalance is ${item.locationImbalancePct.toFixed(0)}%, and cover is only ${item.daysOfCover.toFixed(1)} days.`;
  }

  if (item.recommendedMove === "Split supplier") {
    return `Split supply or qualify a backup path. Supplier reliability is ${item.supplierReliability}%, creating ETA risk before the next reorder cycle.`;
  }

  if (item.recommendedMove === "Hold") {
    return `Hold the next move. This SKU has excess coverage, so the flow risk is cash trapped in slow inventory rather than service failure.`;
  }

  if (item.recommendedMove === "Protect channel") {
    return `Protect the most exposed channel first. Current cover is ${item.daysOfCover.toFixed(1)} days against an inbound ETA of ${item.inboundEtaDate}.`;
  }

  return `Watch the SKU. Current coverage and inbound timing do not need an immediate operational move.`;
}

export default function SupplyChainFlowView() {
  const [selectedSku, setSelectedSku] = useState(null);
  const [moveFilter, setMoveFilter] = useState("All");
  const [flowState, setFlowState] = useState({});
  const [runMessage, setRunMessage] = useState("");

  const { rows } = useMemo(() => getScoredSkus(sampleSkuCsv, 25000), []);
  const flowRows = [...rows].sort(
    (a, b) =>
      b.serviceGapDays - a.serviceGapDays ||
      b.inboundDelayRisk - a.inboundDelayRisk ||
      b.riskScore - a.riskScore,
  );
  const filteredRows =
    moveFilter === "All"
      ? flowRows
      : flowRows.filter((item) => item.recommendedMove === moveFilter);
  const selectedItem =
    filteredRows.find((item) => item.sku === selectedSku) || filteredRows[0] || flowRows[0];
  const earliestStockout = flowRows.reduce(
    (earliest, item) => (item.daysOfCover < earliest.daysOfCover ? item : earliest),
    flowRows[0],
  );
  const serviceGapCount = flowRows.filter((item) => item.serviceGapDays > 0).length;
  const inboundDelayCount = flowRows.filter((item) => item.inboundDelayRisk >= 35).length;
  const channelLocationCount = flowRows.filter(
    (item) =>
      item.channelAvailability !== "Channels covered" ||
      item.locationIssue !== "No location break",
  ).length;

  function runFlowCheck() {
    const firstBreak = flowRows[0];
    setSelectedSku(firstBreak?.sku || null);
    setRunMessage(
      firstBreak
        ? `Flow check complete: ${firstBreak.sku} is the first break risk. Recommended move: ${firstBreak.recommendedMove}.`
        : "Flow check complete: no SKU data is available.",
    );
  }

  function setFlowDecision(item, status) {
    setSelectedSku(item.sku);
    setFlowState((current) => ({
      ...current,
      [item.sku]: status,
    }));
    setRunMessage(`${status} set for ${item.sku}: ${actionCopy(item)}`);
  }

  return (
    <div className="app-shell seller-risk-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Supply chain cockpit</div>
          <h1>Where will flow break, and what should I move or protect?</h1>
          <p className="hero-text">
            A focused service-risk view for sellers: find stockout dates, inbound delay,
            Amazon/Shopify availability gaps, location imbalance, and the next operational move.
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
          <div className="result-label">Earliest stockout</div>
          <div className="result-value">{earliestStockout?.stockoutDate}</div>
          <div className="result-meta">{earliestStockout?.sku} has the shortest cover window.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Service gaps</div>
          <div className="result-value">{serviceGapCount}</div>
          <div className="result-meta">SKUs where cover ends before inbound recovery.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Inbound ETA risk</div>
          <div className="result-value">{inboundDelayCount}</div>
          <div className="result-meta">Supplier or shipment delay needs close attention.</div>
        </div>
        <div className="result-block">
          <div className="result-label">Flow issues</div>
          <div className="result-value">{channelLocationCount}</div>
          <div className="result-meta">Channel availability or warehouse imbalance flagged.</div>
        </div>
      </section>

      <section className="seller-risk-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Flow controls</h3>
            <span className="tier-chip">Service continuity</span>
          </div>
          <button className="button button-primary" onClick={runFlowCheck} type="button">
            Run flow check
          </button>
          {runMessage ? <div className="flow-run-result">{runMessage}</div> : null}
          <div className="seller-risk-focus-list">
            <div>Stockout date</div>
            <div>Inbound delay</div>
            <div>Amazon/Shopify channel availability</div>
            <div>Warehouse/location imbalance</div>
            <div>Demand spike and late supplier shipment</div>
          </div>
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Move filter</h3>
            <span className="tier-chip">{filteredRows.length} SKUs</span>
          </div>
          <div className="seller-risk-tab-row">
            {moveFilters.map((filter) => (
              <button
                className={`seller-risk-tab ${moveFilter === filter ? "active" : ""}`}
                key={filter}
                onClick={() => setMoveFilter(filter)}
                type="button"
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="lab-card seller-risk-table-card">
        <div className="results-header">
          <h3>Flow break list</h3>
          <span className="tier-chip">Expedite, transfer, split, hold, or watch</span>
        </div>
        <div className="supply-flow-table">
          <div className="supply-flow-row supply-flow-header">
            <span>SKU</span>
            <span>Cover</span>
            <span>Stockout date</span>
            <span>Inbound ETA risk</span>
            <span>Service gap</span>
            <span>Channel/location issue</span>
            <span>Recommended move</span>
            <span>Decision</span>
          </div>
          {filteredRows.map((item) => (
            <button
              className={`supply-flow-row supply-flow-button ${
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
              <span>{item.daysOfCover.toFixed(1)} days</span>
              <span>{item.stockoutDate}</span>
              <span className={`sku-priority ${priorityClass(item.priority)}`}>
                {item.inboundDelayRisk}/100
              </span>
              <span>{item.serviceGapDays.toFixed(1)} days</span>
              <span>
                {item.channelAvailability}
                <small>{item.locationIssue}</small>
              </span>
              <span>{item.recommendedMove}</span>
              <span>{flowState[item.sku] || "Open"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="seller-risk-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>Recommended move</h3>
            <span className="tier-chip">{selectedItem?.sku}</span>
          </div>
          {selectedItem ? (
            <>
              <div className="seller-risk-selected">
                <h4>{selectedItem.recommendedMove}</h4>
                <p>{actionCopy(selectedItem)}</p>
              </div>
              <div className="flow-action-list">
                <div>
                  <strong>Days of cover</strong>
                  <span>{selectedItem.daysOfCover.toFixed(1)} days</span>
                </div>
                <div>
                  <strong>Inbound ETA</strong>
                  <span>
                    {selectedItem.inboundEtaDate}, {selectedItem.inboundDelayDays} delay days
                  </span>
                </div>
                <div>
                  <strong>Channel availability</strong>
                  <span>{selectedItem.channelAvailability}</span>
                </div>
                <div>
                  <strong>Location flow</strong>
                  <span>{selectedItem.locationIssue}</span>
                </div>
              </div>
              <div className="button-row">
                <button className="button button-primary" onClick={() => setFlowDecision(selectedItem, "Expedite")} type="button">
                  Expedite
                </button>
                <button className="button button-secondary" onClick={() => setFlowDecision(selectedItem, "Transfer")} type="button">
                  Transfer
                </button>
                <button className="button button-secondary" onClick={() => setFlowDecision(selectedItem, "Split supplier")} type="button">
                  Split supplier
                </button>
                <button className="button button-secondary" onClick={() => setFlowDecision(selectedItem, "Hold")} type="button">
                  Hold
                </button>
                <button className="button button-secondary" onClick={() => setFlowDecision(selectedItem, "Watch")} type="button">
                  Watch
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>Action log</h3>
            <span className="tier-chip">{Object.keys(flowState).length} decisions</span>
          </div>
          {Object.keys(flowState).length ? (
            <div className="flow-action-log">
              {Object.entries(flowState).map(([sku, status]) => {
                const item = flowRows.find((row) => row.sku === sku);
                return (
                  <div key={sku}>
                    <strong>
                      {sku}: {status}
                    </strong>
                    <span>{item ? actionCopy(item) : "Decision saved for this session."}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="result-meta">
              Pick a SKU and choose a move. Auretix should turn flow risks into operational
              decisions, not just report that inventory is low.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
