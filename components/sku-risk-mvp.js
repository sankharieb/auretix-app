"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const sampleCsv = `sku,name,category,inventory,monthly_sales,open_po,lead_time_days,supplier_reliability,unit_cost,unit_price,min_cover_days
ATX-HERO-01,Hero SKU,Ecommerce,228,1800,320,28,74,12,32,14
ATX-LAUNCH-04,Launch SKU,Ecommerce,151,1300,0,35,62,18,44,14
ATX-CORE-02,Core Reorder,Retail,920,1450,240,21,86,9,24,12
ATX-MARGIN-07,Margin Repair,Wholesale,660,540,0,42,68,28,39,18
ATX-TAIL-11,Slow Tail,Consumer brand,2100,420,0,25,81,7,18,10`;

const requiredColumns = [
  "sku",
  "name",
  "inventory",
  "monthly_sales",
  "lead_time_days",
  "supplier_reliability",
  "unit_cost",
  "unit_price",
];

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      records: [],
      warnings: ["Paste CSV data with one header row and at least one SKU row."],
    };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  const warnings = missingColumns.length
    ? [`Missing recommended columns: ${missingColumns.join(", ")}.`]
    : [];

  const records = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const record = { rowNumber: rowIndex + 2 };
    headers.forEach((header, index) => {
      record[header] = cells[index] || "";
    });
    return record;
  });

  return { records, warnings };
}

function numberFrom(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function integer(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function scoreSku(record, cashBudget) {
  const sku = record.sku || `ROW-${record.rowNumber}`;
  const name = record.name || sku;
  const category = record.category || "Uncategorized";
  const inventory = Math.max(0, numberFrom(record.inventory));
  const monthlySales = Math.max(0, numberFrom(record.monthly_sales));
  const openPo = Math.max(0, numberFrom(record.open_po));
  const leadTime = Math.max(1, numberFrom(record.lead_time_days, 21));
  const supplierReliability = clamp(numberFrom(record.supplier_reliability, 75), 0, 100);
  const unitCost = Math.max(0, numberFrom(record.unit_cost));
  const unitPrice = Math.max(0, numberFrom(record.unit_price));
  const minCoverDays = Math.max(7, numberFrom(record.min_cover_days, 14));
  const dailyDemand = Math.max(0.1, monthlySales / 30);
  const daysOfCover = inventory / dailyDemand;
  const coverAfterInbound = (inventory + openPo) / dailyDemand;
  const targetCoverDays = leadTime + minCoverDays;
  const targetUnits = Math.ceil(dailyDemand * targetCoverDays);
  const recommendedPo = Math.max(0, targetUnits - inventory - openPo);
  const cashRequired = recommendedPo * unitCost;
  const marginPct = unitPrice > 0 ? ((unitPrice - unitCost) / unitPrice) * 100 : 0;
  const serviceGapDays = Math.max(0, leadTime - daysOfCover);
  const coveragePressure = clamp((targetCoverDays - coverAfterInbound) / targetCoverDays, 0, 1);
  const supplierPressure = (100 - supplierReliability) / 100;
  const marginPressure = clamp((25 - marginPct) / 25, 0, 1);
  const budgetPressure = cashBudget > 0 ? clamp(cashRequired / cashBudget, 0, 1) : 0;
  const riskScore = Math.round(
    coveragePressure * 45 +
      supplierPressure * 22 +
      marginPressure * 13 +
      budgetPressure * 10 +
      clamp(serviceGapDays / Math.max(leadTime, 1), 0, 1) * 10,
  );
  const revenueAtRisk = Math.round(serviceGapDays * dailyDemand * unitPrice);
  const excessUnits = Math.max(0, inventory + openPo - dailyDemand * (targetCoverDays + 30));
  const cashTrapped = Math.round(excessUnits * unitCost);
  const proofValue = Math.round(revenueAtRisk + cashTrapped * 0.35);
  const priority =
    riskScore >= 70 ? "Critical" : riskScore >= 45 ? "Watch" : "Healthy";
  const action =
    recommendedPo > 0
      ? `Buy ${integer(recommendedPo)} units`
      : cashTrapped > 0
        ? "Do not reorder, release trapped cash first"
        : "Watch only";

  return {
    sku,
    name,
    category,
    inventory,
    monthlySales,
    openPo,
    leadTime,
    supplierReliability,
    unitCost,
    unitPrice,
    minCoverDays,
    dailyDemand,
    daysOfCover,
    coverAfterInbound,
    targetCoverDays,
    recommendedPo,
    cashRequired,
    marginPct,
    serviceGapDays,
    riskScore,
    revenueAtRisk,
    cashTrapped,
    proofValue,
    priority,
    action,
  };
}

function priorityClass(priority) {
  return priority.toLowerCase().replace(/\s+/g, "-");
}

function buildDraftPo(item) {
  if (!item) {
    return "";
  }

  return [
    "Draft purchase order",
    `SKU: ${item.sku}`,
    `Product: ${item.name}`,
    `Recommended units: ${integer(item.recommendedPo)}`,
    `Estimated cash required: ${money(item.cashRequired)}`,
    `Lead time assumption: ${item.leadTime} days`,
    `Supplier reliability: ${item.supplierReliability}%`,
    `Reason: ${item.action}; ${item.daysOfCover.toFixed(1)} days of cover against a ${item.targetCoverDays}-day target.`,
  ].join("\n");
}

export default function SkuRiskMvp() {
  const [csvText, setCsvText] = useState(sampleCsv);
  const [cashBudget, setCashBudget] = useState(25000);
  const [decisionState, setDecisionState] = useState({});
  const [selectedSku, setSelectedSku] = useState(null);
  const [draftPo, setDraftPo] = useState("");
  const [lastParsedAt, setLastParsedAt] = useState("");

  const parsed = useMemo(() => parseCsv(csvText), [csvText]);
  const skuRows = useMemo(
    () =>
      parsed.records
        .map((record) => scoreSku(record, cashBudget))
        .sort((a, b) => b.riskScore - a.riskScore),
    [parsed.records, cashBudget],
  );
  const selectedItem =
    skuRows.find((item) => item.sku === selectedSku) || skuRows[0] || null;
  const decisions = skuRows.map((item) => decisionState[item.sku] || "Open");
  const approvedCount = decisions.filter((status) => status === "Approved").length;
  const watchedCount = decisions.filter((status) => status === "Watch").length;
  const deferredCount = decisions.filter((status) => status === "Deferred").length;
  const resolvedCount = decisions.filter((status) => status === "Resolved").length;
  const totalValueAtRisk = skuRows.reduce((sum, item) => sum + item.revenueAtRisk, 0);
  const recommendedCash = skuRows.reduce((sum, item) => sum + item.cashRequired, 0);
  const estimatedProofValue = skuRows.reduce((sum, item) => {
    const status = decisionState[item.sku] || "Open";
    return status === "Approved" || status === "Resolved"
      ? sum + item.proofValue
      : sum;
  }, 0);

  function setDecision(sku, status) {
    setDecisionState((current) => ({
      ...current,
      [sku]: status,
    }));
  }

  function handleInventoryFileUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(typeof reader.result === "string" ? reader.result : "");
      setLastParsedAt(`Loaded ${file.name}`);
    };
    reader.readAsText(file);
  }

  function createDraft(item) {
    setDraftPo(buildDraftPo(item));
    setSelectedSku(item.sku);
    setDecision(item.sku, "Approved");
  }

  return (
    <div className="app-shell sku-risk-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Auretix MVP</div>
          <h1>SKU risk and reorder cockpit</h1>
          <p className="hero-text">
            Import real SKU data, rank stockout and cash risk, approve a buying
            decision, and measure the value Auretix is protecting.
          </p>
        </div>
        <nav className="app-nav">
          <Link href="/app">Rescue board</Link>
          <Link href="/app/moat">Moat engine</Link>
          <Link href="/app/network">Network</Link>
          <Link href="/app/sku-risk">SKU risk</Link>
          <Link href="/app/procurement">Procurement</Link>
          <Link href="/app/supply-chain">Supply chain</Link>
          <Link href="/app/readiness">Readiness</Link>
          <Link href="/app/data-readiness">Data readiness</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <section className="sku-loop-strip">
        {[
          "1. Data intake",
          "2. SKU risk table",
          "3. Decision workflow",
          "4. Draft PO export",
          "5. ROI proof",
        ].map((step) => (
          <div className="sku-loop-step" key={step}>
            {step}
          </div>
        ))}
      </section>

      <section className="sku-mvp-grid">
        <div className="lab-card sku-data-card">
          <div className="results-header">
            <h3>1. Data intake</h3>
            <span className="tier-chip">{skuRows.length} SKUs</span>
          </div>
          <p className="result-meta">
            Paste CSV data or upload a file. This is the bridge before live
            Shopify, Amazon, QuickBooks, and supplier integrations.
          </p>
          <div className="sku-intake-controls">
            <label>
              Cash budget for next buy cycle
              <input
                min="0"
                onChange={(event) => setCashBudget(numberFrom(event.target.value))}
                type="number"
                value={cashBudget}
              />
            </label>
            <label>
              Upload CSV
              <input accept=".csv,text/csv" onChange={handleInventoryFileUpload} type="file" />
            </label>
          </div>
          <textarea
            className="sku-csv-textarea"
            onChange={(event) => setCsvText(event.target.value)}
            value={csvText}
          />
          <div className="button-row">
            <button
              className="button button-primary"
              onClick={() => setLastParsedAt(`Parsed ${skuRows.length} SKUs at ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`)}
              type="button"
            >
              Parse data
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                setCsvText(sampleCsv);
                setDecisionState({});
                setDraftPo("");
                setLastParsedAt("Sample data restored");
              }}
              type="button"
            >
              Load sample
            </button>
          </div>
          {lastParsedAt ? <div className="form-status success">{lastParsedAt}</div> : null}
          {parsed.warnings.length > 0 ? (
            <div className="form-status error">{parsed.warnings.join(" ")}</div>
          ) : null}
        </div>

        <div className="lab-card sku-proof-card">
          <div className="results-header">
            <h3>5. ROI proof</h3>
            <span className="tier-chip">Modeled proof</span>
          </div>
          <div className="sku-proof-grid">
            <div className="result-block">
              <div className="result-label">Revenue at risk</div>
              <div className="result-value">{money(totalValueAtRisk)}</div>
              <div className="result-meta">Modeled stockout exposure from current cover gaps.</div>
            </div>
            <div className="result-block">
              <div className="result-label">Cash needed</div>
              <div className="result-value">{money(recommendedCash)}</div>
              <div className="result-meta">Total cash required if every recommended PO is funded.</div>
            </div>
            <div className="result-block">
              <div className="result-label">Proof value</div>
              <div className="result-value">{money(estimatedProofValue)}</div>
              <div className="result-meta">Value tied to approved or resolved decisions.</div>
            </div>
          </div>
          <div className="sku-decision-counts">
            <span>Approved: {approvedCount}</span>
            <span>Watch: {watchedCount}</span>
            <span>Deferred: {deferredCount}</span>
            <span>Resolved: {resolvedCount}</span>
          </div>
        </div>
      </section>

      <section className="lab-card sku-risk-table-card">
        <div className="results-header">
          <h3>2. SKU risk table</h3>
          <span className="tier-chip">Ranked by risk</span>
        </div>
        <div className="sku-risk-table">
          <div className="sku-risk-row sku-risk-header">
            <span>SKU</span>
            <span>Risk</span>
            <span>Cover</span>
            <span>Recommended PO</span>
            <span>Cash</span>
            <span>Supplier</span>
            <span>Decision</span>
          </div>
          {skuRows.map((item) => (
            <button
              className={`sku-risk-row sku-risk-button ${
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
              <span>{item.daysOfCover.toFixed(1)} days</span>
              <span>{integer(item.recommendedPo)} units</span>
              <span>{money(item.cashRequired)}</span>
              <span>{item.supplierReliability}%</span>
              <span>{decisionState[item.sku] || "Open"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="sku-mvp-grid">
        <div className="lab-card">
          <div className="results-header">
            <h3>3. Decision workflow</h3>
            <span className="tier-chip">{selectedItem?.priority || "Select SKU"}</span>
          </div>
          {selectedItem ? (
            <>
              <div className="sku-selected-summary">
                <h4>{selectedItem.name}</h4>
                <p>
                  {selectedItem.action}. Current cover is {selectedItem.daysOfCover.toFixed(1)} days
                  against a {selectedItem.targetCoverDays}-day planning target.
                </p>
              </div>
              <div className="sku-proof-grid">
                <div className="result-block">
                  <div className="result-label">Stockout gap</div>
                  <div className="result-value">{selectedItem.serviceGapDays.toFixed(1)} days</div>
                </div>
                <div className="result-block">
                  <div className="result-label">Revenue at risk</div>
                  <div className="result-value">{money(selectedItem.revenueAtRisk)}</div>
                </div>
                <div className="result-block">
                  <div className="result-label">Margin</div>
                  <div className="result-value">{selectedItem.marginPct.toFixed(0)}%</div>
                </div>
              </div>
              <div className="button-row">
                <button className="button button-primary" onClick={() => createDraft(selectedItem)} type="button">
                  Approve and draft PO
                </button>
                <button className="button button-secondary" onClick={() => setDecision(selectedItem.sku, "Watch")} type="button">
                  Watch
                </button>
                <button className="button button-secondary" onClick={() => setDecision(selectedItem.sku, "Deferred")} type="button">
                  Defer
                </button>
                <button className="button button-secondary" onClick={() => setDecision(selectedItem.sku, "Resolved")} type="button">
                  Mark resolved
                </button>
              </div>
            </>
          ) : (
            <p className="result-meta">Import SKU data to start the decision workflow.</p>
          )}
        </div>

        <div className="lab-card">
          <div className="results-header">
            <h3>4. Draft PO export</h3>
            <span className="tier-chip">{draftPo ? "Ready" : "No draft"}</span>
          </div>
          {draftPo ? (
            <pre className="sku-draft-po">{draftPo}</pre>
          ) : (
            <p className="result-meta">
              Approve a SKU to generate a draft PO with quantity, cash required,
              lead time, supplier reliability, and decision reason.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
