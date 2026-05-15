"use strict";
"use client";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = EngineWorkbench;
var _link = _interopRequireDefault(require("next/link"));
var _react = require("react");
var _decisionQueue = require("../lib/decision-queue");
var _engine = require("../lib/engine");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function MetricCard({
  metric
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, metric.label), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, metric.value), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, metric.detail));
}
function DecisionPanel({
  panel,
  isActive
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `decision-panel${isActive ? " active-panel" : ""}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "decision-panel-header"
  }, /*#__PURE__*/React.createElement("h4", null, panel.title), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, panel.badge)), /*#__PURE__*/React.createElement("ul", {
    className: "action-list"
  }, panel.points.map(point => /*#__PURE__*/React.createElement("li", {
    key: point
  }, point))));
}
function EngineWorkbench({
  focus = "overview",
  title = "Auretix engine",
  intro = "Run the first version of the Auretix decision engine for sellers."
}) {
  const [scenario, setScenario] = (0, _react.useState)(_engine.defaultScenario);
  const [decision, setDecision] = (0, _react.useState)(_engine.defaultDecision);
  const [queue, setQueue] = (0, _react.useState)(() => (0, _decisionQueue.buildDecisionQueue)(_engine.defaultScenario));
  const [actionState, setActionState] = (0, _react.useState)(() => (0, _decisionQueue.buildInitialActionState)((0, _decisionQueue.buildDecisionQueue)(_engine.defaultScenario).items));
  const [selectedSku, setSelectedSku] = (0, _react.useState)(() => (0, _decisionQueue.buildDecisionQueue)(_engine.defaultScenario).items[0]?.sku ?? null);
  function updateField(event) {
    const {
      name,
      value
    } = event.target;
    setScenario(current => ({
      ...current,
      [name]: value
    }));
  }
  function resetScenario() {
    const nextQueue = (0, _decisionQueue.buildDecisionQueue)(_engine.defaultScenario);
    setScenario(_engine.defaultScenario);
    setDecision(_engine.defaultDecision);
    setQueue(nextQueue);
    setActionState((0, _decisionQueue.buildInitialActionState)(nextQueue.items));
    setSelectedSku(nextQueue.items[0]?.sku ?? null);
  }
  function runDecisionEngine() {
    const nextQueue = (0, _decisionQueue.buildDecisionQueue)(scenario);
    setDecision((0, _engine.buildDecision)(scenario));
    setQueue(nextQueue);
    setActionState(current => ({
      ...(0, _decisionQueue.buildInitialActionState)(nextQueue.items),
      ...Object.fromEntries(nextQueue.items.filter(item => current[item.sku]).map(item => [item.sku, current[item.sku]]))
    }));
    setSelectedSku(current => nextQueue.items.some(item => item.sku === current) ? current : nextQueue.items[0]?.sku ?? null);
  }
  function updateActionState(sku, value) {
    setActionState(current => ({
      ...current,
      [sku]: value
    }));
  }
  const metricVisibilityMap = {
    overview: ["Risk score", "Days of cover", "Recommended PO", "Objective mode", "Urgency"],
    procurement: ["Recommended PO", "Objective mode", "Risk score", "Urgency"],
    "supply-chain": ["Days of cover", "Objective mode", "Risk score", "Urgency"]
  };
  const visibleMetricLabels = metricVisibilityMap[focus] || metricVisibilityMap.overview;
  const visibleMetrics = decision.metrics.length > 0 ? decision.metrics.filter(metric => visibleMetricLabels.includes(metric.label)) : [];
  const visiblePanels = decision.panels.length > 0 ? decision.panels.filter(panel => {
    if (focus === "overview") {
      return true;
    }
    return panel.key === focus || panel.key === "decision-layer";
  }) : [];
  const focusedActionLabel = focus === "procurement" ? "Procurement actions" : focus === "supply-chain" ? "Supply-chain actions" : "Recommended actions";
  const focusedEmptyCopy = focus === "procurement" ? "Run the engine to see procurement-specific PO and supplier actions." : focus === "supply-chain" ? "Run the engine to see supply-chain-specific coverage and flow actions." : "Run the engine to see the next best move.";
  const focusedSummaryLabel = focus === "procurement" ? "Procurement interpretation" : focus === "supply-chain" ? "Supply-chain interpretation" : "Unified decision summary";
  const showDashboard = focus === "overview";
  const selectedItem = queue.items.find(item => item.sku === selectedSku) || queue.items[0] || null;
  function renderConditionalInputs() {
    switch (scenario.businessType) {
      case "retail":
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
          className: "conditional-input-heading"
        }, "Retail-specific inputs"), /*#__PURE__*/React.createElement("label", {
          htmlFor: "seasonalityIntensity"
        }, "Seasonality intensity (%)"), /*#__PURE__*/React.createElement("input", {
          id: "seasonalityIntensity",
          max: "100",
          min: "0",
          name: "seasonalityIntensity",
          onChange: updateField,
          type: "number",
          value: scenario.seasonalityIntensity
        }));
      case "wholesale":
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
          className: "conditional-input-heading"
        }, "Wholesale-specific inputs"), /*#__PURE__*/React.createElement("label", {
          htmlFor: "accountConcentration"
        }, "Top account concentration (%)"), /*#__PURE__*/React.createElement("input", {
          id: "accountConcentration",
          max: "100",
          min: "0",
          name: "accountConcentration",
          onChange: updateField,
          type: "number",
          value: scenario.accountConcentration
        }));
      case "manufacturing":
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
          className: "conditional-input-heading"
        }, "Manufacturing-specific inputs"), /*#__PURE__*/React.createElement("label", {
          htmlFor: "componentCriticality"
        }, "Component criticality (%)"), /*#__PURE__*/React.createElement("input", {
          id: "componentCriticality",
          max: "100",
          min: "0",
          name: "componentCriticality",
          onChange: updateField,
          type: "number",
          value: scenario.componentCriticality
        }), /*#__PURE__*/React.createElement("label", {
          htmlFor: "singleSourceRisk"
        }, "Single-source supplier risk (%)"), /*#__PURE__*/React.createElement("input", {
          id: "singleSourceRisk",
          max: "100",
          min: "0",
          name: "singleSourceRisk",
          onChange: updateField,
          type: "number",
          value: scenario.singleSourceRisk
        }));
      case "distribution":
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
          className: "conditional-input-heading"
        }, "Distribution-specific inputs"), /*#__PURE__*/React.createElement("label", {
          htmlFor: "warehouseCount"
        }, "Warehouse or node count"), /*#__PURE__*/React.createElement("input", {
          id: "warehouseCount",
          min: "1",
          name: "warehouseCount",
          onChange: updateField,
          type: "number",
          value: scenario.warehouseCount
        }), /*#__PURE__*/React.createElement("label", {
          htmlFor: "nodeImbalance"
        }, "Node imbalance risk (%)"), /*#__PURE__*/React.createElement("input", {
          id: "nodeImbalance",
          max: "100",
          min: "0",
          name: "nodeImbalance",
          onChange: updateField,
          type: "number",
          value: scenario.nodeImbalance
        }));
      case "consumerBrand":
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
          className: "conditional-input-heading"
        }, "Consumer-brand inputs"), /*#__PURE__*/React.createElement("label", {
          htmlFor: "launchIntensity"
        }, "Launch intensity (%)"), /*#__PURE__*/React.createElement("input", {
          id: "launchIntensity",
          max: "100",
          min: "0",
          name: "launchIntensity",
          onChange: updateField,
          type: "number",
          value: scenario.launchIntensity
        }), /*#__PURE__*/React.createElement("label", {
          htmlFor: "seasonalityIntensity"
        }, "Seasonality intensity (%)"), /*#__PURE__*/React.createElement("input", {
          id: "seasonalityIntensity",
          max: "100",
          min: "0",
          name: "seasonalityIntensity",
          onChange: updateField,
          type: "number",
          value: scenario.seasonalityIntensity
        }));
      case "ecommerce":
      default:
        return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
          className: "conditional-input-heading"
        }, "Ecommerce inputs"), /*#__PURE__*/React.createElement("label", {
          htmlFor: "launchIntensity"
        }, "Promotion or launch intensity (%)"), /*#__PURE__*/React.createElement("input", {
          id: "launchIntensity",
          max: "100",
          min: "0",
          name: "launchIntensity",
          onChange: updateField,
          type: "number",
          value: scenario.launchIntensity
        }), /*#__PURE__*/React.createElement("label", {
          htmlFor: "seasonalityIntensity"
        }, "Seasonality intensity (%)"), /*#__PURE__*/React.createElement("input", {
          id: "seasonalityIntensity",
          max: "100",
          min: "0",
          name: "seasonalityIntensity",
          onChange: updateField,
          type: "number",
          value: scenario.seasonalityIntensity
        }));
    }
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "app-shell"
  }, /*#__PURE__*/React.createElement("header", {
    className: "app-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Auretix app"), /*#__PURE__*/React.createElement("h1", null, title), /*#__PURE__*/React.createElement("p", {
    className: "hero-text"
  }, intro)), /*#__PURE__*/React.createElement("nav", {
    className: "app-nav"
  }, /*#__PURE__*/React.createElement(_link.default, {
    href: "/app"
  }, "Overview"), /*#__PURE__*/React.createElement(_link.default, {
    href: "/app/procurement"
  }, "Procurement"), /*#__PURE__*/React.createElement(_link.default, {
    href: "/app/supply-chain"
  }, "Supply chain"))), /*#__PURE__*/React.createElement("section", {
    className: "lab-layout app-lab-layout"
  }, showDashboard ? /*#__PURE__*/React.createElement("section", {
    className: "dashboard-stack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dashboard-overview-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Highest risk SKU"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.highestRiskSku), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "Risk score: ", queue.overview.highestRiskScore, "/100")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Monthly profit leader"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.topProfitSku), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "Estimated monthly profit: $", queue.overview.topProfitValue)), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Highest efficiency SKU"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.topGrowthSku), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "Capital efficiency: ", queue.overview.topGrowthValue)), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Margin leak to watch"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.marginLeakSku), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "Gross margin: ", queue.overview.marginLeakValue, "%")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "If cash is limited"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.cashProtectedOrder), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "Auretix would protect these first before funding lower-priority items.")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Current strategy"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.objectiveLabel), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "The queue and action paths are being optimized for this business objective.")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Scenario mode"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.scenarioLabel), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "This shows which future condition the portfolio is currently being tested against."))), /*#__PURE__*/React.createElement("div", {
    className: "dashboard-overview-grid playbook-strip"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-block playbook-block protect-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Protect"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.playbookSummary.protect), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "SKUs where continuity, revenue, or account confidence must be protected.")), /*#__PURE__*/React.createElement("div", {
    className: "result-block playbook-block grow-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Grow"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.playbookSummary.grow), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "SKUs that deserve more funding because demand and economics are working.")), /*#__PURE__*/React.createElement("div", {
    className: "result-block playbook-block fix-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Fix"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.playbookSummary.fix), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "SKUs that need margin, supplier, or planning repair before scaling harder.")), /*#__PURE__*/React.createElement("div", {
    className: "result-block playbook-block deprioritize-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Deprioritize"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.playbookSummary.deprioritize), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "SKUs that should run lean until they earn capital priority again."))), /*#__PURE__*/React.createElement("div", {
    className: "dashboard-overview-grid inventory-summary-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Tracked SKUs"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.items.length), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "Items currently in the decision queue.")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Total on hand"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.totalOnHand), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "Units currently available across the tracked portfolio.")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Inbound units"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.totalInbound), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "Units in transit or arriving on open purchase orders.")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Reserved units"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.totalReserved), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "Units already committed to demand or allocation.")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Below reorder point"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.belowReorderCount), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "SKUs already under the inventory level where replenishment should start.")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Excess inventory"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, queue.overview.excessCount), /*#__PURE__*/React.createElement("div", {
    className: "result-meta"
  }, "SKUs carrying more inventory than current demand needs."))), /*#__PURE__*/React.createElement("div", {
    className: "lab-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "results-header"
  }, /*#__PURE__*/React.createElement("h3", null, "Decision queue"), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, "Multi-SKU")), /*#__PURE__*/React.createElement("div", {
    className: "queue-table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "queue-table-header"
  }, /*#__PURE__*/React.createElement("span", null, "SKU"), /*#__PURE__*/React.createElement("span", null, "Lane"), /*#__PURE__*/React.createElement("span", null, "Risk"), /*#__PURE__*/React.createElement("span", null, "Priority"), /*#__PURE__*/React.createElement("span", null, "Role"), /*#__PURE__*/React.createElement("span", null, "Available"), /*#__PURE__*/React.createElement("span", null, "ROP"), /*#__PURE__*/React.createElement("span", null, "ETA"), /*#__PURE__*/React.createElement("span", null, "Margin"), /*#__PURE__*/React.createElement("span", null, "Monthly profit"), /*#__PURE__*/React.createElement("span", null, "Recommended PO"), /*#__PURE__*/React.createElement("span", null, "Cash")), queue.items.map(item => /*#__PURE__*/React.createElement("button", {
    className: `queue-table-row queue-table-button${selectedItem?.sku === item.sku ? " selected-row" : ""}`,
    key: item.sku,
    onClick: () => setSelectedSku(item.sku),
    type: "button"
  }, /*#__PURE__*/React.createElement("span", null, item.sku), /*#__PURE__*/React.createElement("span", null, item.playbookLabel), /*#__PURE__*/React.createElement("span", null, item.riskScore, "/100"), /*#__PURE__*/React.createElement("span", null, item.priority), /*#__PURE__*/React.createElement("span", null, item.roleLabel), /*#__PURE__*/React.createElement("span", null, item.availableUnits), /*#__PURE__*/React.createElement("span", null, item.reorderPointUnits), /*#__PURE__*/React.createElement("span", null, item.nextEtaDays, "d"), /*#__PURE__*/React.createElement("span", null, item.grossMarginPct, "%"), /*#__PURE__*/React.createElement("span", null, "$", item.monthlyProfit), /*#__PURE__*/React.createElement("span", null, item.reorderUnits), /*#__PURE__*/React.createElement("span", null, "$", item.cashImpact))))), /*#__PURE__*/React.createElement("div", {
    className: "decision-panel-grid"
  }, queue.topActions.map(item => /*#__PURE__*/React.createElement("div", {
    className: "decision-panel active-panel",
    key: `${item.rank}-${item.sku}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "decision-panel-header"
  }, /*#__PURE__*/React.createElement("h4", null, "#", item.rank, " ", item.sku), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, item.badge)), /*#__PURE__*/React.createElement("div", {
    className: "result-label inline-summary-label"
  }, item.title), /*#__PURE__*/React.createElement("p", {
    className: "queue-action-copy"
  }, item.detail)))), /*#__PURE__*/React.createElement("div", {
    className: "lab-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "results-header"
  }, /*#__PURE__*/React.createElement("h3", null, "Execution board"), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, "Today / This Week / Later")), /*#__PURE__*/React.createElement("div", {
    className: "execution-board"
  }, /*#__PURE__*/React.createElement("div", {
    className: "execution-column"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Today"), queue.executionBoard.today.length > 0 ? queue.executionBoard.today.map(item => /*#__PURE__*/React.createElement("div", {
    className: "execution-card",
    key: `today-${item.sku}`
  }, /*#__PURE__*/React.createElement("strong", null, item.sku), /*#__PURE__*/React.createElement("p", null, item.detail))) : /*#__PURE__*/React.createElement("div", {
    className: "execution-card empty-card"
  }, "No immediate actions right now.")), /*#__PURE__*/React.createElement("div", {
    className: "execution-column"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "This week"), queue.executionBoard.thisWeek.length > 0 ? queue.executionBoard.thisWeek.map(item => /*#__PURE__*/React.createElement("div", {
    className: "execution-card",
    key: `week-${item.sku}`
  }, /*#__PURE__*/React.createElement("strong", null, item.sku), /*#__PURE__*/React.createElement("p", null, item.detail))) : /*#__PURE__*/React.createElement("div", {
    className: "execution-card empty-card"
  }, "No this-week actions queued.")), /*#__PURE__*/React.createElement("div", {
    className: "execution-column"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Later"), queue.executionBoard.later.length > 0 ? queue.executionBoard.later.map(item => /*#__PURE__*/React.createElement("div", {
    className: "execution-card",
    key: `later-${item.sku}`
  }, /*#__PURE__*/React.createElement("strong", null, item.sku), /*#__PURE__*/React.createElement("p", null, item.detail))) : /*#__PURE__*/React.createElement("div", {
    className: "execution-card empty-card"
  }, "No later-stage follow-ups queued.")))), /*#__PURE__*/React.createElement("div", {
    className: "lab-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "results-header"
  }, /*#__PURE__*/React.createElement("h3", null, "Portfolio-wide solutions"), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, "Strategy-aware")), /*#__PURE__*/React.createElement("ul", {
    className: "action-list"
  }, queue.portfolioRecommendations.map(item => /*#__PURE__*/React.createElement("li", {
    key: item
  }, item)))), selectedItem ? /*#__PURE__*/React.createElement("div", {
    className: "lab-card sku-detail-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "results-header"
  }, /*#__PURE__*/React.createElement("h3", null, selectedItem.sku, " detail"), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, selectedItem.priority)), /*#__PURE__*/React.createElement("div", {
    className: "dashboard-overview-grid sku-detail-metrics"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Playbook lane"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, selectedItem.playbookLabel)), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Role"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, selectedItem.roleLabel)), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Risk score"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, selectedItem.riskScore, "/100")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Gross margin"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, selectedItem.grossMarginPct, "%")), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Monthly profit"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, "$", selectedItem.monthlyProfit)), /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Capital efficiency"), /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, selectedItem.capitalEfficiency))), /*#__PURE__*/React.createElement("div", {
    className: "decision-panel-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "decision-panel active-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "decision-panel-header"
  }, /*#__PURE__*/React.createElement("h4", null, "Why it is risky"), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, "Reasons")), /*#__PURE__*/React.createElement("ul", {
    className: "action-list"
  }, selectedItem.riskReasons.map(reason => /*#__PURE__*/React.createElement("li", {
    key: reason
  }, reason)))), /*#__PURE__*/React.createElement("div", {
    className: "decision-panel active-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "decision-panel-header"
  }, /*#__PURE__*/React.createElement("h4", null, "Why this lane"), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, selectedItem.playbookLabel)), /*#__PURE__*/React.createElement("ul", {
    className: "action-list"
  }, selectedItem.playbookReasons.map(reason => /*#__PURE__*/React.createElement("li", {
    key: reason
  }, reason))))), /*#__PURE__*/React.createElement("div", {
    className: "tracker-table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tracker-table-header action-path-header"
  }, /*#__PURE__*/React.createElement("span", null, "Path"), /*#__PURE__*/React.createElement("span", null, "Outcome"), /*#__PURE__*/React.createElement("span", null, "Cash impact")), selectedItem.actionPaths.map(path => /*#__PURE__*/React.createElement("div", {
    className: "tracker-table-row action-path-row",
    key: path.key
  }, /*#__PURE__*/React.createElement("span", null, path.label), /*#__PURE__*/React.createElement("span", null, path.outcome), /*#__PURE__*/React.createElement("span", null, path.cashImpact))))) : null, /*#__PURE__*/React.createElement("div", {
    className: "lab-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "results-header"
  }, /*#__PURE__*/React.createElement("h3", null, "Action tracker"), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, queue.overview.atRiskCount, " active risks")), /*#__PURE__*/React.createElement("div", {
    className: "tracker-table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tracker-table-header"
  }, /*#__PURE__*/React.createElement("span", null, "SKU"), /*#__PURE__*/React.createElement("span", null, "Lane"), /*#__PURE__*/React.createElement("span", null, "Priority"), /*#__PURE__*/React.createElement("span", null, "Action"), /*#__PURE__*/React.createElement("span", null, "Status")), queue.items.slice(0, 6).map(item => /*#__PURE__*/React.createElement("div", {
    className: "tracker-table-row",
    key: `tracker-${item.sku}`
  }, /*#__PURE__*/React.createElement("span", null, item.sku), /*#__PURE__*/React.createElement("span", null, item.playbookLabel), /*#__PURE__*/React.createElement("span", null, item.priority), /*#__PURE__*/React.createElement("span", null, item.action), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("select", {
    className: "tracker-select",
    onChange: event => updateActionState(item.sku, event.target.value),
    value: actionState[item.sku] || "Open"
  }, /*#__PURE__*/React.createElement("option", {
    value: "Open"
  }, "Open"), /*#__PURE__*/React.createElement("option", {
    value: "Approved"
  }, "Approved"), /*#__PURE__*/React.createElement("option", {
    value: "Watching"
  }, "Watching"), /*#__PURE__*/React.createElement("option", {
    value: "Deferred"
  }, "Deferred"), /*#__PURE__*/React.createElement("option", {
    value: "Done"
  }, "Done")))))))) : null, /*#__PURE__*/React.createElement("section", {
    className: "lab-card controls-card"
  }, /*#__PURE__*/React.createElement("h3", null, "Business inputs"), /*#__PURE__*/React.createElement("label", {
    htmlFor: "businessType"
  }, "Business type"), /*#__PURE__*/React.createElement("select", {
    id: "businessType",
    name: "businessType",
    onChange: updateField,
    value: scenario.businessType
  }, /*#__PURE__*/React.createElement("option", {
    value: "ecommerce"
  }, "Ecommerce"), /*#__PURE__*/React.createElement("option", {
    value: "retail"
  }, "Retail"), /*#__PURE__*/React.createElement("option", {
    value: "wholesale"
  }, "Wholesale"), /*#__PURE__*/React.createElement("option", {
    value: "manufacturing"
  }, "Manufacturing"), /*#__PURE__*/React.createElement("option", {
    value: "distribution"
  }, "Distribution"), /*#__PURE__*/React.createElement("option", {
    value: "consumerBrand"
  }, "Consumer brand")), /*#__PURE__*/React.createElement("label", {
    htmlFor: "businessScale"
  }, "Business scale"), /*#__PURE__*/React.createElement("select", {
    id: "businessScale",
    name: "businessScale",
    onChange: updateField,
    value: scenario.businessScale
  }, /*#__PURE__*/React.createElement("option", {
    value: "small"
  }, "Small business"), /*#__PURE__*/React.createElement("option", {
    value: "growth"
  }, "Growth stage"), /*#__PURE__*/React.createElement("option", {
    value: "midmarket"
  }, "Mid-market"), /*#__PURE__*/React.createElement("option", {
    value: "enterprise"
  }, "Enterprise")), /*#__PURE__*/React.createElement("label", {
    htmlFor: "objectiveMode"
  }, "Business objective"), /*#__PURE__*/React.createElement("select", {
    id: "objectiveMode",
    name: "objectiveMode",
    onChange: updateField,
    value: scenario.objectiveMode
  }, /*#__PURE__*/React.createElement("option", {
    value: "service"
  }, "Protect service levels"), /*#__PURE__*/React.createElement("option", {
    value: "cash"
  }, "Protect cash"), /*#__PURE__*/React.createElement("option", {
    value: "growth"
  }, "Protect growth")), /*#__PURE__*/React.createElement("label", {
    htmlFor: "scenarioMode"
  }, "Scenario mode"), /*#__PURE__*/React.createElement("select", {
    id: "scenarioMode",
    name: "scenarioMode",
    onChange: updateField,
    value: scenario.scenarioMode
  }, /*#__PURE__*/React.createElement("option", {
    value: "normal"
  }, "Normal"), /*#__PURE__*/React.createElement("option", {
    value: "supplierDelay"
  }, "Supplier delay"), /*#__PURE__*/React.createElement("option", {
    value: "demandSpike"
  }, "Demand spike")), /*#__PURE__*/React.createElement("label", {
    htmlFor: "monthlyUnits"
  }, "Monthly units sold"), /*#__PURE__*/React.createElement("input", {
    id: "monthlyUnits",
    min: "1",
    name: "monthlyUnits",
    onChange: updateField,
    type: "number",
    value: scenario.monthlyUnits
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "inventory"
  }, "Current inventory on hand"), /*#__PURE__*/React.createElement("input", {
    id: "inventory",
    min: "0",
    name: "inventory",
    onChange: updateField,
    type: "number",
    value: scenario.inventory
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "leadTime"
  }, "Supplier lead time (days)"), /*#__PURE__*/React.createElement("input", {
    id: "leadTime",
    min: "1",
    name: "leadTime",
    onChange: updateField,
    type: "number",
    value: scenario.leadTime
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "supplierReliability"
  }, "Supplier reliability (%)"), /*#__PURE__*/React.createElement("input", {
    id: "supplierReliability",
    max: "100",
    min: "0",
    name: "supplierReliability",
    onChange: updateField,
    type: "number",
    value: scenario.supplierReliability
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "growthRate"
  }, "Expected sales growth next month (%)"), /*#__PURE__*/React.createElement("input", {
    id: "growthRate",
    max: "300",
    min: "-100",
    name: "growthRate",
    onChange: updateField,
    type: "number",
    value: scenario.growthRate
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "margin"
  }, "Gross margin (%)"), /*#__PURE__*/React.createElement("input", {
    id: "margin",
    max: "100",
    min: "0",
    name: "margin",
    onChange: updateField,
    type: "number",
    value: scenario.margin
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "cashRunway"
  }, "Cash runway for inventory buys (days)"), /*#__PURE__*/React.createElement("input", {
    id: "cashRunway",
    min: "1",
    name: "cashRunway",
    onChange: updateField,
    type: "number",
    value: scenario.cashRunway
  }), renderConditionalInputs(), /*#__PURE__*/React.createElement("div", {
    className: "button-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: "button button-primary",
    onClick: runDecisionEngine,
    type: "button"
  }, "Run Auretix"), /*#__PURE__*/React.createElement("button", {
    className: "button button-secondary",
    onClick: resetScenario,
    type: "button"
  }, "Reset")), /*#__PURE__*/React.createElement("div", {
    className: "engine-pillars-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "5 core engine pillars"), /*#__PURE__*/React.createElement("ul", {
    className: "action-list"
  }, /*#__PURE__*/React.createElement("li", null, "Prevent stockouts before they cost revenue."), /*#__PURE__*/React.createElement("li", null, "Control overbuying so cash is not trapped."), /*#__PURE__*/React.createElement("li", null, "Improve reorder timing and PO sizing."), /*#__PURE__*/React.createElement("li", null, "Reduce supplier and inbound uncertainty."), /*#__PURE__*/React.createElement("li", null, "Protect cash flow while the business grows.")))), /*#__PURE__*/React.createElement("section", {
    className: "lab-card results-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "results-header"
  }, /*#__PURE__*/React.createElement("h3", null, "Engine output"), /*#__PURE__*/React.createElement("span", {
    className: `decision-badge ${decision.badgeLevel}`
  }, decision.badgeText)), /*#__PURE__*/React.createElement("div", {
    className: "result-label summary-label"
  }, focusedSummaryLabel), /*#__PURE__*/React.createElement("div", {
    className: "result-summary"
  }, decision.summary), /*#__PURE__*/React.createElement("div", {
    className: "result"
  }, visibleMetrics.map(metric => /*#__PURE__*/React.createElement(MetricCard, {
    key: metric.label,
    metric: metric
  }))), /*#__PURE__*/React.createElement("div", {
    className: "decision-panel-grid"
  }, visiblePanels.length > 0 ? visiblePanels.map(panel => /*#__PURE__*/React.createElement(DecisionPanel, {
    isActive: focus !== "overview" && panel.key === focus,
    key: panel.title,
    panel: panel
  })) : /*#__PURE__*/React.createElement("div", {
    className: "decision-panel decision-panel-empty"
  }, /*#__PURE__*/React.createElement("div", {
    className: "decision-panel-header"
  }, /*#__PURE__*/React.createElement("h4", null, "Combined decision output"), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, "Run engine")), /*#__PURE__*/React.createElement("p", null, "Auretix will split the result into procurement, supply chain, and a unified next move once you run a seller scenario."))), /*#__PURE__*/React.createElement("div", {
    className: "action-stack"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, focusedActionLabel), /*#__PURE__*/React.createElement("ul", {
    className: "action-list"
  }, decision.actions.length > 0 ? decision.actions.map(action => /*#__PURE__*/React.createElement("li", {
    key: action
  }, action)) : /*#__PURE__*/React.createElement("li", null, focusedEmptyCopy))), decision.supportTier ? /*#__PURE__*/React.createElement("div", {
    className: "result-block support-block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-label"
  }, "Suggested support tier"), /*#__PURE__*/React.createElement("div", {
    className: "support-tier-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "result-value"
  }, decision.supportTier.name), /*#__PURE__*/React.createElement("span", {
    className: "tier-chip"
  }, decision.supportTier.price)), /*#__PURE__*/React.createElement("div", {
    className: "result-copy"
  }, decision.supportTier.reason)) : null))));
}