"use client";

import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useState } from "react";
import {
  buildDecisionQueue,
  buildInitialActionState,
} from "../lib/decision-queue";
import { buildDecision, defaultDecision, defaultScenario } from "../lib/engine";
import { getSeededWorkspace } from "../lib/seeded-workspace";

function MetricCard({ metric }) {
  return (
    <div className="result-block">
      <div className="result-label">{metric.label}</div>
      <div className="result-value">{metric.value}</div>
      <div className="result-meta">{metric.detail}</div>
    </div>
  );
}

function DecisionPanel({ panel, isActive }) {
  return (
    <div className={`decision-panel${isActive ? " active-panel" : ""}`}>
      <div className="decision-panel-header">
        <h4>{panel.title}</h4>
        <span className="tier-chip">{panel.badge}</span>
      </div>
      <ul className="action-list">
        {panel.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

function buildSyncChannels(workspace, lastEventLabel = "Seeded workspace loaded") {
  return workspace.channels.map((channel, index) => ({
    id: channel.toLowerCase().replace(/\s+/g, "-"),
    name: channel,
    connectionStatus:
      channel === "Amazon" || channel === "Store" ? "Connected" : "Standby",
    syncMode: channel === "Amazon" ? "Live webhook + poll" : "Mirror sync",
    lastSyncLabel: lastEventLabel,
    health: index === 0 ? "Healthy" : index === 1 ? "Watching" : "Ready",
  }));
}

function createSyncEvent({ title, detail, sku, channel, quantity }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    detail,
    sku,
    channel,
    quantity,
    timeLabel: "Just now",
  };
}

function createStatusHistoryEntry(status, detail) {
  return {
    status,
    detail,
    timeLabel: "Just now",
  };
}

function createFollowUpEntry(note, communicationState, escalationFlag) {
  return {
    note,
    communicationState,
    escalationFlag,
    timeLabel: "Just now",
  };
}

function formatSupplierTemplate(template, deliveryMode) {
  if (deliveryMode === "chat") {
    return [
      `${template.mode} | ${template.channel}`,
      `Subject: ${template.subject}`,
      template.body.replace(/\n{2,}/g, "\n").trim(),
    ].join("\n");
  }

  return `Subject: ${template.subject}\n\n${template.body}`;
}

function buildSupplierRelationshipRows(suppliers, packets, purchaseOrders) {
  return suppliers.map((supplier) => {
    const supplierPackets = packets.filter((packet) => packet.supplierName === supplier.name);
    const supplierPos = purchaseOrders.filter((po) => po.supplierName === supplier.name);
    const exportHistory = supplierPackets.flatMap((packet) => packet.exportHistory || []);
    const messagesPrepared = exportHistory.length;
    const sentCount = exportHistory.filter((entry) => entry.outboundStatus === "sent").length;
    const repliedCount = exportHistory.filter((entry) => entry.outboundStatus === "replied").length;
    const noResponseCount = exportHistory.filter(
      (entry) => entry.outboundStatus === "no_response",
    ).length;
    const resolvedCount = exportHistory.filter(
      (entry) => entry.outboundStatus === "resolved",
    ).length;
    const escalationCount =
      supplierPos.filter((po) => po.escalationFlag).length +
      supplierPackets.reduce(
        (sum, packet) =>
          sum +
          (packet.issueFlags || []).filter(
            (flag) => flag === "Escalation raised" || flag === "Issue raised with supplier",
          ).length,
        0,
      );
    const openIssues = supplierPos.filter(
      (po) =>
        po.communicationState === "issue_raised" ||
        po.communicationState === "waiting_on_supplier" ||
        po.status === "delayed",
    ).length;
    const responseRate = messagesPrepared > 0 ? Math.round((repliedCount / messagesPrepared) * 100) : 0;
    const responseSpeedLabel =
      repliedCount >= noResponseCount + 1
        ? "Responsive"
        : noResponseCount >= Math.max(1, repliedCount)
          ? "Slow response"
          : sentCount > 0
            ? "Awaiting reply"
            : "No signal yet";
    const dragSignal =
      escalationCount >= 3 || noResponseCount >= 2 || openIssues >= 2
        ? "High drag"
        : escalationCount >= 1 || openIssues >= 1
          ? "Medium drag"
          : "Low drag";

    return {
      id: supplier.id,
      name: supplier.name,
      messagesPrepared,
      sentCount,
      repliedCount,
      noResponseCount,
      resolvedCount,
      escalationCount,
      openIssues,
      responseRate,
      responseSpeedLabel,
      dragSignal,
    };
  });
}

function buildSupplierExposurePortfolio(
  relationshipRows,
  purchaseOrders,
  procurementRecommendations,
  strategyMemory = {},
) {
  const rows = relationshipRows.map((supplier) => {
    const memory = strategyMemory[supplier.id] || null;
    const livePos = purchaseOrders.filter((po) => po.supplierName === supplier.name);
    const liveUnits = livePos.reduce((sum, po) => sum + po.units, 0);
    const liveValue = livePos.reduce((sum, po) => sum + po.value, 0);

    let plannedUnits = 0;
    let plannedValue = 0;

    for (const recommendation of procurementRecommendations) {
      const [currentComparison, alternateComparison] =
        recommendation.supplierComparisons || [];

      if (!currentComparison) {
        continue;
      }

      const addExposure = (comparison, share) => {
        if (!comparison || comparison.name !== supplier.name) {
          return;
        }

        const allocatedUnits = Math.round(recommendation.bestBuyUnits * share);
        plannedUnits += allocatedUnits;
        plannedValue += Math.round(allocatedUnits * comparison.landedUnitCost);
      };

      if (recommendation.recommendedAward === "Shift") {
        addExposure(alternateComparison || currentComparison, 1);
      } else if (recommendation.recommendedAward === "Split") {
        addExposure(currentComparison, 0.55);
        addExposure(alternateComparison, 0.45);
      } else {
        addExposure(currentComparison, 1);
      }
    }

    const totalUnits = liveUnits + plannedUnits;
    const totalValue = liveValue + plannedValue;
    const concentrationSignal =
      (memory?.strategy === "exit" && totalUnits > 0) ||
      (memory?.strategy === "reduce" && plannedUnits > 0)
        ? "Overexposed"
        : supplier.dragSignal === "High drag" && totalUnits > 0
          ? "Risk building"
          : memory?.strategy === "preferred" && plannedUnits > 0
            ? "Preferred lane"
            : "Balanced";

    return {
      id: supplier.id,
      supplierName: supplier.name,
      strategy: memory?.strategy || "neutral",
      liveUnits,
      plannedUnits,
      totalUnits,
      liveValue,
      plannedValue,
      totalValue,
      responseRate: supplier.responseRate,
      dragSignal: supplier.dragSignal,
      openIssues: supplier.openIssues,
      escalationCount: supplier.escalationCount,
      concentrationSignal,
    };
  });

  const recommendations = rows
    .map((row) => {
      if (row.strategy === "exit" && row.totalUnits > 0) {
        return {
          id: `${row.id}-rebalance`,
          supplierName: row.supplierName,
          title: `Rebalance away from ${row.supplierName}`,
          badge: "Exit exposure",
          detail: `${row.totalUnits} units are still tied to an Exit supplier. Auretix would stop routing new planned buys here and actively transfer future demand into preferred alternates.`,
        };
      }

      if (row.strategy === "reduce" && row.plannedUnits > 0) {
        return {
          id: `${row.id}-reduce`,
          supplierName: row.supplierName,
          title: `Trim planned volume with ${row.supplierName}`,
          badge: "Reduce exposure",
          detail: `${row.plannedUnits} planned units are still flowing toward a Reduce supplier. Auretix would rebalance part of that future volume before the next release cycle.`,
        };
      }

      if (row.dragSignal === "High drag" && row.liveUnits > 0) {
        return {
          id: `${row.id}-drag`,
          supplierName: row.supplierName,
          title: `Contain drag from ${row.supplierName}`,
          badge: "Contain risk",
          detail: `${row.liveUnits} live units and ${row.openIssues} open issues are still sitting with a high-drag supplier. Auretix would tighten follow-up and reduce dependency until response quality recovers.`,
        };
      }

      if (row.strategy === "preferred" && row.responseRate >= 60) {
        return {
          id: `${row.id}-preferred`,
          supplierName: row.supplierName,
          title: `Lean into ${row.supplierName} for continuity buys`,
          badge: "Preferred lane",
          detail: `${row.supplierName} is carrying a preferred strategy with a ${row.responseRate}% response rate. Auretix would keep this supplier favored for time-sensitive replenishment.`,
        };
      }

      return null;
    })
    .filter(Boolean)
    .slice(0, 4);

  return {
    rows,
    recommendations,
  };
}

function createDecisionOutcomeEntry({
  stage,
  title,
  detail,
  subject,
  status = "Open",
  impact = "",
}) {
  return {
    id: `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stage,
    title,
    detail,
    subject,
    status,
    impact,
    timeLabel: new Date().toLocaleString(),
  };
}

function createFixPlanFromInsight(insight) {
  return {
    id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    insightId: insight.id,
    title: insight.title,
    owner: insight.title.toLowerCase().includes("supplier")
      ? "Procurement lead"
      : insight.title.toLowerCase().includes("cash")
        ? "Finance lead"
        : "Operations lead",
    dueWindow: insight.count >= 3 ? "Start this week" : "Review this cycle",
    status: "Open",
    summary: insight.fixPath,
    createdAt: new Date().toLocaleString(),
  };
}

function buildFixPlanStatusForInsight(insightId, fixPlans = []) {
  const linkedPlans = fixPlans.filter((plan) => plan.insightId === insightId);

  if (linkedPlans.length === 0) {
    return {
      label: "Unmanaged",
      detail: "No permanent fix initiative is currently attached to this recurring issue.",
    };
  }

  if (linkedPlans.some((plan) => plan.status === "In progress")) {
    return {
      label: "Actively treated",
      detail: "A fix plan is in progress against this recurring issue.",
    };
  }

  if (linkedPlans.some((plan) => plan.status === "Open")) {
    return {
      label: "Planned",
      detail: "A fix plan has been opened, but work has not started yet.",
    };
  }

  return {
    label: "Closed loop",
    detail: "A fix plan was completed for this recurring issue. Watch for recurrence to validate the fix held.",
  };
}

function buildChangeDiffRows(diff = []) {
  return Array.isArray(diff) ? diff.filter(Boolean) : [];
}

function buildDailyChangeEntries(previousQueue, nextQueue, triggerEvent = null) {
  if (!previousQueue || !nextQueue) {
    return [];
  }

  const entries = [];
  const nextItemsById = Object.fromEntries((nextQueue.items || []).map((item) => [item.id, item]));
  const nextItemsBySku = Object.fromEntries((nextQueue.items || []).map((item) => [item.sku, item]));
  const nextPoByProductId = Object.fromEntries(
    (nextQueue.workspace.purchaseOrders || [])
      .flatMap((po) =>
        (po.lineItems || []).map((line) => [
          line.productId,
          {
            poId: po.id,
          },
        ]),
      )
      .filter(Boolean),
  );
  const previousAnomalies = new Set(
    (previousQueue.workspace.anomalies || []).map((anomaly) => anomaly.title),
  );
  const nextAnomalies = new Set(
    (nextQueue.workspace.anomalies || []).map((anomaly) => anomaly.title),
  );
  const nextAnomaliesByTitle = Object.fromEntries(
    (nextQueue.workspace.anomalies || []).map((anomaly) => [anomaly.title, anomaly]),
  );
  const previousHighestRiskItem =
    (previousQueue.items || []).find((item) => item.name === previousQueue.overview.highestRiskSku) ||
    null;
  const nextHighestRiskItem =
    (nextQueue.items || []).find((item) => item.name === nextQueue.overview.highestRiskSku) || null;
  const buildDueLabel = (priority = "Review soon") =>
    priority === "Act now"
      ? "Due today"
      : priority === "Move this week"
        ? "Due this week"
        : "Review this cycle";

  if (previousQueue.overview.highestRiskSku !== nextQueue.overview.highestRiskSku) {
    entries.push({
      id: `change-highest-risk-${Date.now()}`,
      title: "Highest-risk SKU changed",
      detail: `${previousQueue.overview.highestRiskSku} was displaced by ${nextQueue.overview.highestRiskSku} as the portfolio's top risk.`,
      badge: "Risk shift",
      group: "Worsened",
      target: nextHighestRiskItem
        ? nextPoByProductId[nextHighestRiskItem.id]
          ? {
              sectionId: "open-purchase-orders-section",
              sku: nextHighestRiskItem.sku,
              poId: nextPoByProductId[nextHighestRiskItem.id].poId,
            }
          : {
              sectionId: "decision-queue-section",
              sku: nextHighestRiskItem.sku,
            }
        : null,
      diff: buildChangeDiffRows([
        {
          label: "Highest-risk SKU",
          before: previousQueue.overview.highestRiskSku,
          after: nextQueue.overview.highestRiskSku,
        },
        {
          label: "Risk score",
          before: `${previousQueue.overview.highestRiskScore}/100`,
          after: `${nextQueue.overview.highestRiskScore}/100`,
        },
      ]),
      explanation:
        nextHighestRiskItem?.riskReason ||
        `${nextQueue.overview.highestRiskSku} rose to the top because its current service, inventory, or inbound profile deteriorated relative to the rest of the portfolio.`,
      owner: nextHighestRiskItem?.owner || "Operations lead",
      followUpDue: buildDueLabel(nextHighestRiskItem?.priority),
      timeLabel: new Date().toLocaleString(),
    });
  }

  const newAnomalies = [...nextAnomalies].filter((title) => !previousAnomalies.has(title));
  if (newAnomalies.length > 0) {
    const anomaly = nextAnomaliesByTitle[newAnomalies[0]];
    const anomalyItem =
      (anomaly &&
        (nextQueue.items || []).find((item) => anomaly.id.includes(item.id) || anomaly.title.includes(item.name))) ||
      null;
    entries.push({
      id: `change-anomaly-new-${Date.now()}`,
      title: "New anomaly detected",
      detail: `${newAnomalies[0]} entered the operating picture and needs review.`,
      badge: "New risk",
      group: "New",
      target: anomaly?.id?.includes("anomaly-supplier")
        ? {
            sectionId: "supplier-relationship-section",
          }
        : anomalyItem
          ? nextPoByProductId[anomalyItem.id]
            ? {
                sectionId: "open-purchase-orders-section",
                sku: anomalyItem.sku,
                poId: nextPoByProductId[anomalyItem.id].poId,
              }
            : {
                sectionId: "decision-queue-section",
                sku: anomalyItem.sku,
              }
          : null,
      diff: buildChangeDiffRows([
        {
          label: "Anomaly count",
          before: `${previousQueue.workspace.anomalies.length}`,
          after: `${nextQueue.workspace.anomalies.length}`,
        },
        anomalyItem
          ? {
              label: "Affected SKU",
              before: "Not flagged",
              after: anomalyItem.sku,
            }
          : null,
      ]),
      explanation:
        anomaly?.detail ||
        `${newAnomalies[0]} appeared because the latest planning cycle crossed a threshold on demand, margin, coverage, or supplier performance.`,
      owner: anomaly?.owner || anomalyItem?.owner || "Planner",
      followUpDue:
        anomaly?.severity === "High"
          ? "Due today"
          : anomaly?.severity === "Medium"
            ? "Due this week"
            : "Review this cycle",
      timeLabel: new Date().toLocaleString(),
    });
  }

  const resolvedAnomalies = [...previousAnomalies].filter((title) => !nextAnomalies.has(title));
  if (resolvedAnomalies.length > 0) {
    const resolvedTitle = resolvedAnomalies[0];
    const previousItem =
      (previousQueue.items || []).find((item) => resolvedTitle.includes(item.name) || resolvedTitle.includes(item.id)) ||
      previousHighestRiskItem;
    entries.push({
      id: `change-anomaly-resolved-${Date.now()}`,
      title: "Risk resolved",
      detail: `${resolvedTitle} dropped out of the anomaly list in the latest cycle.`,
      badge: "Resolved",
      group: "Resolved",
      target: previousItem
        ? {
            sectionId: "decision-queue-section",
            sku: nextItemsById[previousItem.id]?.sku || nextItemsBySku[previousItem.sku]?.sku || previousItem.sku,
          }
        : null,
      diff: buildChangeDiffRows([
        {
          label: "Anomaly count",
          before: `${previousQueue.workspace.anomalies.length}`,
          after: `${nextQueue.workspace.anomalies.length}`,
        },
        previousItem
          ? {
              label: "Affected SKU",
              before: previousItem.sku,
              after: nextItemsById[previousItem.id]?.sku || previousItem.sku,
            }
          : null,
      ]),
      explanation:
        `${resolvedTitle} is no longer breaching the same threshold, which usually means inventory coverage, supplier timing, or demand pressure improved in the latest cycle.`,
      owner: previousItem?.owner || "Operations lead",
      followUpDue: "Confirm next cycle",
      timeLabel: new Date().toLocaleString(),
    });
  }

  const previousCash = previousQueue.overview.totalImmediateCash || 0;
  const nextCash = nextQueue.overview.totalImmediateCash || 0;
  const cashDelta = nextCash - previousCash;
  if (cashDelta !== 0) {
    entries.push({
      id: `change-cash-${Date.now()}`,
      title: "Immediate cash exposure moved",
      detail:
        cashDelta > 0
          ? `Immediate cash exposure increased by $${cashDelta} in the latest planning cycle.`
          : `Immediate cash exposure dropped by $${Math.abs(cashDelta)} in the latest planning cycle.`,
      badge: cashDelta > 0 ? "Cash up" : "Cash down",
      group: cashDelta > 0 ? "Worsened" : "Resolved",
      target: {
        sectionId: "decision-queue-section",
        sku: nextHighestRiskItem?.sku || nextQueue.items[0]?.sku || null,
      },
      diff: buildChangeDiffRows([
        {
          label: "Immediate cash",
          before: `$${previousCash}`,
          after: `$${nextCash}`,
        },
        {
          label: "Pending decisions",
          before: `${previousQueue.items.filter((item) => item.priority === "Act now").length} urgent`,
          after: `${nextQueue.items.filter((item) => item.priority === "Act now").length} urgent`,
        },
      ]),
      explanation:
        cashDelta > 0
          ? "Auretix believes cash pressure worsened because the latest recommended buys, risk posture, or urgency mix now requires more near-term funding."
          : "Auretix believes cash pressure eased because the latest cycle reduced near-term buy pressure or improved the risk mix across urgent items.",
      owner: "Finance lead",
      followUpDue: cashDelta > 0 ? "Due today" : "Review this week",
      timeLabel: new Date().toLocaleString(),
    });
  }

  if (triggerEvent?.detail) {
    entries.push({
      id: `change-trigger-${Date.now()}`,
      title: triggerEvent.title || "Workspace updated",
      detail: triggerEvent.detail,
      badge: "Activity",
      group: "New",
      target:
        triggerEvent.channel === "Procurement"
          ? {
              sectionId: "open-purchase-orders-section",
            }
          : {
              sectionId: "decision-queue-section",
              sku: nextHighestRiskItem?.sku || nextQueue.items[0]?.sku || null,
            },
      diff: buildChangeDiffRows([
        {
          label: "Open alerts",
          before: `${previousQueue.workspace.alerts.length}`,
          after: `${nextQueue.workspace.alerts.length}`,
        },
        {
          label: "Top risk SKU",
          before: previousQueue.overview.highestRiskSku,
          after: nextQueue.overview.highestRiskSku,
        },
      ]),
      explanation:
        `${triggerEvent.title || "This workspace update"} changed the operating picture enough to refresh the queue, alerts, or top risk priorities.`,
      owner:
        triggerEvent.channel === "Procurement"
          ? "Procurement lead"
          : nextHighestRiskItem?.owner || "Operations lead",
      followUpDue:
        triggerEvent.channel === "Procurement" ? "Due today" : buildDueLabel(nextHighestRiskItem?.priority),
      timeLabel: new Date().toLocaleString(),
    });
  }

  return entries.slice(0, 4);
}

function groupDailyChangeLog(entries = []) {
  const groups = {
    New: [],
    Resolved: [],
    Worsened: [],
  };

  for (const entry of entries) {
    const key = entry.group && groups[entry.group] ? entry.group : "New";
    groups[key].push(entry);
  }

  return groups;
}

function buildRecurrenceInsights(
  decisionOutcomeLog = [],
  resolvedChanges = [],
  fixPlans = [],
) {
  const reopenedEntries = [
    ...resolvedChanges
      .filter((entry) => entry.reopenReason)
      .map((entry) => ({
        source: entry.title,
        reason: entry.reopenReason,
      })),
    ...decisionOutcomeLog
      .filter((entry) => entry.stage === "Change reopened" && entry.impact)
      .map((entry) => ({
        source: entry.title,
        reason: entry.impact,
      })),
  ];

  const patternMap = {
    supplier: {
      label: "Supplier timing keeps reappearing",
      match: ["supplier", "delay", "slip", "timing", "confirmation", "eta", "shipment"],
      detail:
        "Reopen reasons suggest supplier execution and timing reliability are recurring sources of drag.",
      fixPath:
        "Permanent fix path: tighten supplier confirmation SLAs, shift critical buys toward preferred lanes, and trigger earlier escalation when ETA drift starts instead of after the miss.",
    },
    cash: {
      label: "Cash pressure keeps returning",
      match: ["cash", "budget", "funding", "capital", "spend"],
      detail:
        "Reopen reasons suggest the buying plan is repeatedly colliding with near-term cash constraints.",
      fixPath:
        "Permanent fix path: set a firmer cash-safe release threshold, split noncritical POs by wave, and protect only the SKUs that carry the strongest service or margin return.",
    },
    demand: {
      label: "Demand spikes are re-triggering risk",
      match: ["demand", "spike", "launch", "promo", "forecast", "velocity"],
      detail:
        "Reopen reasons suggest commercial volatility is repeatedly outrunning the current plan assumptions.",
      fixPath:
        "Permanent fix path: add earlier demand-spike alerts, widen safety coverage on high-velocity items, and pre-approve launch or promo buffers before the demand jump hits.",
    },
    inventory: {
      label: "Inventory coverage keeps reopening issues",
      match: ["inventory", "stock", "coverage", "stockout", "reorder", "on hand"],
      detail:
        "Reopen reasons suggest service risk is recurring because inventory buffers are not holding.",
      fixPath:
        "Permanent fix path: raise reorder triggers on repeat offenders, protect inbound timing on service-critical items, and isolate low-coverage SKUs into a tighter review cadence.",
    },
  };

  const counts = Object.fromEntries(
    Object.keys(patternMap).map((key) => [key, { count: 0, examples: [] }]),
  );

  for (const entry of reopenedEntries) {
    const normalized = entry.reason.toLowerCase();
    for (const [key, pattern] of Object.entries(patternMap)) {
      if (pattern.match.some((token) => normalized.includes(token))) {
        counts[key].count += 1;
        if (counts[key].examples.length < 2) {
          counts[key].examples.push(entry.reason);
        }
      }
    }
  }

  return Object.entries(counts)
    .filter(([, value]) => value.count > 0)
    .map(([key, value]) => {
      const insightId = `recurrence-${key}`;
      const linkedPlans = fixPlans.filter((plan) => plan.insightId === insightId);
      const closedPlans = linkedPlans.filter((plan) => plan.status === "Closed").length;
      const inProgressPlans = linkedPlans.filter((plan) => plan.status === "In progress").length;
      const openPlans = linkedPlans.filter((plan) => plan.status === "Open").length;
      const effectiveCount = Math.max(0, value.count - closedPlans);
      const pressureLabel =
        closedPlans > 0 && effectiveCount < value.count
          ? "Pressure reduced"
          : inProgressPlans > 0
            ? "Being worked"
            : openPlans > 0
              ? "Planned response"
              : "Full pressure";

      return {
        id: insightId,
        title: patternMap[key].label,
        count: value.count,
        effectiveCount,
        detail: patternMap[key].detail,
        fixPath: patternMap[key].fixPath,
        examples: value.examples,
        pressureLabel,
        closedPlans,
        inProgressPlans,
        openPlans,
      };
    })
    .sort((a, b) => b.effectiveCount - a.effectiveCount || b.count - a.count)
    .slice(0, 4);
}

function buildCrossSupplierReallocationPlan(
  procurementRecommendations,
  draftPurchaseOrders = [],
) {
  return procurementRecommendations
    .map((recommendation) => {
      const [currentComparison, alternateComparison] =
        recommendation.supplierComparisons || [];

      if (!currentComparison || !alternateComparison) {
        return null;
      }

      const needsReallocation =
        currentComparison.strategy === "reduce" ||
        currentComparison.strategy === "exit" ||
        recommendation.recommendedAward === "Shift" ||
        recommendation.recommendedAward === "Split";

      if (!needsReallocation) {
        return null;
      }

      const shiftShare =
        currentComparison.strategy === "exit"
          ? 1
          : recommendation.recommendedAward === "Split" || currentComparison.strategy === "reduce"
            ? 0.45
            : 1;
      const shiftedUnits = Math.max(1, Math.round(recommendation.bestBuyUnits * shiftShare));
      const currentCash = Math.round(shiftedUnits * currentComparison.landedUnitCost);
      const alternateCash = Math.round(shiftedUnits * alternateComparison.landedUnitCost);
      const cashDelta = alternateCash - currentCash;
      const etaDelta = alternateComparison.leadTimeDays - currentComparison.leadTimeDays;
      const reliabilityDelta =
        alternateComparison.reliability - currentComparison.reliability;
      const tradeoff =
        cashDelta > 0
          ? `Costs about $${cashDelta} more for this shift`
          : cashDelta < 0
            ? `Saves about $${Math.abs(cashDelta)} on this shift`
            : "Neutral landed cash impact";
      const etaTradeoff =
        etaDelta < 0
          ? `${Math.abs(etaDelta)}d faster inbound`
          : etaDelta > 0
            ? `${etaDelta}d slower inbound`
            : "Same inbound speed";
      const riskTradeoff =
        reliabilityDelta > 0
          ? `${reliabilityDelta}% stronger reliability`
          : reliabilityDelta < 0
            ? `${Math.abs(reliabilityDelta)}% weaker reliability`
            : "Same reliability profile";
      const currentScenario =
        recommendation.awardScenarios.find(
          (scenario) => scenario.decision === recommendation.recommendedAward,
        ) || recommendation.awardScenarios[0];
      const existingDraft =
        draftPurchaseOrders.find((draft) => draft.productId === recommendation.id) || null;
      const currentSupplierPath =
        existingDraft?.supplierPath || recommendation.supplierDecision;
      const previewSupplierPath =
        shiftShare === 1
          ? `${alternateComparison.name} 100%`
          : `${currentComparison.name} ${Math.max(
              0,
              Math.round((1 - shiftShare) * 100),
            )}% + ${alternateComparison.name} ${Math.round(shiftShare * 100)}%`;
      const currentMargin =
        existingDraft?.expectedLandedMargin ?? currentScenario?.landedMarginPct ?? 0;
      const previewMargin =
        shiftShare === 1
          ? alternateComparison.landedMarginPct
          : Math.round(
              currentComparison.landedMarginPct * (1 - shiftShare) +
                alternateComparison.landedMarginPct * shiftShare,
            );
      const currentInboundPlan =
        existingDraft?.expectedArrival || currentScenario?.arrivalDate || "Pending schedule";
      const currentEtaMatch = String(currentInboundPlan).match(/\((\d+)d\)/i);
      const currentEtaDays = currentEtaMatch ? Number(currentEtaMatch[1]) || 0 : 0;
      const previewEtaDays =
        shiftShare === 1
          ? Math.max(1, currentEtaDays + etaDelta)
          : Math.max(1, Math.round(currentEtaDays + etaDelta * shiftShare));
      const previewInboundPlan =
        previewEtaDays > 0
          ? `${previewEtaDays}d projected (${etaTradeoff})`
          : etaTradeoff;
      const keepBreakdown =
        existingDraft?.supplierBreakdown?.length > 0
          ? existingDraft.supplierBreakdown
          : [
              {
                name: currentComparison.name,
                share: 100,
                paymentTerms: currentComparison.paymentTerms,
                unitCost: currentComparison.landedUnitCost,
              },
            ];
      const partialShiftShare = Math.min(0.45, shiftShare);
      const partialFromShare = Math.max(0, Math.round((1 - partialShiftShare) * 100));
      const partialToShare = Math.min(100, Math.round(partialShiftShare * 100));
      const comparePlans = [
        {
          id: `${recommendation.id}-keep`,
          label: "Keep current",
          award: recommendation.recommendedAward === "Shift" ? "Stay" : recommendation.recommendedAward,
          supplierPath: currentSupplierPath,
          shiftedUnits: 0,
          landedMargin: currentMargin,
          inboundPlan: currentInboundPlan,
          cashTradeoff: "$0 baseline change",
          riskTradeoff: "Current supplier risk retained",
          supplierBreakdown: keepBreakdown,
        },
        {
          id: `${recommendation.id}-split`,
          label: "Partial shift",
          award: "Split",
          supplierPath: `${currentComparison.name} ${partialFromShare}% + ${alternateComparison.name} ${partialToShare}%`,
          shiftedUnits: Math.max(
            1,
            Math.round(recommendation.bestBuyUnits * partialShiftShare),
          ),
          landedMargin: Math.round(
            currentComparison.landedMarginPct * (1 - partialShiftShare) +
              alternateComparison.landedMarginPct * partialShiftShare,
          ),
          inboundPlan: `${Math.max(
            1,
            Math.round(currentEtaDays + etaDelta * partialShiftShare),
          )}d projected`,
          cashTradeoff:
            cashDelta > 0
              ? `+$${Math.round(Math.abs(cashDelta) * partialShiftShare)}`
              : `-$${Math.round(Math.abs(cashDelta) * partialShiftShare)}`,
          riskTradeoff: riskTradeoff,
          supplierBreakdown: [
            {
              name: currentComparison.name,
              share: partialFromShare,
              paymentTerms: currentComparison.paymentTerms,
              unitCost: currentComparison.landedUnitCost,
            },
            {
              name: alternateComparison.name,
              share: partialToShare,
              paymentTerms: alternateComparison.paymentTerms,
              unitCost: alternateComparison.landedUnitCost,
            },
          ],
        },
        {
          id: `${recommendation.id}-full`,
          label: "Full shift",
          award: "Shift",
          supplierPath: `${alternateComparison.name} 100%`,
          shiftedUnits: recommendation.bestBuyUnits,
          landedMargin: alternateComparison.landedMarginPct,
          inboundPlan: `${Math.max(1, currentEtaDays + etaDelta)}d projected`,
          cashTradeoff: tradeoff,
          riskTradeoff: riskTradeoff,
          supplierBreakdown: [
            {
              name: alternateComparison.name,
              share: 100,
              paymentTerms: alternateComparison.paymentTerms,
              unitCost: alternateComparison.landedUnitCost,
            },
          ],
        },
      ];

      return {
        id: `reallocate-${recommendation.id}`,
        productId: recommendation.id,
        sku: recommendation.product,
        fromSupplier: currentComparison.name,
        toSupplier: alternateComparison.name,
        shiftedUnits,
        totalPlannedUnits: recommendation.bestBuyUnits,
        strategy: currentComparison.strategy,
        recommendedAward: recommendation.recommendedAward,
        currentPaymentTerms: currentComparison.paymentTerms,
        alternatePaymentTerms: alternateComparison.paymentTerms,
        currentLandedUnitCost: currentComparison.landedUnitCost,
        alternateLandedUnitCost: alternateComparison.landedUnitCost,
        alternateLandedMarginPct: alternateComparison.landedMarginPct,
        cashDelta,
        etaTradeoff,
        riskTradeoff,
        tradeoff,
        currentSupplierPath,
        previewSupplierPath,
        currentMargin,
        previewMargin,
        currentInboundPlan,
        previewInboundPlan,
        currentDraftAward:
          existingDraft?.awardDecision || recommendation.recommendedAward,
        previewDraftAward: shiftShare === 1 ? "Shift" : "Split",
        comparePlans,
        summary:
          currentComparison.strategy === "exit"
            ? `Move the full planned buy for ${recommendation.product} away from ${currentComparison.name} and into ${alternateComparison.name}.`
            : `Shift ${shiftedUnits} planned units of ${recommendation.product} out of ${currentComparison.name} and into ${alternateComparison.name}.`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const weight = { exit: 4, reduce: 3, watch: 2, neutral: 1, preferred: 0 };
      return (weight[b.strategy] || 0) - (weight[a.strategy] || 0);
    })
    .slice(0, 6);
}

function buildSupplierActionRecommendations(relationshipRows, strategyMemory = {}) {
    return relationshipRows
      .map((supplier) => {
      let title = `Keep ${supplier.name} as preferred`;
      let badge = "Preferred";
      let recommendedStrategy = "preferred";
      let detail =
        `${supplier.name} is showing healthy response behavior and low operational drag, so Auretix would keep this supplier in the preferred lane.`;

      if (supplier.dragSignal === "High drag") {
        if (supplier.noResponseCount >= 3 || supplier.escalationCount >= 4) {
          title = `Prepare exit path for ${supplier.name}`;
          badge = "Exit";
          recommendedStrategy = "exit";
          detail =
            `${supplier.name} is creating severe operational drag through repeated escalation and weak communication outcomes. Auretix would prepare an exit path unless the relationship recovers quickly.`;
        } else {
          title = `Shift more volume away from ${supplier.name}`;
          badge = "Reduce exposure";
          recommendedStrategy = "reduce";
          detail =
            `${supplier.name} is creating repeated operational drag through escalations, missed responses, or unresolved issues. Auretix would reduce concentration here until response quality improves.`;
        }
      } else if (supplier.escalationCount >= 2 || supplier.noResponseCount >= 2) {
        title = `Escalate weekly with ${supplier.name}`;
        badge = "Escalate";
        recommendedStrategy = "watch";
        detail =
          `${supplier.name} needs a tighter supplier-management cadence. Auretix would run a weekly escalation loop until confirmations and issue resolution improve.`;
      } else if (supplier.responseSpeedLabel === "Awaiting reply" || supplier.openIssues > 0) {
        title = `Push structured follow-up with ${supplier.name}`;
        badge = "Follow up";
        recommendedStrategy = "watch";
        detail =
          `${supplier.name} has open supplier communication risk. Auretix would keep follow-up structured and time-bound before more POs stack up.`;
      } else if (supplier.responseSpeedLabel === "Responsive" && supplier.responseRate >= 60) {
        title = `Keep ${supplier.name} as preferred`;
        badge = "Preferred";
        recommendedStrategy = "preferred";
        detail =
          `${supplier.name} is responding cleanly with limited drag. Auretix would keep this supplier favored for continuity-sensitive buys.`;
      }

      const memory = strategyMemory[supplier.id] || null;

      return {
        id: supplier.id,
        supplierName: supplier.name,
        title,
        badge,
        recommendedStrategy,
        detail,
        responseRate: supplier.responseRate,
        dragSignal: supplier.dragSignal,
        memory,
      };
    })
    .sort((a, b) => {
      const weight = {
        Exit: 5,
        "Reduce exposure": 4,
        Escalate: 3,
        "Follow up": 2,
        Preferred: 1,
      };

      return (weight[b.badge] || 0) - (weight[a.badge] || 0);
    });
}

function buildCommandCenter(
  queue,
  approvalSummary,
  supplierExposurePortfolio,
  recurrenceInsights = [],
) {
  const topRiskItems = queue.items.slice(0, 3);
  const livePoByProductId = Object.fromEntries(
    queue.workspace.purchaseOrders
      .flatMap((po) =>
        (po.lineItems || []).map((line) => [
          line.productId,
          {
            poId: po.id,
            status: po.status,
          },
        ]),
      )
      .filter(Boolean),
  );
  const recurrenceEscalations = recurrenceInsights
    .filter((insight) => insight.effectiveCount >= 2)
    .map((insight) => ({
      id: insight.id,
      type: "Recurring pattern",
      title: insight.title,
      detail:
        insight.effectiveCount < insight.count
          ? `${insight.detail} Auretix has seen this recur ${insight.count} times, but closed fix plans have reduced the active pressure to ${insight.effectiveCount}.`
          : `${insight.detail} Auretix has seen this recur ${insight.count} times, so it is being escalated into the operating brief.`,
      owner: insight.title.toLowerCase().includes("supplier")
        ? "Procurement lead"
        : insight.title.toLowerCase().includes("cash")
          ? "Finance lead"
          : "Operations lead",
      target: insight.title.toLowerCase().includes("supplier")
        ? {
            sectionId: "supplier-relationship-section",
          }
        : {
            sectionId: "decision-queue-section",
            sku: queue.items[0]?.sku || null,
          },
      recurrenceCount: insight.count,
      effectiveRecurrenceCount: insight.effectiveCount,
    }))
    .slice(0, 2);
  const criticalDecisions = [
    ...recurrenceEscalations,
    ...topRiskItems.map((item) => ({
      id: `critical-sku-${item.id}`,
      type: item.priority === "Act now" ? "Decision now" : "High attention",
      title: `${item.name} needs a ${item.playbook} call`,
      detail: `${item.priority} because ${item.riskReason}. Best next move: ${item.topAction}.`,
      owner: item.owner,
      target: livePoByProductId[item.id]
        ? {
            sectionId: "open-purchase-orders-section",
            sku: item.sku,
            poId: livePoByProductId[item.id].poId,
          }
        : {
            sectionId: "decision-queue-section",
            sku: item.sku,
          },
    })),
    ...queue.workspace.anomalies.slice(0, 2).map((anomaly) => ({
      id: anomaly.id,
      type: `${anomaly.severity} anomaly`,
      title: anomaly.title,
      detail: anomaly.detail,
      owner: anomaly.owner,
      target: anomaly.id.includes("anomaly-supplier")
        ? {
            sectionId: "supplier-relationship-section",
          }
        : {
            sectionId: "decision-queue-section",
            sku:
              queue.items.find((item) => anomaly.id.includes(item.id))?.sku ||
              queue.items[0]?.sku ||
              null,
          },
    })),
  ].slice(0, 5);

  const biggestChanges = [
    {
      id: "change-scenario",
      title: `Planning mode: ${queue.overview.scenarioLabel}`,
      detail: `The portfolio is currently being stress-tested under ${queue.overview.scenarioLabel.toLowerCase()} conditions, which is shifting replenishment timing and supplier risk weightings.`,
    },
    {
      id: "change-constraints",
      title: "Constraint pressure",
      detail: queue.constraintRecommendations[0] || "Current approvals are inside the active cash and capacity envelope.",
    },
    {
      id: "change-suppliers",
      title: "Supplier exposure signal",
      detail:
        supplierExposurePortfolio.recommendations[0]?.detail ||
        "No supplier concentration issue is currently outranking the rest of the operating book.",
    },
    ...(recurrenceInsights[0]
      ? [
          {
            id: "change-recurrence",
            title: "Recurring pattern pressure",
            detail:
              recurrenceInsights[0].effectiveCount < recurrenceInsights[0].count
                ? `${recurrenceInsights[0].title} has repeated ${recurrenceInsights[0].count} times, but fix-plan completion has reduced active pressure to ${recurrenceInsights[0].effectiveCount}.`
                : `${recurrenceInsights[0].title} has repeated ${recurrenceInsights[0].count} times and is now influencing the daily operating brief.`,
          },
        ]
      : []),
  ];

  const forecastRows = queue.workspace.forecastBoard || [];
  const averageConfidence =
    forecastRows.length > 0
      ? Math.round(
          forecastRows.reduce((sum, row) => sum + row.confidence, 0) / forecastRows.length,
        )
      : 0;
  const confidenceLabel =
    averageConfidence >= 78 ? "High confidence" : averageConfidence >= 62 ? "Moderate confidence" : "Watch assumptions";
  const confidenceAssumptions = [
    `Objective mode is ${queue.overview.objectiveLabel.toLowerCase()}, so Auretix is biasing actions toward that tradeoff.`,
    `Scenario mode is ${queue.overview.scenarioLabel.toLowerCase()}, which is shaping demand and supplier timing assumptions.`,
    queue.constraintRecommendations[0] || "No active constraint is currently overriding the plan.",
    recurrenceEscalations.length > 0
      ? `${recurrenceEscalations.length} recurring pattern${recurrenceEscalations.length > 1 ? "s are" : " is"} now strong enough to influence command-center priority.`
      : "No recurring pattern is yet strong enough to override the base operating brief.",
  ];

  const revenueAtRisk = topRiskItems.reduce((sum, item) => sum + (item.monthlyRevenue || 0), 0);
  const cashAtRisk = approvalSummary.pendingValue || queue.overview.totalImmediateCash || 0;
  const serviceRiskCount = queue.items.filter((item) => item.priority === "Act now").length;
  const profitAtRisk =
    topRiskItems.reduce((sum, item) => sum + (item.monthlyProfit || 0), 0) ||
    topRiskItems.reduce(
      (sum, item) => sum + Math.round(((item.marginPct || 0) / 100) * (item.monthlyRevenue || 0)),
      0,
    );

  const impactSummary = [
    {
      id: "impact-revenue",
      label: "Revenue at risk",
      value: `$${revenueAtRisk}`,
      detail: "Approximate monthly revenue exposed across the highest-risk items in the current cycle.",
    },
    {
      id: "impact-profit",
      label: "Profit at risk",
      value: `$${profitAtRisk}`,
      detail: "Estimated monthly profit concentration tied to the same high-risk products.",
    },
    {
      id: "impact-cash",
      label: "Cash awaiting decisions",
      value: `$${cashAtRisk}`,
      detail: "Open or watching actions still carrying cash impact before release.",
    },
    {
      id: "impact-service",
      label: "Service threats",
      value: `${serviceRiskCount} SKUs`,
      detail: "Products currently sitting in the highest urgency band and likely to hurt service levels first.",
    },
  ];

  const operatorInbox = (queue.workspace.taskWorkflow || []).slice(0, 5).map((task) => {
    const matchedItem = queue.items.find((item) => item.id === task.id || item.sku === task.sku);
    const matchedPo =
      matchedItem && livePoByProductId[matchedItem.id]
        ? livePoByProductId[matchedItem.id]
        : null;

    return {
      id: task.id,
      title: `${task.action} for ${task.sku}`,
      meta: `${task.owner} • ${task.dueWindow} • ${task.escalation}`,
      lane: task.lane,
      target: matchedPo
        ? {
            sectionId: "open-purchase-orders-section",
            sku: matchedItem?.sku || task.sku,
            poId: matchedPo.poId,
          }
        : {
            sectionId: "task-workflow-section",
            sku: matchedItem?.sku || task.sku,
          },
    };
  });

  return {
    criticalDecisions,
    biggestChanges,
    confidence: {
      score: averageConfidence,
      label: confidenceLabel,
      assumptions: confidenceAssumptions,
    },
    impactSummary,
    operatorInbox,
    recurrenceEscalations,
  };
}

function buildSupplierExecutionPacket(po) {
  const issueFlags = [];

  if (po.escalationFlag) {
    issueFlags.push("Escalation raised");
  }

  if (po.communicationState === "issue_raised") {
    issueFlags.push("Issue raised with supplier");
  }

  if (po.status === "delayed") {
    issueFlags.push("Shipment delayed");
  }

  if (po.status === "supplier_risk") {
    issueFlags.push("Supplier risk active");
  }

  const lineSummary = po.lineItems
    .map((line) => `${line.sku}: ${line.units} units, ETA ${line.etaDays}d, unit cost $${line.unitCost}`)
    .join(" | ");
  const notes = (po.followUpNotes || [])
    .filter((entry) => entry.note !== "No supplier follow-up notes have been logged yet.")
    .map((entry) => ({
      note: entry.note,
      state: entry.communicationState,
      escalationFlag: entry.escalationFlag,
      timeLabel: entry.timeLabel,
    }));
  const notesSummary =
    notes.length > 0
      ? notes.map((entry) => `${entry.state.replaceAll("_", " ")}: ${entry.note}`).join(" | ")
      : "No additional follow-up notes are attached yet.";
  const templates = [
    {
      id: `${po.id}-confirmation`,
      mode: "Confirmation request",
      channel: "Email",
      subject: `Confirmation requested for ${po.id}`,
      body:
        `Hi ${po.supplierName} team,\n\n` +
        `Please confirm receipt and execution timing for ${po.id}. We currently have ${po.units} total units scheduled, ` +
        `with next ETA in ${po.nextEtaDays} days and payment terms of ${po.paymentTerms}.\n\n` +
        `Line summary: ${lineSummary}.\n\n` +
        `Current communication state on our side: ${po.communicationState.replaceAll("_", " ")}.\n` +
        `Recent notes: ${notesSummary}\n\n` +
        `Please confirm quantities, readiness, and any risks we should know about.\n\nThank you,\nAuretix Procurement`,
    },
    {
      id: `${po.id}-delay`,
      mode: "Delay escalation",
      channel: "Email or supplier chat",
      subject: `Urgent follow-up on ${po.id} timing risk`,
      body:
        `Hi ${po.supplierName} team,\n\n` +
        `We are escalating ${po.id} because there is active timing risk against our current inbound plan. ` +
        `The order covers ${po.units} units and is currently expected in ${po.nextEtaDays} days.\n\n` +
        `Issue flags: ${issueFlags.join(", ")}.\n` +
        `Line summary: ${lineSummary}.\n` +
        `Recent notes: ${notesSummary}\n\n` +
        `Please respond with the latest shipment status, revised ETA if needed, and any recovery actions available.\n\nRegards,\nAuretix Procurement`,
    },
    {
      id: `${po.id}-shipment`,
      mode: "Shipment follow-up",
      channel: "Supplier chat",
      subject: `Shipment follow-up for ${po.id}`,
      body:
        `Hi ${po.supplierName} team,\n\n` +
        `Following up on shipment status for ${po.id}. We are tracking ${po.units} units with current status ` +
        `${po.status.replaceAll("_", " ")} and next ETA in ${po.nextEtaDays} days.\n\n` +
        `Payment terms: ${po.paymentTerms}.\n` +
        `Line summary: ${lineSummary}.\n` +
        `Recent notes: ${notesSummary}\n\n` +
        `Please share any tracking, booking, or timing update so we can keep our inbound plan accurate.\n\nThank you,\nAuretix Procurement`,
    },
  ];

  return {
    id: `packet-${po.id}-${Date.now()}`,
    poId: po.id,
    supplierName: po.supplierName,
    generatedAt: new Date().toLocaleString(),
    packetTitle: `Supplier handoff for ${po.id}`,
    summary:
      `PO ${po.id} is currently ${po.status.replaceAll("_", " ")} with ${po.units} total units and next ETA in ${po.nextEtaDays} days. ` +
      `Payment terms: ${po.paymentTerms}. Communication state: ${po.communicationState.replaceAll("_", " ")}.`,
    lineSummary,
    issueFlags: issueFlags.length > 0 ? issueFlags : ["No active issue flags"],
    followUpNotes: notes,
    templates,
    exportHistory: [],
  };
}

function applyMockSale(workspace, sku, quantity = 3) {
  const nextWorkspace = JSON.parse(JSON.stringify(workspace));
  const product = nextWorkspace.products.find((item) => item.sku === sku);

  if (!product) {
    return {
      workspace: nextWorkspace,
      event: createSyncEvent({
        title: "Sync error",
        detail: "Auretix could not locate the selected product in the live ledger.",
        sku,
        channel: "Unknown",
        quantity: 0,
      }),
    };
  }

  const inventory = nextWorkspace.inventoryPositions.find(
    (item) => item.productId === product.id,
  );

  if (!inventory) {
    return {
      workspace: nextWorkspace,
      event: createSyncEvent({
        title: "Inventory position missing",
        detail: `Auretix found ${product.name}, but it has no attached inventory position.`,
        sku: product.sku,
        channel: product.channel,
        quantity: 0,
      }),
    };
  }

  inventory.onHandUnits = Math.max(0, inventory.onHandUnits - quantity);
  inventory.reservedUnits = Math.max(0, inventory.reservedUnits + quantity);

  return {
    workspace: nextWorkspace,
    event: createSyncEvent({
      title: "Amazon sale ingested",
      detail: `${product.name} sold ${quantity} units on ${product.channel}. The shared inventory ledger and planning queue were refreshed.`,
      sku: product.sku,
      channel: product.channel,
      quantity,
    }),
  };
}

function parseCsvText(csvText) {
  const rows = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) {
    return {
      headers: [],
      records: [],
    };
  }

  const headers = rows[0]
    .split(",")
    .map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));

  const records = rows.slice(1).map((row) => {
    const values = row.split(",").map((value) => value.trim());

    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
  });

  return {
    headers,
    records,
  };
}

function applyInventoryImport(workspace, csvText) {
  const nextWorkspace = JSON.parse(JSON.stringify(workspace));
  const { records } = parseCsvText(csvText);

  if (records.length === 0) {
    return {
      workspace: nextWorkspace,
      result: {
        imported: 0,
        unmatched: [],
        message:
          "Auretix could not find any inventory rows to import. Paste at least one product row under the header line.",
      },
    };
  }

  const productsBySku = Object.fromEntries(
    nextWorkspace.products.map((product) => [product.sku.toLowerCase(), product]),
  );
  const inventoryByProductId = Object.fromEntries(
    nextWorkspace.inventoryPositions.map((position) => [position.productId, position]),
  );

  let imported = 0;
  const unmatched = [];

  for (const row of records) {
    const sku = (row.sku || row.product_sku || "").toLowerCase();
    const product = productsBySku[sku];

    if (!product) {
      unmatched.push(row.sku || row.product_sku || "Unknown SKU");
      continue;
    }

    const inventory = inventoryByProductId[product.id];

    if (!inventory) {
      unmatched.push(product.sku);
      continue;
    }

    if (row.on_hand !== "") {
      inventory.onHandUnits = Math.max(0, Number(row.on_hand) || 0);
    }

    if (row.reserved !== "") {
      inventory.reservedUnits = Math.max(0, Number(row.reserved) || 0);
    }

    if (row.reorder_point !== "") {
      inventory.reorderPointUnits = Math.max(0, Number(row.reorder_point) || 0);
    }

    if (row.safety_stock !== "") {
      inventory.safetyStockUnits = Math.max(0, Number(row.safety_stock) || 0);
    }

    imported += 1;
  }

  return {
    workspace: nextWorkspace,
    result: {
      imported,
      unmatched,
      message:
        imported > 0
          ? `Auretix imported ${imported} inventory row${imported > 1 ? "s" : ""} into the shared ledger.`
          : "No rows were imported because none of the SKUs matched the current workspace.",
    },
  };
}

function formatSupplierBreakdownTerms(supplierBreakdown = []) {
  return supplierBreakdown
    .map((supplier) => `${supplier.name}: ${supplier.paymentTerms}`)
    .join(" | ");
}

function buildApprovedReallocationRecord(plan, selectedOption = null) {
  const option =
    selectedOption ||
    plan.comparePlans.find((entry) => entry.id === `${plan.productId}-split`) ||
    plan.comparePlans[0];

  if (!option) {
    return {
      ...plan,
      approvedAt: new Date().toLocaleString(),
    };
  }

  const supplierBreakdown =
    Array.isArray(option.supplierBreakdown) && option.supplierBreakdown.length > 0
      ? option.supplierBreakdown
      : [
          {
            name: plan.fromSupplier,
            share: 100,
            paymentTerms: plan.currentPaymentTerms,
            unitCost: plan.currentLandedUnitCost,
          },
        ];

  return {
    ...plan,
    approvedAt: new Date().toLocaleString(),
    selectedOptionId: option.id,
    selectedOptionLabel: option.label,
    approvedAward: option.award,
    approvedSupplierPath: option.supplierPath,
    approvedShiftedUnits: option.shiftedUnits,
    approvedLandedMargin: option.landedMargin,
    approvedInboundPlan: option.inboundPlan,
    approvedCashTradeoff: option.cashTradeoff,
    approvedRiskTradeoff: option.riskTradeoff,
    approvedSummary: `${option.label} approved. ${plan.summary}`,
    supplierBreakdown,
    paymentTerms: formatSupplierBreakdownTerms(supplierBreakdown),
  };
}

function buildDraftPurchaseOrder(optimizerItem, approvedReallocationPlan = null) {
  const recommendedScenario =
    optimizerItem.awardScenarios.find(
      (scenario) => scenario.decision === optimizerItem.recommendedAward,
    ) || optimizerItem.awardScenarios[0];
  const defaultSupplierBreakdown =
    optimizerItem.recommendedAward === "Split"
      ? optimizerItem.supplierComparisons.map((comparison, index) => ({
          name: comparison.name,
          share: index === 0 ? 55 : 45,
          paymentTerms: comparison.paymentTerms,
          unitCost: comparison.landedUnitCost,
        }))
      : [
          optimizerItem.supplierComparisons.find((comparison) =>
            optimizerItem.recommendedAward === "Shift"
              ? comparison.recommendation !== "Current lane"
              : comparison.recommendation === "Current lane",
          ) || optimizerItem.supplierComparisons[0],
        ]
          .filter(Boolean)
          .map((comparison) => ({
            name: comparison.name,
            share: 100,
            paymentTerms: comparison.paymentTerms,
            unitCost: comparison.landedUnitCost,
          }));
  const supplierBreakdown =
    approvedReallocationPlan?.supplierBreakdown?.length > 0
      ? approvedReallocationPlan.supplierBreakdown
      : defaultSupplierBreakdown;

  return {
    id: `dpo-${Date.now()}-${optimizerItem.id}`,
    product: optimizerItem.product,
    productId: optimizerItem.id,
    awardDecision: approvedReallocationPlan
      ? approvedReallocationPlan.approvedAward || optimizerItem.recommendedAward
      : optimizerItem.recommendedAward,
    supplierPath: supplierBreakdown
      .map((supplier) => `${supplier.name} ${supplier.share}%`)
      .join(" + "),
    supplierBreakdown,
    units: optimizerItem.bestBuyUnits,
    shippingMode: optimizerItem.shippingMode,
    paymentTerms: formatSupplierBreakdownTerms(supplierBreakdown),
    expectedArrival:
      approvedReallocationPlan?.approvedInboundPlan ||
      recommendedScenario?.arrivalDate ||
      "Pending schedule",
    expectedLandedMargin: approvedReallocationPlan
      ? approvedReallocationPlan.approvedLandedMargin
      : recommendedScenario?.landedMarginPct ?? 0,
    cashTiming: recommendedScenario?.cashOutTiming || "Pending payment plan",
    status: "Draft ready",
    reviewNotes: approvedReallocationPlan
      ? `Reallocation approved: ${approvedReallocationPlan.approvedSummary || approvedReallocationPlan.summary}`
      : "",
    createdAt: new Date().toLocaleString(),
  };
}

function parseEtaDays(expectedArrival) {
  const match = String(expectedArrival || "").match(/\((\d+)d\)/i);
  return match ? Math.max(1, Number(match[1]) || 0) : 14;
}

function buildLivePurchaseOrdersFromDraft(workspace, draft) {
  const nextWorkspace = JSON.parse(JSON.stringify(workspace));
  const product = nextWorkspace.products.find(
    (item) => item.id === draft.productId || item.id === draft.sku,
  );

  if (!product) {
    return {
      workspace: nextWorkspace,
      created: [],
    };
  }

  const etaDays = parseEtaDays(draft.expectedArrival);
  const supplierBreakdown =
    Array.isArray(draft.supplierBreakdown) && draft.supplierBreakdown.length > 0
      ? draft.supplierBreakdown
      : [
          {
            name: draft.supplierPath,
            share: 100,
            paymentTerms: draft.paymentTerms,
            unitCost: product.unitCost,
          },
        ];

  const created = supplierBreakdown
    .map((supplier, index) => {
      const supplierRecord = nextWorkspace.suppliers.find(
        (entry) => entry.name === supplier.name,
      );

      if (!supplierRecord) {
        return null;
      }

      const allocatedUnits =
        index === supplierBreakdown.length - 1
          ? Math.max(
              0,
              draft.units -
                supplierBreakdown
                  .slice(0, index)
                  .reduce(
                    (sum, entry) => sum + Math.round(draft.units * (entry.share / 100)),
                    0,
                  ),
            )
          : Math.max(0, Math.round(draft.units * (supplier.share / 100)));

      const poId = `po-live-${Date.now()}-${index + 1}`;
      const po = {
        id: poId,
        supplierId: supplierRecord.id,
        status: "sent_to_supplier",
        communicationState: "awaiting_confirmation",
        escalationFlag: false,
        followUpNotes: [],
        createdDaysAgo: 0,
        statusHistory: [
          createStatusHistoryEntry(
            "sent_to_supplier",
            `${product.name} was released from Auretix draft workflow to ${supplierRecord.name}.`,
          ),
        ],
        lineItems: [
          {
            productId: product.id,
            units: allocatedUnits,
            etaDays,
            unitCost: supplier.unitCost || product.unitCost,
          },
        ],
      };

      nextWorkspace.purchaseOrders.unshift(po);

      return {
        id: poId,
        supplierName: supplierRecord.name,
        units: allocatedUnits,
      };
    })
    .filter(Boolean);

  return {
    workspace: nextWorkspace,
    created,
  };
}

const WORKSPACE_STORAGE_KEY = "auretix_saved_workspaces_v1";

function hasSupabaseBrowserConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function cleanAuthUrl() {
  window.history.replaceState({}, document.title, window.location.pathname);
}

function getBrowserSupabaseClient() {
  if (!hasSupabaseBrowserConfig() || typeof window === "undefined") {
    return null;
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

async function buildAuthHeaders(extraHeaders = {}) {
  const headers = {
    ...extraHeaders,
  };
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    return headers;
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function completeBrowserSupabaseAuth() {
  if (!hasSupabaseBrowserConfig() || typeof window === "undefined") {
    return false;
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const hashError = hashParams.get("error_description") || hashParams.get("error");

  if (hashError) {
    cleanAuthUrl();
    throw new Error(
      `${hashError.replace(/\+/g, " ")}. Generate a fresh local dev link from the login page and open it immediately.`,
    );
  }

  const supabase = getBrowserSupabaseClient();
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw error;
    }

    cleanAuthUrl();
    return true;
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      throw error;
    }

    cleanAuthUrl();
    return true;
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }

    cleanAuthUrl();
    return true;
  }

  return false;
}

export default function EngineWorkbench({
  focus = "overview",
  title = "Auretix engine",
  intro = "Run the first version of the Auretix decision engine for sellers.",
}) {
  const [scenario, setScenario] = useState(defaultScenario);
  const [workspaceState, setWorkspaceState] = useState(() =>
    getSeededWorkspace(defaultScenario.businessType),
  );
  const [decision, setDecision] = useState(defaultDecision);
  const [queue, setQueue] = useState(() =>
    buildDecisionQueue(defaultScenario, {
      workspaceOverride: getSeededWorkspace(defaultScenario.businessType),
      supplierStrategyMemory: {},
    }),
  );
  const [actionState, setActionState] = useState(() =>
    buildInitialActionState(
      buildDecisionQueue(defaultScenario, {
        workspaceOverride: getSeededWorkspace(defaultScenario.businessType),
        supplierStrategyMemory: {},
      }).items,
    ),
  );
  const [selectedSku, setSelectedSku] = useState(() =>
    buildDecisionQueue(defaultScenario, {
      workspaceOverride: getSeededWorkspace(defaultScenario.businessType),
      supplierStrategyMemory: {},
    }).items[0]?.sku ?? null,
  );
  const [syncChannels, setSyncChannels] = useState(() =>
    buildSyncChannels(getSeededWorkspace(defaultScenario.businessType)),
  );
  const [syncEvents, setSyncEvents] = useState(() => [
    createSyncEvent({
      title: "Inventory sync ready",
      detail:
        "Auretix seeded the inventory workspace and is ready to absorb live channel sales.",
      sku: "System",
      channel: "Auretix",
      quantity: 0,
    }),
  ]);
  const [inventoryImportText, setInventoryImportText] = useState(
    "sku,on_hand,reserved,reorder_point,safety_stock\nATX-HERO-01,228,28,690,85\nATX-LAUNCH-04,151,34,510,102",
  );
  const [inventoryImportStatus, setInventoryImportStatus] = useState("");
  const [savedWorkspaces, setSavedWorkspaces] = useState([]);
  const [draftPurchaseOrders, setDraftPurchaseOrders] = useState([]);
  const [selectedDraftPoId, setSelectedDraftPoId] = useState(null);
  const [selectedLivePoId, setSelectedLivePoId] = useState(null);
  const [livePoNoteText, setLivePoNoteText] = useState("");
  const [supplierPackets, setSupplierPackets] = useState([]);
  const [supplierStrategyMemory, setSupplierStrategyMemory] = useState({});
  const [supplierStrategyDrafts, setSupplierStrategyDrafts] = useState({});
  const [approvedReallocationPlans, setApprovedReallocationPlans] = useState({});
  const [dailyChangeLog, setDailyChangeLog] = useState([]);
  const [decisionOutcomeLog, setDecisionOutcomeLog] = useState([]);
  const [acknowledgedChangeIds, setAcknowledgedChangeIds] = useState([]);
  const [changeOverrides, setChangeOverrides] = useState({});
  const [resolvedChangeIds, setResolvedChangeIds] = useState([]);
  const [resolvedChanges, setResolvedChanges] = useState([]);
  const [reopenReasonDrafts, setReopenReasonDrafts] = useState({});
  const [fixPlans, setFixPlans] = useState([]);
  const [expandedChangeId, setExpandedChangeId] = useState(null);
  const [templateDeliveryMode, setTemplateDeliveryMode] = useState("email");
  const [copiedTemplateId, setCopiedTemplateId] = useState(null);
  const [workspaceRecordId, setWorkspaceRecordId] = useState("workspace_demo");
  const [latestDecisionRunId, setLatestDecisionRunId] = useState(null);
  const [backendStatus, setBackendStatus] = useState({
    type: "idle",
    message: "",
  });
  const [accountContext, setAccountContext] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [roiSnapshot, setRoiSnapshot] = useState(null);
  const [shopifyShop, setShopifyShop] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedWorkspaces(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        WORKSPACE_STORAGE_KEY,
        JSON.stringify(savedWorkspaces),
      );
    } catch {}
  }, [savedWorkspaces]);

  useEffect(() => {
    let cancelled = false;

    async function loadPersistentWorkspace() {
      setBackendStatus({
        type: "idle",
        message: "Loading persistent workspace...",
      });

      try {
        const completedAuth = await completeBrowserSupabaseAuth();
        if (completedAuth) {
          setBackendStatus({
            type: "success",
            message: "Sign-in confirmed. Loading your Supabase workspace...",
          });
        }

        const response = await fetch("/api/workspaces", {
          headers: await buildAuthHeaders(),
          cache: "no-store",
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load workspace.");
        }

        const loadedWorkspace = payload.workspace;

        if (cancelled || !loadedWorkspace?.workspaceState) {
          return;
        }

        const nextScenario = loadedWorkspace.scenario || defaultScenario;
        const nextWorkspaceState = loadedWorkspace.workspaceState;
        const nextSupplierStrategyMemory =
          loadedWorkspace.supplierStrategyMemory || {};
        const nextQueue = buildDecisionQueue(nextScenario, {
          workspaceOverride: nextWorkspaceState,
          supplierStrategyMemory: nextSupplierStrategyMemory,
        });

        setWorkspaceRecordId(loadedWorkspace.id || "workspace_demo");
        setLatestDecisionRunId(payload.decisionRuns?.[0]?.id || null);
        setAccountContext(payload.auth || null);
        setScenario(nextScenario);
        setWorkspaceState(nextWorkspaceState);
        setDecision(buildDecision(nextScenario));
        setQueue(nextQueue);
        setActionState(buildInitialActionState(nextQueue.items));
        setSelectedSku(nextQueue.items[0]?.sku ?? null);
        setSyncChannels(
          buildSyncChannels(nextWorkspaceState, "Persistent workspace loaded"),
        );
        setDraftPurchaseOrders(loadedWorkspace.draftPurchaseOrders || []);
        setSelectedDraftPoId(loadedWorkspace.draftPurchaseOrders?.[0]?.id || null);
        setSelectedLivePoId(nextWorkspaceState.purchaseOrders?.[0]?.id || null);
        setSupplierPackets(loadedWorkspace.supplierPackets || []);
        setSupplierStrategyMemory(nextSupplierStrategyMemory);
        setApprovedReallocationPlans(
          loadedWorkspace.approvedReallocationPlans || {},
        );
        await refreshIntegrationStatus(loadedWorkspace.id || "workspace_demo");
        setBackendStatus({
          type: "success",
          message: `Persistent workspace loaded: ${loadedWorkspace.name}.`,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setBackendStatus({
          type: "error",
          message:
            error.message ||
            "Auretix is running from the seeded workspace because persistence is unavailable.",
        });
      }
    }

    loadPersistentWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveWorkspaceToBackend(reason, overrides = {}) {
    const nextScenario = overrides.scenario || scenario;
    const nextWorkspaceState = overrides.workspaceState || workspaceState;
    const nextDraftPurchaseOrders =
      overrides.draftPurchaseOrders || draftPurchaseOrders;
    const nextSupplierPackets = overrides.supplierPackets || supplierPackets;
    const nextSupplierStrategyMemory =
      overrides.supplierStrategyMemory || supplierStrategyMemory;
    const nextApprovedReallocationPlans =
      overrides.approvedReallocationPlans || approvedReallocationPlans;

    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: await buildAuthHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        reason,
        workspace: {
          id: workspaceRecordId,
          name: overrides.name || "Auretix operating workspace",
          businessType: nextScenario.businessType,
          scenario: nextScenario,
          workspaceState: nextWorkspaceState,
          draftPurchaseOrders: nextDraftPurchaseOrders,
          supplierPackets: nextSupplierPackets,
          supplierStrategyMemory: nextSupplierStrategyMemory,
          approvedReallocationPlans: nextApprovedReallocationPlans,
          metadata: {
            savedFrom: "engine-workbench",
          },
        },
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to save workspace.");
    }

    setWorkspaceRecordId(payload.workspace.id);
    return payload.workspace;
  }

  async function refreshIntegrationStatus(nextWorkspaceId = workspaceRecordId) {
    const params = nextWorkspaceId ? `?workspaceId=${encodeURIComponent(nextWorkspaceId)}` : "";
    const response = await fetch(`/api/integrations/status${params}`, {
      headers: await buildAuthHeaders(),
      cache: "no-store",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to load integrations.");
    }

    setIntegrations(payload.integrations || []);
    setRoiSnapshot(payload.roi || null);
    return payload;
  }

  async function startIntegration(providerId) {
    setBackendStatus({
      type: "idle",
      message: `Preparing ${providerId} authorization...`,
    });

    try {
      const response = await fetch(`/api/integrations/connect/${providerId}`, {
        method: "POST",
        headers: await buildAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          workspaceId: workspaceRecordId,
          shop: providerId === "shopify" ? shopifyShop : undefined,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to start integration.");
      }

      window.location.href = payload.url;
    } catch (error) {
      setBackendStatus({
        type: "error",
        message: error.message || "Unable to start integration authorization.",
      });
    }
  }

  function refreshWorkspace(
    nextScenario,
    nextWorkspace,
    nextEvent = null,
    nextSupplierStrategyMemory = supplierStrategyMemory,
  ) {
    const nextQueue = buildDecisionQueue(nextScenario, {
      workspaceOverride: nextWorkspace,
      supplierStrategyMemory: nextSupplierStrategyMemory,
    });
    const nextChangeEntries = buildDailyChangeEntries(queue, nextQueue, nextEvent);

    setWorkspaceState(nextWorkspace);
    setQueue(nextQueue);
    setDecision(buildDecision(nextScenario));
    setActionState((current) => ({
      ...buildInitialActionState(nextQueue.items),
      ...Object.fromEntries(
        nextQueue.items
          .filter((item) => current[item.id])
          .map((item) => [item.id, current[item.id]]),
      ),
    }));
    setSelectedSku((current) =>
      nextQueue.items.some((item) => item.sku === current)
        ? current
        : nextQueue.items[0]?.sku ?? null,
    );

    if (nextEvent) {
      setSyncEvents((current) => [nextEvent, ...current].slice(0, 8));
      setSyncChannels(buildSyncChannels(nextWorkspace, nextEvent.title));
    } else {
      setSyncChannels(buildSyncChannels(nextWorkspace));
    }

    if (nextChangeEntries.length > 0) {
      setDailyChangeLog((current) => [...nextChangeEntries, ...current].slice(0, 12));
    }
  }

  function updateField(event) {
    const { name, value } = event.target;

    if (name === "businessType") {
      const nextScenario = {
        ...scenario,
        [name]: value,
      };
      const nextWorkspace = getSeededWorkspace(value);
      setScenario(nextScenario);
      setDraftPurchaseOrders([]);
      setSelectedDraftPoId(null);
      setSelectedLivePoId(null);
      setSupplierPackets([]);
      setSupplierStrategyMemory({});
      setSupplierStrategyDrafts({});
      setApprovedReallocationPlans({});
      setDailyChangeLog([]);
      setDecisionOutcomeLog([]);
      setAcknowledgedChangeIds([]);
      setChangeOverrides({});
      setResolvedChangeIds([]);
      setResolvedChanges([]);
      setReopenReasonDrafts({});
      setFixPlans([]);
      setExpandedChangeId(null);
      refreshWorkspace(
        nextScenario,
        nextWorkspace,
        createSyncEvent({
          title: "Workspace switched",
          detail: `Auretix loaded the ${value} workspace so the live ledger, suppliers, and purchase orders match the selected business type.`,
          sku: "System",
          channel: "Auretix",
          quantity: 0,
        }),
        {},
      );
      return;
    }

    setScenario((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function resetScenario() {
    setScenario(defaultScenario);
    setDraftPurchaseOrders([]);
    setSelectedDraftPoId(null);
    setSelectedLivePoId(null);
    setSupplierPackets([]);
    setSupplierStrategyMemory({});
    setSupplierStrategyDrafts({});
    setApprovedReallocationPlans({});
    setDailyChangeLog([]);
    setDecisionOutcomeLog([]);
    setAcknowledgedChangeIds([]);
    setChangeOverrides({});
    setResolvedChangeIds([]);
    setResolvedChanges([]);
    setReopenReasonDrafts({});
    setFixPlans([]);
    setExpandedChangeId(null);
    refreshWorkspace(
      defaultScenario,
      getSeededWorkspace(defaultScenario.businessType),
      createSyncEvent({
        title: "Workspace reset",
        detail:
          "Auretix restored the seeded inventory ledger, supplier board, and purchase orders.",
        sku: "System",
        channel: "Auretix",
        quantity: 0,
      }),
      {},
    );
  }

  async function runDecisionEngine() {
    refreshWorkspace(
      scenario,
      workspaceState,
      createSyncEvent({
        title: "Planning cycle refreshed",
        detail:
          "Auretix reran the workspace against the current strategy, scenario, and live ledger.",
        sku: "System",
        channel: "Auretix",
        quantity: 0,
      }),
    );

    setBackendStatus({
      type: "idle",
      message: "Saving decision run...",
    });

    try {
      const response = await fetch("/api/decision-runs", {
        method: "POST",
        headers: await buildAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          workspaceId: workspaceRecordId,
          scenario,
          workspaceState,
          supplierStrategyMemory,
          trigger: "manual_run",
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to save decision run.");
      }

      setLatestDecisionRunId(payload.decisionRun.id);
      await refreshIntegrationStatus(workspaceRecordId);
      setBackendStatus({
        type: "success",
        message: `Decision run saved. Highest risk: ${payload.decisionRun.summary.highestRiskSku} (${payload.decisionRun.summary.highestRiskScore}).`,
      });
    } catch (error) {
      setBackendStatus({
        type: "error",
        message:
          error.message ||
          "Auretix refreshed locally, but the decision run was not saved.",
      });
    }
  }

  function updateActionState(sku, value) {
    setActionState((current) => ({
      ...current,
      [sku]: value,
    }));
  }

  const approvalStatuses = ["Open", "Approved", "Watching", "Deferred", "Done"];
  const approvalSummary = queue.items.reduce(
    (summary, item) => {
      const status = actionState[item.id] || "Open";
      summary[status] = (summary[status] || 0) + 1;

      if (status === "Approved") {
        summary.approvedSpend += item.cashImpact;
      }

      if (status === "Open" || status === "Watching") {
        summary.pendingValue += item.cashImpact;
      }

      return summary;
    },
    {
      Open: 0,
      Approved: 0,
      Watching: 0,
      Deferred: 0,
      Done: 0,
      approvedSpend: 0,
      pendingValue: 0,
    },
  );

  const metricVisibilityMap = {
    overview: ["Risk score", "Days of cover", "Recommended PO", "Objective mode", "Urgency"],
    procurement: ["Recommended PO", "Objective mode", "Risk score", "Urgency"],
    "supply-chain": ["Days of cover", "Objective mode", "Risk score", "Urgency"],
  };

  const visibleMetricLabels =
    metricVisibilityMap[focus] || metricVisibilityMap.overview;

  const visibleMetrics =
    decision.metrics.length > 0
      ? decision.metrics.filter((metric) =>
          visibleMetricLabels.includes(metric.label),
        )
      : [];

  const visiblePanels =
    decision.panels.length > 0
      ? decision.panels.filter((panel) => {
          if (focus === "overview") {
            return true;
          }

          return panel.key === focus || panel.key === "decision-layer";
        })
      : [];

  const focusedActionLabel =
    focus === "procurement"
      ? "Procurement actions"
      : focus === "supply-chain"
        ? "Supply-chain actions"
        : "Recommended actions";

  const focusedEmptyCopy =
    focus === "procurement"
      ? "Run the engine to see procurement-specific PO and supplier actions."
      : focus === "supply-chain"
        ? "Run the engine to see supply-chain-specific coverage and flow actions."
        : "Run the engine to see the next best move.";

  const focusedSummaryLabel =
    focus === "procurement"
      ? "Procurement interpretation"
      : focus === "supply-chain"
        ? "Supply-chain interpretation"
        : "Unified decision summary";

  const showDashboard = focus === "overview";
  const selectedItem =
    queue.items.find((item) => item.sku === selectedSku) || queue.items[0] || null;
  const selectedDraftPurchaseOrder =
    draftPurchaseOrders.find((draft) => draft.id === selectedDraftPoId) ||
    draftPurchaseOrders[0] ||
    null;
  const selectedLivePurchaseOrder =
    queue.workspace.purchaseOrders.find((po) => po.id === selectedLivePoId) ||
    queue.workspace.purchaseOrders[0] ||
    null;
  const supplierRelationshipRows = buildSupplierRelationshipRows(
    queue.workspace.suppliers,
    supplierPackets,
    queue.workspace.purchaseOrders,
  );
  const supplierActionRecommendations = buildSupplierActionRecommendations(
    supplierRelationshipRows,
    supplierStrategyMemory,
  );
  const supplierExposurePortfolio = buildSupplierExposurePortfolio(
    supplierRelationshipRows,
    queue.workspace.purchaseOrders,
    queue.workspace.procurementOptimizer.recommendations,
    supplierStrategyMemory,
  );
  const groupedDailyChangeLog = groupDailyChangeLog(dailyChangeLog);
  const recurrenceInsights = buildRecurrenceInsights(
    decisionOutcomeLog,
    resolvedChanges,
    fixPlans,
  );
  const commandCenter = buildCommandCenter(
    queue,
    approvalSummary,
    supplierExposurePortfolio,
    recurrenceInsights,
  );
  const crossSupplierReallocationPlan = buildCrossSupplierReallocationPlan(
    queue.workspace.procurementOptimizer.recommendations,
    draftPurchaseOrders,
  );

  function jumpToWorkflow(target) {
    if (!target) {
      return;
    }

    if (target.sku) {
      setSelectedSku(target.sku);
    }

    if (target.poId) {
      setSelectedLivePoId(target.poId);
    }

    window.setTimeout(() => {
      const element = document.getElementById(target.sectionId);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function appendDecisionOutcome(entry) {
    setDecisionOutcomeLog((current) => [entry, ...current].slice(0, 14));
  }

  function acknowledgeChange(changeId) {
    setAcknowledgedChangeIds((current) =>
      current.includes(changeId) ? current : [changeId, ...current].slice(0, 40),
    );
  }

  function markChangeResolved(entry) {
    setResolvedChangeIds((current) =>
      current.includes(entry.id) ? current : [entry.id, ...current].slice(0, 40),
    );
    setAcknowledgedChangeIds((current) =>
      current.includes(entry.id) ? current : [entry.id, ...current].slice(0, 40),
    );
    setResolvedChanges((current) => {
      const nextEntry = {
        ...entry,
        resolvedAt: new Date().toLocaleString(),
      };
      return [nextEntry, ...current.filter((item) => item.id !== entry.id)].slice(0, 20);
    });
    appendDecisionOutcome(
      createDecisionOutcomeEntry({
        stage: "Change resolved",
        title: `${entry.title} closed out`,
        detail: `The operator marked this change as resolved from the daily log.`,
        subject: entry.title,
        status: "Closed",
        impact: entry.followUpDue || entry.badge || "",
      }),
    );
  }

  function reopenChange(entry) {
    const reason =
      reopenReasonDrafts[entry.id]?.trim() ||
      "The issue returned and needs to be tracked again in the active queue.";
    setResolvedChangeIds((current) => current.filter((id) => id !== entry.id));
    setResolvedChanges((current) => current.filter((item) => item.id !== entry.id));
    setAcknowledgedChangeIds((current) =>
      current.includes(entry.id) ? current : [entry.id, ...current].slice(0, 40),
    );
    setDailyChangeLog((current) => [
      {
        ...entry,
        group: "Worsened",
        badge: "Reopened",
        detail: `${entry.detail} Reopened because: ${reason}`,
        reopenedAt: new Date().toLocaleString(),
        reopenReason: reason,
      },
      ...current.filter((item) => item.id !== entry.id),
    ].slice(0, 12));
    setReopenReasonDrafts((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });
    appendDecisionOutcome(
      createDecisionOutcomeEntry({
        stage: "Change reopened",
        title: `${entry.title} reopened`,
        detail: `The operator reopened this change from the resolved queue and returned it to active monitoring. Reason: ${reason}`,
        subject: entry.title,
        status: "Reopened",
        impact: reason,
      }),
    );
  }

  function getEffectiveChangeMeta(entry) {
    const override = changeOverrides[entry.id] || {};
    return {
      owner: override.owner || entry.owner || "",
      followUpDue: override.followUpDue || entry.followUpDue || "",
    };
  }

  function updateChangeOverride(changeId, updates) {
    setChangeOverrides((current) => ({
      ...current,
      [changeId]: {
        ...(current[changeId] || {}),
        ...updates,
      },
    }));
  }

  function createFixPlan(insight) {
    const nextPlan = createFixPlanFromInsight(insight);
    setFixPlans((current) => [
      nextPlan,
      ...current.filter((plan) => plan.insightId !== insight.id),
    ].slice(0, 12));
    appendDecisionOutcome(
      createDecisionOutcomeEntry({
        stage: "Fix plan created",
        title: `${insight.title} fix plan opened`,
        detail: `Auretix turned this recurrence into a tracked operating initiative.`,
        subject: insight.title,
        status: "Open",
        impact: nextPlan.dueWindow,
      }),
    );
  }

  function updateFixPlan(planId, updates) {
    setFixPlans((current) =>
      current.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              ...updates,
            }
          : plan,
      ),
    );
  }

  function simulateAmazonSale() {
    const targetItem =
      selectedItem ||
      queue.items.find((item) => item.channel === "Amazon") ||
      queue.items[0];

    if (!targetItem) {
      return;
    }

    const quantity = targetItem.channel === "Amazon" ? 3 : 2;
    const { workspace: nextWorkspace, event } = applyMockSale(
      workspaceState,
      targetItem.sku,
      quantity,
    );
    refreshWorkspace(scenario, nextWorkspace, event);
  }

  function importInventoryLedger() {
    const { workspace: nextWorkspace, result } = applyInventoryImport(
      workspaceState,
      inventoryImportText,
    );

    setInventoryImportStatus(result.message);

    const detail =
      result.unmatched.length > 0
        ? `${result.message} Unmatched SKUs: ${result.unmatched.join(", ")}.`
        : result.message;

    refreshWorkspace(
      scenario,
      nextWorkspace,
      createSyncEvent({
        title: "Inventory import applied",
        detail,
        sku: "Import",
        channel: "CSV",
        quantity: result.imported,
      }),
    );
  }

  function handleInventoryFileUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setInventoryImportText(text);
      setInventoryImportStatus(
        `Loaded ${file.name}. Review the CSV text and import it into the ledger when ready.`,
      );
    };
    reader.readAsText(file);
  }

  async function saveCurrentWorkspace() {
    const snapshot = {
      id: `ws-${Date.now()}`,
      name: `${scenario.businessType} workspace ${savedWorkspaces.length + 1}`,
      savedAt: new Date().toLocaleString(),
      scenario,
      workspaceState,
        draftPurchaseOrders,
        supplierPackets,
        supplierStrategyMemory,
        approvedReallocationPlans,
        dailyChangeLog,
        decisionOutcomeLog,
        acknowledgedChangeIds,
        changeOverrides,
        resolvedChangeIds,
        resolvedChanges,
        reopenReasonDrafts,
        fixPlans,
      };

    setSavedWorkspaces((current) => [snapshot, ...current].slice(0, 6));
    setSyncEvents((current) => [
      createSyncEvent({
        title: "Workspace saved",
        detail:
          "Auretix stored the current seller workspace, strategy, and live ledger in local memory.",
        sku: "System",
        channel: "Auretix",
        quantity: 0,
      }),
      ...current,
    ].slice(0, 8));

    setBackendStatus({
      type: "idle",
      message: "Saving workspace to persistent store...",
    });

    try {
      const savedWorkspace = await saveWorkspaceToBackend(
        "Operator saved the current workspace from the app.",
        {
          name: snapshot.name,
          draftPurchaseOrders,
          supplierPackets,
          supplierStrategyMemory,
          approvedReallocationPlans,
        },
      );

      setBackendStatus({
        type: "success",
        message: `Workspace saved to backend: ${savedWorkspace.name}.`,
      });
      await refreshIntegrationStatus(savedWorkspace.id);
    } catch (error) {
      setBackendStatus({
        type: "error",
        message:
          error.message ||
          "Saved locally, but the backend workspace snapshot was not updated.",
      });
    }
  }

  function loadSavedWorkspace(savedWorkspace) {
    setScenario(savedWorkspace.scenario);
    setDraftPurchaseOrders(savedWorkspace.draftPurchaseOrders || []);
    setSelectedDraftPoId(savedWorkspace.draftPurchaseOrders?.[0]?.id || null);
    setSelectedLivePoId(savedWorkspace.workspaceState?.purchaseOrders?.[0]?.id || null);
    setSupplierPackets(savedWorkspace.supplierPackets || []);
    setSupplierStrategyMemory(savedWorkspace.supplierStrategyMemory || {});
    setSupplierStrategyDrafts({});
    setApprovedReallocationPlans(savedWorkspace.approvedReallocationPlans || {});
    setDailyChangeLog(savedWorkspace.dailyChangeLog || []);
    setDecisionOutcomeLog(savedWorkspace.decisionOutcomeLog || []);
    setAcknowledgedChangeIds(savedWorkspace.acknowledgedChangeIds || []);
    setChangeOverrides(savedWorkspace.changeOverrides || {});
    setResolvedChangeIds(savedWorkspace.resolvedChangeIds || []);
    setResolvedChanges(savedWorkspace.resolvedChanges || []);
    setReopenReasonDrafts(savedWorkspace.reopenReasonDrafts || {});
    setFixPlans(savedWorkspace.fixPlans || []);
    setExpandedChangeId(null);
    refreshWorkspace(
      savedWorkspace.scenario,
      savedWorkspace.workspaceState,
      createSyncEvent({
        title: "Workspace loaded",
        detail: `Auretix restored ${savedWorkspace.name} with its saved products, inventory, and plan context.`,
        sku: "System",
        channel: "Auretix",
        quantity: 0,
      }),
      savedWorkspace.supplierStrategyMemory || {},
    );
  }

  function createDraftPo(optimizerItem) {
    const draft = buildDraftPurchaseOrder(
      optimizerItem,
      approvedReallocationPlans[optimizerItem.id] || null,
    );

    setDraftPurchaseOrders((current) => {
      const nextDrafts = [
        draft,
        ...current.filter((item) => item.product !== draft.product),
      ].slice(0, 10);
      return nextDrafts;
    });
    setSelectedDraftPoId(draft.id);
    setSyncEvents((current) => [
      createSyncEvent({
        title: "Draft PO created",
        detail: `Auretix turned the ${optimizerItem.recommendedAward.toLowerCase()} award recommendation for ${optimizerItem.product} into a draft PO with supplier path, units, terms, and shipping prefilled.`,
        sku: optimizerItem.product,
        channel: "Procurement",
        quantity: optimizerItem.bestBuyUnits,
      }),
      ...current,
    ].slice(0, 8));
    appendDecisionOutcome(
      createDecisionOutcomeEntry({
        stage: "Draft created",
        title: `${optimizerItem.product} draft PO created`,
        detail: `Auretix turned the ${optimizerItem.recommendedAward.toLowerCase()} award into a draft PO for operator review.`,
        subject: optimizerItem.product,
        status: "Open",
        impact: `${optimizerItem.bestBuyUnits} units | ${optimizerItem.shippingMode}`,
      }),
    );
  }

  function updateDraftPurchaseOrder(draftId, updates) {
    setDraftPurchaseOrders((current) =>
      current.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              ...updates,
            }
          : draft,
      ),
    );
  }

  function updateDraftField(event) {
    const { name, value } = event.target;

    if (!selectedDraftPoId) {
      return;
    }

    updateDraftPurchaseOrder(selectedDraftPoId, {
      [name]: name === "units" ? Math.max(0, Number(value) || 0) : value,
    });
  }

  function moveDraftToStatus(draftId, status) {
    const draft = draftPurchaseOrders.find((item) => item.id === draftId);

    if (!draft) {
      return;
    }

    if (status === "Sent to supplier") {
      const { workspace: nextWorkspace, created } = buildLivePurchaseOrdersFromDraft(
        workspaceState,
        draft,
      );
      const createdSummary =
        created.length > 0
          ? created.map((po) => `${po.id} (${po.supplierName}, ${po.units} units)`).join("; ")
          : "No live PO was created because the supplier could not be matched.";

      setDraftPurchaseOrders((current) =>
        current.filter((item) => item.id !== draftId),
      );
      setSelectedLivePoId(created[0]?.id || null);
      setSelectedDraftPoId((current) => {
        if (current !== draftId) {
          return current;
        }

        const remainingDraft = draftPurchaseOrders.find((item) => item.id !== draftId);
        return remainingDraft?.id || null;
      });
      refreshWorkspace(
        scenario,
        nextWorkspace,
        createSyncEvent({
          title: "Draft PO released",
          detail: `${draft.product} moved from draft review into the live purchase order board. ${createdSummary}`,
          sku: draft.product,
          channel: "Procurement",
          quantity: draft.units,
        }),
      );
      appendDecisionOutcome(
        createDecisionOutcomeEntry({
          stage: "Released",
          title: `${draft.product} released to supplier`,
          detail: createdSummary,
          subject: draft.product,
          status: "Executed",
          impact: `${draft.units} units | ${draft.awardDecision}`,
        }),
      );
      return;
    }

    updateDraftPurchaseOrder(draftId, { status });
    setSyncEvents((current) => [
      createSyncEvent({
        title: status === "Approved for release" ? "Draft PO approved" : "Draft PO sent",
        detail:
          status === "Approved for release"
            ? `${draft.product} is now approved for release. The buying package is ready for final operator signoff.`
            : `${draft.product} was marked as sent to the supplier with the reviewed units, terms, and shipping mode.`,
        sku: draft.product,
        channel: "Procurement",
        quantity: draft.units,
      }),
      ...current,
    ].slice(0, 8));
    appendDecisionOutcome(
      createDecisionOutcomeEntry({
        stage: status === "Approved for release" ? "Approved" : "Sent",
        title: `${draft.product} ${status.toLowerCase()}`,
        detail:
          status === "Approved for release"
            ? `${draft.product} is cleared for release with the reviewed supplier path and terms.`
            : `${draft.product} was marked sent to supplier from draft review.`,
        subject: draft.product,
        status: status === "Approved for release" ? "Approved" : "Executed",
        impact: `${draft.units} units`,
      }),
    );
  }

  function moveLivePoToStatus(poId, status) {
    const targetPo = workspaceState.purchaseOrders.find((po) => po.id === poId);

    if (!targetPo) {
      return;
    }

    const nextWorkspace = JSON.parse(JSON.stringify(workspaceState));
    const po = nextWorkspace.purchaseOrders.find((entry) => entry.id === poId);

    if (!po) {
      return;
    }

    po.status = status;
    po.statusHistory = [
      createStatusHistoryEntry(
        status,
        status === "confirmed"
          ? `${po.id} was confirmed and is waiting on supplier execution.`
          : status === "in_transit"
            ? `${po.id} is now in transit and Auretix is tracking the inbound window.`
            : status === "delayed"
              ? `${po.id} was marked delayed and the inbound plan was pushed out by one week.`
              : `${po.id} was received and inventory has landed into the workspace.`,
      ),
      ...(po.statusHistory || []),
    ];

    if (status === "delayed") {
      po.lineItems = po.lineItems.map((line) => ({
        ...line,
        etaDays: line.etaDays + 7,
      }));
    }

    if (status === "in_transit") {
      po.lineItems = po.lineItems.map((line) => ({
        ...line,
        etaDays: Math.max(1, line.etaDays - 3),
      }));
    }

    if (status === "received") {
      for (const line of po.lineItems) {
        const inventory = nextWorkspace.inventoryPositions.find(
          (entry) => entry.productId === line.productId,
        );

        if (inventory) {
          inventory.onHandUnits += line.units;
        }
      }

      po.lineItems = po.lineItems.map((line) => ({
        ...line,
        etaDays: 0,
      }));
    }

    refreshWorkspace(
      scenario,
      nextWorkspace,
      createSyncEvent({
        title: "PO follow-up updated",
        detail: `${po.id} was updated to ${status.replaceAll("_", " ")} and the live plan was refreshed from the new purchase order state.`,
        sku: po.id,
        channel: "Procurement",
        quantity: po.lineItems.reduce((sum, line) => sum + line.units, 0),
        }),
      );
    appendDecisionOutcome(
      createDecisionOutcomeEntry({
        stage: "Live PO update",
        title: `${po.id} moved to ${status.replaceAll("_", " ")}`,
        detail: `${po.supplierName} PO status changed and the workspace was refreshed from that new execution state.`,
        subject: po.id,
        status: status === "received" ? "Closed" : "In progress",
        impact: `${po.lineItems.reduce((sum, line) => sum + line.units, 0)} units`,
      }),
    );
  }

  function updateLivePoCommunication(poId, updates, eventTitle, eventDetail) {
    const nextWorkspace = JSON.parse(JSON.stringify(workspaceState));
    const po = nextWorkspace.purchaseOrders.find((entry) => entry.id === poId);

    if (!po) {
      return;
    }

    Object.assign(po, updates);

    refreshWorkspace(
      scenario,
      nextWorkspace,
      eventTitle
        ? createSyncEvent({
            title: eventTitle,
            detail: eventDetail || `${po.id} communication workflow was updated.`,
            sku: po.id,
            channel: "Procurement",
            quantity: po.lineItems.reduce((sum, line) => sum + line.units, 0),
          })
        : null,
    );
  }

  function updateLivePoCommunicationState(event) {
    const { value } = event.target;

    if (!selectedLivePurchaseOrder) {
      return;
    }

    updateLivePoCommunication(
      selectedLivePurchaseOrder.id,
      { communicationState: value },
      "Supplier communication updated",
      `${selectedLivePurchaseOrder.id} is now marked as ${value.replaceAll("_", " ")}.`,
    );
  }

  function toggleLivePoEscalation() {
    if (!selectedLivePurchaseOrder) {
      return;
    }

    updateLivePoCommunication(
      selectedLivePurchaseOrder.id,
      { escalationFlag: !selectedLivePurchaseOrder.escalationFlag },
      "PO escalation updated",
      `${selectedLivePurchaseOrder.id} escalation flag was ${
        selectedLivePurchaseOrder.escalationFlag ? "cleared" : "raised"
      }.`,
    );
  }

  function addLivePoFollowUpNote() {
    if (!selectedLivePurchaseOrder || !livePoNoteText.trim()) {
      return;
    }

    const noteEntry = createFollowUpEntry(
      livePoNoteText.trim(),
      selectedLivePurchaseOrder.communicationState,
      selectedLivePurchaseOrder.escalationFlag,
    );

    updateLivePoCommunication(
      selectedLivePurchaseOrder.id,
      {
        followUpNotes: [
          noteEntry,
          ...(selectedLivePurchaseOrder.followUpNotes || []).filter(
            (entry) => entry.note !== "No supplier follow-up notes have been logged yet.",
          ),
        ],
      },
      "Supplier follow-up logged",
      `${selectedLivePurchaseOrder.id} received a new supplier follow-up note under ${selectedLivePurchaseOrder.communicationState.replaceAll(
        "_",
        " ",
      )}.`,
    );
    setLivePoNoteText("");
  }

  function generateSupplierPacket() {
    if (!selectedLivePurchaseOrder) {
      return;
    }

    const packet = buildSupplierExecutionPacket(selectedLivePurchaseOrder);

    setSupplierPackets((current) => [
      packet,
      ...current.filter((entry) => entry.poId !== selectedLivePurchaseOrder.id),
    ].slice(0, 10));
    setSyncEvents((current) => [
      createSyncEvent({
        title: "Supplier packet generated",
        detail: `${selectedLivePurchaseOrder.id} now has a supplier-facing execution packet ready with ETA, terms, notes, and issue flags.`,
        sku: selectedLivePurchaseOrder.id,
        channel: "Procurement",
        quantity: selectedLivePurchaseOrder.units,
      }),
      ...current,
    ].slice(0, 8));
  }

  async function copySupplierTemplate(template) {
    const text = formatSupplierTemplate(template, templateDeliveryMode);

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedTemplateId(template.id);
    } catch {
      setCopiedTemplateId(template.id);
    }

    if (!selectedLivePurchaseOrder) {
      return;
    }

    const logEntry = {
      id: `${template.id}-${Date.now()}`,
      templateMode: template.mode,
      deliveryMode: templateDeliveryMode,
      copiedAt: new Date().toLocaleString(),
      channel: template.channel,
      outboundStatus: "prepared",
    };

    setSupplierPackets((current) =>
      current.map((packet) =>
        packet.poId === selectedLivePurchaseOrder.id
          ? {
              ...packet,
              exportHistory: [logEntry, ...(packet.exportHistory || [])].slice(0, 12),
            }
          : packet,
      ),
    );
    setSyncEvents((current) => [
      createSyncEvent({
        title: "Supplier message copied",
        detail: `${selectedLivePurchaseOrder.id} ${template.mode.toLowerCase()} was copied in ${templateDeliveryMode} mode for ${template.channel}.`,
        sku: selectedLivePurchaseOrder.id,
        channel: "Procurement",
        quantity: selectedLivePurchaseOrder.units,
      }),
      ...current,
    ].slice(0, 8));
  }

  function approveSupplierStrategy(action) {
    const nextMemory = {
      ...supplierStrategyMemory,
      [action.id]: {
        strategy: action.recommendedStrategy,
        source: "approved",
        savedAt: new Date().toLocaleString(),
      },
    };

    setSupplierStrategyMemory(nextMemory);
    setSupplierStrategyDrafts((current) => ({
      ...current,
      [action.id]: action.recommendedStrategy,
    }));
    setSyncEvents((current) => [
      createSyncEvent({
        title: "Supplier strategy approved",
        detail: `${action.supplierName} is now stored as ${action.recommendedStrategy} based on the current Auretix recommendation.`,
        sku: action.supplierName,
        channel: "Supplier strategy",
        quantity: 0,
      }),
      ...current,
    ].slice(0, 8));
    refreshWorkspace(scenario, workspaceState, null, nextMemory);
  }

  function updateSupplierStrategyDraft(supplierId, strategy) {
    setSupplierStrategyDrafts((current) => ({
      ...current,
      [supplierId]: strategy,
    }));
  }

  function saveSupplierStrategyOverride(action) {
    const chosenStrategy =
      supplierStrategyDrafts[action.id] ||
      supplierStrategyMemory[action.id]?.strategy ||
      action.recommendedStrategy;
    const nextMemory = {
      ...supplierStrategyMemory,
      [action.id]: {
        strategy: chosenStrategy,
        source: chosenStrategy === action.recommendedStrategy ? "approved" : "override",
        savedAt: new Date().toLocaleString(),
      },
    };

    setSupplierStrategyMemory(nextMemory);
    setSyncEvents((current) => [
      createSyncEvent({
        title: "Supplier strategy saved",
        detail: `${action.supplierName} strategy memory was saved as ${chosenStrategy}.`,
        sku: action.supplierName,
        channel: "Supplier strategy",
        quantity: 0,
      }),
      ...current,
    ].slice(0, 8));
    refreshWorkspace(scenario, workspaceState, null, nextMemory);
  }

  function approveReallocationPlan(plan, selectedOption) {
    const approvedPlan = buildApprovedReallocationRecord(plan, selectedOption);
    const nextApprovedPlans = {
      ...approvedReallocationPlans,
      [plan.productId]: approvedPlan,
    };

    setApprovedReallocationPlans(nextApprovedPlans);
    setDraftPurchaseOrders((current) =>
      current.map((draft) => {
        if (draft.productId !== plan.productId) {
          return draft;
        }

        return {
          ...draft,
          awardDecision: approvedPlan.approvedAward,
          supplierBreakdown: approvedPlan.supplierBreakdown,
          supplierPath: approvedPlan.supplierBreakdown
            .map((supplier) => `${supplier.name} ${supplier.share}%`)
            .join(" + "),
          paymentTerms: approvedPlan.paymentTerms,
          expectedArrival: approvedPlan.approvedInboundPlan,
          expectedLandedMargin: approvedPlan.approvedLandedMargin,
          reviewNotes: `Approved reallocation: ${approvedPlan.approvedSummary}`,
        };
      }),
    );
    setSyncEvents((current) => [
      createSyncEvent({
        title: "Reallocation approved",
        detail: `${plan.sku} approved ${approvedPlan.selectedOptionLabel?.toLowerCase() || "reallocation"} path. Auretix updated the planned draft award and supplier split to match that exact option.`,
        sku: plan.sku,
        channel: "Procurement",
        quantity: approvedPlan.approvedShiftedUnits ?? plan.shiftedUnits,
      }),
      ...current,
    ].slice(0, 8));
    appendDecisionOutcome(
      createDecisionOutcomeEntry({
        stage: "Reallocation approved",
        title: `${plan.sku} approved ${approvedPlan.selectedOptionLabel?.toLowerCase() || "reallocation"} path`,
        detail: `Draft buying behavior now follows ${approvedPlan.approvedSupplierPath || plan.previewSupplierPath}.`,
        subject: plan.sku,
        status: "Approved",
        impact: `${approvedPlan.approvedShiftedUnits ?? plan.shiftedUnits} units`,
      }),
    );
  }

  function updatePacketExportStatus(packetId, logEntryId, outboundStatus) {
    setSupplierPackets((current) =>
      current.map((packet) =>
        packet.id === packetId
          ? {
              ...packet,
              exportHistory: (packet.exportHistory || []).map((entry) =>
                entry.id === logEntryId
                  ? {
                      ...entry,
                      outboundStatus,
                    }
                  : entry,
              ),
            }
          : packet,
      ),
    );

    if (!selectedLivePurchaseOrder) {
      return;
    }

    setSyncEvents((current) => [
      createSyncEvent({
        title: "Supplier communication status updated",
        detail: `${selectedLivePurchaseOrder.id} communication log was updated to ${outboundStatus.replaceAll("_", " ")}.`,
        sku: selectedLivePurchaseOrder.id,
        channel: "Procurement",
        quantity: selectedLivePurchaseOrder.units,
      }),
      ...current,
    ].slice(0, 8));
  }

  useEffect(() => {
    if (decision.badgeText === "Awaiting input") {
      setDecision(buildDecision(scenario));
    }
  }, [decision.badgeText, scenario]);

  function renderConditionalInputs() {
    switch (scenario.businessType) {
      case "retail":
        return (
          <>
            <div className="conditional-input-heading">Retail-specific inputs</div>
            <label htmlFor="seasonalityIntensity">Seasonality intensity (%)</label>
            <input
              id="seasonalityIntensity"
              max="100"
              min="0"
              name="seasonalityIntensity"
              onChange={updateField}
              type="number"
              value={scenario.seasonalityIntensity}
            />
          </>
        );
      case "wholesale":
        return (
          <>
            <div className="conditional-input-heading">Wholesale-specific inputs</div>
            <label htmlFor="accountConcentration">Top account concentration (%)</label>
            <input
              id="accountConcentration"
              max="100"
              min="0"
              name="accountConcentration"
              onChange={updateField}
              type="number"
              value={scenario.accountConcentration}
            />
          </>
        );
      case "manufacturing":
        return (
          <>
            <div className="conditional-input-heading">Manufacturing-specific inputs</div>
            <label htmlFor="componentCriticality">Component criticality (%)</label>
            <input
              id="componentCriticality"
              max="100"
              min="0"
              name="componentCriticality"
              onChange={updateField}
              type="number"
              value={scenario.componentCriticality}
            />

            <label htmlFor="singleSourceRisk">Single-source supplier risk (%)</label>
            <input
              id="singleSourceRisk"
              max="100"
              min="0"
              name="singleSourceRisk"
              onChange={updateField}
              type="number"
              value={scenario.singleSourceRisk}
            />
          </>
        );
      case "distribution":
        return (
          <>
            <div className="conditional-input-heading">Distribution-specific inputs</div>
            <label htmlFor="warehouseCount">Warehouse or node count</label>
            <input
              id="warehouseCount"
              min="1"
              name="warehouseCount"
              onChange={updateField}
              type="number"
              value={scenario.warehouseCount}
            />

            <label htmlFor="nodeImbalance">Node imbalance risk (%)</label>
            <input
              id="nodeImbalance"
              max="100"
              min="0"
              name="nodeImbalance"
              onChange={updateField}
              type="number"
              value={scenario.nodeImbalance}
            />
          </>
        );
      case "consumerBrand":
        return (
          <>
            <div className="conditional-input-heading">Consumer-brand inputs</div>
            <label htmlFor="launchIntensity">Launch intensity (%)</label>
            <input
              id="launchIntensity"
              max="100"
              min="0"
              name="launchIntensity"
              onChange={updateField}
              type="number"
              value={scenario.launchIntensity}
            />

            <label htmlFor="seasonalityIntensity">Seasonality intensity (%)</label>
            <input
              id="seasonalityIntensity"
              max="100"
              min="0"
              name="seasonalityIntensity"
              onChange={updateField}
              type="number"
              value={scenario.seasonalityIntensity}
            />
          </>
        );
      case "ecommerce":
      default:
        return (
          <>
            <div className="conditional-input-heading">Ecommerce inputs</div>
            <label htmlFor="launchIntensity">Promotion or launch intensity (%)</label>
            <input
              id="launchIntensity"
              max="100"
              min="0"
              name="launchIntensity"
              onChange={updateField}
              type="number"
              value={scenario.launchIntensity}
            />

            <label htmlFor="seasonalityIntensity">Seasonality intensity (%)</label>
            <input
              id="seasonalityIntensity"
              max="100"
              min="0"
              name="seasonalityIntensity"
              onChange={updateField}
              type="number"
              value={scenario.seasonalityIntensity}
            />
          </>
        );
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Auretix app</div>
          <h1>{title}</h1>
          <p className="hero-text">{intro}</p>
        </div>
        <nav className="app-nav">
          <Link href="/app">Overview</Link>
          <Link href="/app/procurement">Procurement</Link>
          <Link href="/app/supply-chain">Supply chain</Link>
          <Link href="/app/readiness">Readiness</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/logout">Sign out</Link>
        </nav>
      </header>

      {accountContext ? (
        <div className="trust-strip">
          <div>
            Account mode: {accountContext.mode} | Role: {accountContext.role}
          </div>
          <div>Company: {accountContext.company?.name || "Not signed in"}</div>
          <div>User: {accountContext.user?.email || "Demo session"}</div>
        </div>
      ) : null}

      {backendStatus.message ? (
        <div
          className={`form-status ${
            backendStatus.type === "error" ? "error" : "success"
          }`}
        >
          {backendStatus.message}
          {latestDecisionRunId ? ` Latest run: ${latestDecisionRunId}.` : ""}
        </div>
      ) : null}

      <section className="lab-layout app-lab-layout">
        {showDashboard ? (
          <section className="dashboard-stack">
            <div className="lab-card command-center-card">
              <div className="results-header">
                <h3>Integration + ROI foundation</h3>
                <span className="tier-chip">
                  {roiSnapshot?.proofStatus || "Modeled estimate"}
                </span>
              </div>

              <div className="command-center-topline">
                <div className="result-block">
                  <div className="result-label">Modeled monthly impact</div>
                  <div className="result-value">
                    ${roiSnapshot?.modeledMonthlyImpact?.toLocaleString("en-US") || 0}
                  </div>
                  <div className="result-meta">
                    Current modeled value from stockout prevention, overbuying control, supplier risk, and margin protection.
                  </div>
                </div>
                <div className="result-block">
                  <div className="result-label">Modeled annual impact</div>
                  <div className="result-value">
                    ${roiSnapshot?.modeledAnnualImpact?.toLocaleString("en-US") || 0}
                  </div>
                  <div className="result-meta">
                    Annualized estimate until commerce and accounting integrations provide proof data.
                  </div>
                </div>
                <div className="result-block">
                  <div className="result-label">ROI proof score</div>
                  <div className="result-value">{roiSnapshot?.proofScore || 0}%</div>
                  <div className="result-meta">
                    Connect Shopify or Amazon plus QuickBooks to move from estimate to evidence.
                  </div>
                </div>
              </div>

              <div className="command-center-grid">
                <div className="planning-card">
                  <div className="result-label">Connect live data</div>
                  <div className="timeline-stack">
                    {integrations.map((integration) => (
                      <div className="execution-card" key={integration.id}>
                        <div className="decision-panel-header">
                          <h4>{integration.name}</h4>
                          <span className="tier-chip">{integration.setupState}</span>
                        </div>
                        <p>{integration.purpose}</p>
                        <div className="result-meta">
                          {integration.configured
                            ? integration.connectionStatus === "authorized"
                              ? `Connected as ${integration.accountLabel || integration.name}`
                              : "Credentials are present. Ready for OAuth."
                            : `Missing env: ${integration.missingEnv.join(", ")}`}
                        </div>
                        {integration.id === "shopify" ? (
                          <input
                            onChange={(event) => setShopifyShop(event.target.value)}
                            placeholder="your-store.myshopify.com"
                            type="text"
                            value={shopifyShop}
                          />
                        ) : null}
                        <div className="button-row">
                          <button
                            className="button button-secondary"
                            disabled={!integration.configured}
                            onClick={() => startIntegration(integration.id)}
                            type="button"
                          >
                            Connect {integration.name}
                          </button>
                          <a className="button button-secondary" href={integration.docsUrl}>
                            Docs
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="planning-card">
                  <div className="result-label">ROI proof inputs</div>
                  <div className="timeline-stack">
                    {(roiSnapshot?.proofInputs || []).map((input) => (
                      <div className="execution-card" key={input.label}>
                        <div className="decision-panel-header">
                          <h4>{input.label}</h4>
                          <span className="tier-chip">{input.status}</span>
                        </div>
                        <p>{input.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="planning-card">
                  <div className="result-label">Value drivers</div>
                  <div className="command-impact-grid">
                    {(roiSnapshot?.metrics || []).map((metric) => (
                      <div className="execution-card" key={metric.id}>
                        <div className="result-label">{metric.label}</div>
                        <div className="result-value">{metric.value}</div>
                        <p>{metric.detail}</p>
                      </div>
                    ))}
                  </div>
                  <div className="result-meta">
                    {roiSnapshot?.recommendation || "Run Auretix to calculate ROI impact."}
                  </div>
                </div>
              </div>
            </div>

            <div className="lab-card command-center-card">
              <div className="results-header">
                <h3>Auretix command center</h3>
                <span className="tier-chip">Daily operating brief</span>
              </div>
              <div className="command-center-topline">
                <div className="result-block">
                  <div className="result-label">Today’s critical decisions</div>
                  <div className="result-value">{commandCenter.criticalDecisions.length}</div>
                  <div className="result-meta">
                    Highest-priority calls pulled from live risk, anomalies, recurring patterns, and active workflow.
                  </div>
                </div>
                <div className="result-block">
                  <div className="result-label">Decision confidence</div>
                  <div className="result-value">{commandCenter.confidence.score}%</div>
                  <div className="result-meta">{commandCenter.confidence.label}</div>
                </div>
                <div className="result-block">
                  <div className="result-label">Cash awaiting decisions</div>
                  <div className="result-value">
                    {commandCenter.impactSummary.find((item) => item.id === "impact-cash")?.value}
                  </div>
                  <div className="result-meta">
                    Current open and watch-state exposure still waiting on release calls.
                  </div>
                </div>
              </div>
              <div className="command-center-grid">
                <div className="planning-card">
                  <div className="result-label">Today’s critical decisions</div>
                  <div className="timeline-stack">
                    {commandCenter.criticalDecisions.map((item) => (
                      <button
                        className="execution-card command-center-action-card"
                        key={item.id}
                        onClick={() => jumpToWorkflow(item.target)}
                        type="button"
                      >
                        <div className="decision-panel-header">
                          <h4>{item.title}</h4>
                          <span className="tier-chip">{item.type}</span>
                        </div>
                        <p>{item.detail}</p>
                        <div className="result-meta">Owner: {item.owner}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="planning-card">
                  <div className="result-label">Biggest changes</div>
                  <div className="timeline-stack">
                    {commandCenter.biggestChanges.map((item) => (
                      <div className="execution-card" key={item.id}>
                        <div className="decision-panel-header">
                          <h4>{item.title}</h4>
                        </div>
                        <p>{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="planning-card">
                  <div className="result-label">Confidence + assumptions</div>
                  <div className="result-value">{commandCenter.confidence.label}</div>
                  <div className="result-meta">
                    Confidence score: {commandCenter.confidence.score}%
                  </div>
                  <ul className="action-list command-center-list">
                    {commandCenter.confidence.assumptions.map((assumption) => (
                      <li key={assumption}>{assumption}</li>
                    ))}
                  </ul>
                </div>
                <div className="planning-card">
                  <div className="result-label">Revenue / margin / cash at risk</div>
                  <div className="command-impact-grid">
                    {commandCenter.impactSummary.map((item) => (
                      <div className="execution-card" key={item.id}>
                        <div className="result-label">{item.label}</div>
                        <div className="result-value">{item.value}</div>
                        <p>{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="planning-card">
                  <div className="result-label">Operator inbox</div>
                  <div className="timeline-stack">
                    {commandCenter.operatorInbox.map((task) => (
                      <button
                        className="execution-card command-center-action-card"
                        key={`inbox-${task.id}`}
                        onClick={() => jumpToWorkflow(task.target)}
                        type="button"
                      >
                        <div className="decision-panel-header">
                          <h4>{task.title}</h4>
                          <span className="tier-chip">{task.lane}</span>
                        </div>
                        <div className="result-meta">{task.meta}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="command-center-grid">
              <div className="lab-card">
                <div className="results-header">
                  <h3>Daily change log</h3>
                  <span className="tier-chip">{dailyChangeLog.length} updates</span>
                </div>
                {dailyChangeLog.length > 0 ? (
                  <div className="change-log-groups">
                    {["New", "Resolved", "Worsened"].map((group) => (
                      <div className="change-log-group" key={group}>
                        <div className="decision-panel-header">
                          <h4>{group}</h4>
                          <span className="tier-chip">{groupedDailyChangeLog[group].length}</span>
                        </div>
                        <div className="timeline-stack">
                          {groupedDailyChangeLog[group].length > 0 ? (
                            <>
                              {["Fresh", "Seen"].map((statusLabel) => {
                                  const visibleEntries = groupedDailyChangeLog[group].filter((entry) => {
                                    if (resolvedChangeIds.includes(entry.id)) {
                                      return false;
                                    }

                                    return statusLabel === "Fresh"
                                      ? !acknowledgedChangeIds.includes(entry.id)
                                      : acknowledgedChangeIds.includes(entry.id);
                                  });

                                return (
                                  <div className="change-subgroup" key={`${group}-${statusLabel}`}>
                                    <div className="decision-panel-header">
                                      <div className="result-label">{statusLabel}</div>
                                      <span className="tier-chip">{visibleEntries.length}</span>
                                    </div>
                                    <div className="timeline-stack">
                                      {visibleEntries.length > 0 ? (
                                        visibleEntries.map((entry) => (
                                          <div
                                            className={`execution-card${
                                              entry.target ? " command-center-action-card" : ""
                                            }`}
                                            key={entry.id}
                                            onClick={() =>
                                              entry.target ? jumpToWorkflow(entry.target) : null
                                            }
                                            onKeyDown={(event) => {
                                              if ((event.key === "Enter" || event.key === " ") && entry.target) {
                                                event.preventDefault();
                                                jumpToWorkflow(entry.target);
                                              }
                                            }}
                                            role={entry.target ? "button" : undefined}
                                            tabIndex={entry.target ? 0 : undefined}
                                          >
                                            {(() => {
                                              const effectiveMeta = getEffectiveChangeMeta(entry);

                                              return (
                                                <>
                                                  <div className="decision-panel-header">
                                                    <h4>{entry.title}</h4>
                                                    <span className="tier-chip">
                                                      {entry.badge} • {statusLabel}
                                                    </span>
                                                  </div>
                                                  <p>{entry.detail}</p>
                                                  {effectiveMeta.owner || effectiveMeta.followUpDue ? (
                                                    <div className="change-accountability-row">
                                                      {effectiveMeta.owner ? (
                                                        <div className="result-meta">
                                                          Owner: {effectiveMeta.owner}
                                                        </div>
                                                      ) : null}
                                                      {effectiveMeta.followUpDue ? (
                                                        <div className="result-meta">
                                                          Follow-up due: {effectiveMeta.followUpDue}
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  ) : null}
                                                  {(entry.owner || entry.followUpDue) ? (
                                                    <div className="change-override-grid">
                                                      <div>
                                                        <label htmlFor={`change-owner-${entry.id}`}>Owner</label>
                                                        <select
                                                          className="tracker-select"
                                                          id={`change-owner-${entry.id}`}
                                                          onChange={(event) => {
                                                            event.stopPropagation();
                                                            updateChangeOverride(entry.id, {
                                                              owner: event.target.value,
                                                            });
                                                          }}
                                                          onClick={(event) => event.stopPropagation()}
                                                          value={effectiveMeta.owner}
                                                        >
                                                          <option value="Operations lead">Operations lead</option>
                                                          <option value="Inventory lead">Inventory lead</option>
                                                          <option value="Demand planner">Demand planner</option>
                                                          <option value="Procurement lead">Procurement lead</option>
                                                          <option value="Finance lead">Finance lead</option>
                                                        </select>
                                                      </div>
                                                      <div>
                                                        <label htmlFor={`change-due-${entry.id}`}>Follow-up due</label>
                                                        <select
                                                          className="tracker-select"
                                                          id={`change-due-${entry.id}`}
                                                          onChange={(event) => {
                                                            event.stopPropagation();
                                                            updateChangeOverride(entry.id, {
                                                              followUpDue: event.target.value,
                                                            });
                                                          }}
                                                          onClick={(event) => event.stopPropagation()}
                                                          value={effectiveMeta.followUpDue}
                                                        >
                                                          <option value="Due today">Due today</option>
                                                          <option value="Due tomorrow">Due tomorrow</option>
                                                          <option value="Due this week">Due this week</option>
                                                          <option value="Review this cycle">Review this cycle</option>
                                                          <option value="Confirm next cycle">Confirm next cycle</option>
                                                          <option value="Snoozed to next week">Snoozed to next week</option>
                                                        </select>
                                                      </div>
                                                    </div>
                                                  ) : null}
                                                  {entry.diff?.length > 0 ? (
                                                    <div className="change-diff-grid">
                                                      {entry.diff.map((row) => (
                                                        <div
                                                          className="change-diff-row"
                                                          key={`${entry.id}-${row.label}`}
                                                        >
                                                          <div className="result-label">{row.label}</div>
                                                          <div className="result-meta">
                                                            {row.before} {" -> "} {row.after}
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  ) : null}
                                                  {entry.explanation ? (
                                                    <div className="change-explanation-block">
                                                      <button
                                                        className="button button-secondary change-explanation-toggle"
                                                        onClick={(event) => {
                                                          event.stopPropagation();
                                                          setExpandedChangeId((current) =>
                                                            current === entry.id ? null : entry.id,
                                                          );
                                                        }}
                                                        type="button"
                                                      >
                                                        {expandedChangeId === entry.id
                                                          ? "Hide why Auretix believes this changed"
                                                          : "Why Auretix believes this changed"}
                                                      </button>
                                                      {expandedChangeId === entry.id ? (
                                                        <div className="change-explanation-copy">
                                                          {entry.explanation}
                                                        </div>
                                                      ) : null}
                                                    </div>
                                                  ) : null}
                                                  <div className="button-row template-copy-row">
                                                    {!acknowledgedChangeIds.includes(entry.id) ? (
                                                      <button
                                                        className="button button-secondary"
                                                        onClick={(event) => {
                                                          event.stopPropagation();
                                                          acknowledgeChange(entry.id);
                                                        }}
                                                        type="button"
                                                      >
                                                        Acknowledge change
                                                      </button>
                                                    ) : (
                                                      <div className="result-meta">Already seen</div>
                                                    )}
                                                    <button
                                                      className="button button-primary"
                                                      onClick={(event) => {
                                                        event.stopPropagation();
                                                        markChangeResolved(entry);
                                                      }}
                                                      type="button"
                                                    >
                                                      Mark resolved
                                                    </button>
                                                  </div>
                                                  <div className="result-meta">{entry.timeLabel}</div>
                                                </>
                                              );
                                            })()}
                                          </div>
                                        ))
                                      ) : (
                                        <div className="execution-card empty-card">
                                          No {statusLabel.toLowerCase()} {group.toLowerCase()} changes.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </>
                          ) : (
                            <div className="execution-card empty-card">
                              No {group.toLowerCase()} changes logged in the latest cycle.
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="execution-card empty-card">
                    Auretix will start logging risk, cash, and execution changes as the workspace moves.
                  </div>
                )}
                {resolvedChanges.length > 0 ? (
                  <div className="change-resolved-summary">
                    <div className="results-header">
                      <div className="result-label">Resolved change archive</div>
                      <span className="tier-chip">{resolvedChanges.length} resolved</span>
                    </div>
                    <div className="timeline-stack">
                      {resolvedChanges.slice(0, 4).map((entry) => (
                        <div className="execution-card" key={`resolved-${entry.id}`}>
                          <div className="decision-panel-header">
                            <h4>{entry.title}</h4>
                            <span className="tier-chip">{entry.badge}</span>
                          </div>
                          <p>{entry.detail}</p>
                          <div className="result-meta">
                            Resolved at: {entry.resolvedAt}
                          </div>
                          <label htmlFor={`reopen-reason-${entry.id}`}>Reason for reopening</label>
                          <textarea
                            className="inventory-import-textarea reopen-reason-input"
                            id={`reopen-reason-${entry.id}`}
                            onChange={(event) =>
                              setReopenReasonDrafts((current) => ({
                                ...current,
                                [entry.id]: event.target.value,
                              }))
                            }
                            placeholder="Example: supplier slipped again, demand spike returned, issue was not actually fixed."
                            value={reopenReasonDrafts[entry.id] || ""}
                          />
                          <div className="button-row template-copy-row">
                            <button
                              className="button button-secondary"
                              onClick={() => reopenChange(entry)}
                              type="button"
                            >
                              Reopen change
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="lab-card">
                <div className="results-header">
                  <h3>Recurrence insights</h3>
                  <span className="tier-chip">{recurrenceInsights.length} patterns</span>
                </div>
                <div className="timeline-stack">
                  {recurrenceInsights.length > 0 ? (
                    recurrenceInsights.map((insight) => {
                      const linkedPlans = fixPlans.filter((plan) => plan.insightId === insight.id);
                      const fixStatus = buildFixPlanStatusForInsight(insight.id, fixPlans);

                      return (
                        <div className="execution-card" key={insight.id}>
                          <div className="decision-panel-header">
                            <h4>{insight.title}</h4>
                            <span className="tier-chip">{insight.effectiveCount} active</span>
                          </div>
                          <p>{insight.detail}</p>
                          <div className="change-accountability-row">
                            <div className="result-meta">Treatment status: {fixStatus.label}</div>
                            <div className="result-meta">Linked plans: {linkedPlans.length}</div>
                            <div className="result-meta">Raw recurrence: {insight.count}x</div>
                            <div className="result-meta">Active pressure: {insight.effectiveCount}x</div>
                          </div>
                          <div className="change-explanation-copy recurrence-fix-copy">
                            {insight.fixPath}
                          </div>
                          <div className="result-meta recurrence-status-copy">
                            {fixStatus.detail} Current recurrence pressure: {insight.pressureLabel}.
                          </div>
                          {insight.examples.length > 0 ? (
                            <div className="change-diff-grid">
                              {insight.examples.map((example) => (
                                <div className="change-diff-row" key={`${insight.id}-${example}`}>
                                  <div className="result-label">Recent reopen reason</div>
                                  <div className="result-meta">{example}</div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className="button-row template-copy-row">
                            <button
                              className="button button-primary"
                              onClick={() => createFixPlan(insight)}
                              type="button"
                            >
                              {linkedPlans.length > 0 ? "Open another fix plan" : "Create fix plan"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="execution-card empty-card">
                      Auretix will surface recurrence patterns here once reopened changes start building a history.
                    </div>
                  )}
                </div>
              </div>

              <div className="lab-card">
                <div className="results-header">
                  <h3>Fix plan board</h3>
                  <span className="tier-chip">{fixPlans.length} initiatives</span>
                </div>
                <div className="timeline-stack">
                  {fixPlans.length > 0 ? (
                    fixPlans.map((plan) => (
                      <div className="execution-card" key={plan.id}>
                        <div className="decision-panel-header">
                          <h4>{plan.title}</h4>
                          <span className="tier-chip">{plan.status}</span>
                        </div>
                        <p>{plan.summary}</p>
                        <div className="change-override-grid">
                          <div>
                            <label htmlFor={`fix-plan-owner-${plan.id}`}>Owner</label>
                            <select
                              className="tracker-select"
                              id={`fix-plan-owner-${plan.id}`}
                              onChange={(event) =>
                                updateFixPlan(plan.id, { owner: event.target.value })
                              }
                              value={plan.owner}
                            >
                              <option value="Operations lead">Operations lead</option>
                              <option value="Inventory lead">Inventory lead</option>
                              <option value="Demand planner">Demand planner</option>
                              <option value="Procurement lead">Procurement lead</option>
                              <option value="Finance lead">Finance lead</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor={`fix-plan-due-${plan.id}`}>Due window</label>
                            <select
                              className="tracker-select"
                              id={`fix-plan-due-${plan.id}`}
                              onChange={(event) =>
                                updateFixPlan(plan.id, { dueWindow: event.target.value })
                              }
                              value={plan.dueWindow}
                            >
                              <option value="Start this week">Start this week</option>
                              <option value="Review this cycle">Review this cycle</option>
                              <option value="This month">This month</option>
                            </select>
                          </div>
                        </div>
                        <div className="change-accountability-row">
                          <div className="result-meta">Owner: {plan.owner}</div>
                          <div className="result-meta">Due: {plan.dueWindow}</div>
                          <div className="result-meta">Created: {plan.createdAt}</div>
                        </div>
                        <div className="button-row template-copy-row">
                          <button
                            className="button button-secondary"
                            onClick={() => updateFixPlan(plan.id, { status: "In progress" })}
                            type="button"
                          >
                            Mark in progress
                          </button>
                          <button
                            className="button button-primary"
                            onClick={() => updateFixPlan(plan.id, { status: "Closed" })}
                            type="button"
                          >
                            Mark closed
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="execution-card empty-card">
                      Create a fix plan from a recurrence insight to start a tracked operating initiative.
                    </div>
                  )}
                </div>
              </div>

              <div className="lab-card">
                <div className="results-header">
                  <h3>Decision outcome tracking</h3>
                  <span className="tier-chip">{decisionOutcomeLog.length} outcomes</span>
                </div>
                <div className="timeline-stack">
                  {decisionOutcomeLog.length > 0 ? (
                    decisionOutcomeLog.map((entry) => (
                      <div className="execution-card" key={entry.id}>
                        <div className="decision-panel-header">
                          <h4>{entry.title}</h4>
                          <span className="tier-chip">{entry.stage}</span>
                        </div>
                        <p>{entry.detail}</p>
                        <div className="result-meta">
                          {entry.status} | {entry.subject}
                          {entry.impact ? ` | ${entry.impact}` : ""}
                        </div>
                        <div className="result-meta">{entry.timeLabel}</div>
                      </div>
                    ))
                  ) : (
                    <div className="execution-card empty-card">
                      Auretix will start recording approved, released, and received outcomes as operators use the workflow.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="dashboard-overview-grid">
              <div className="result-block">
                <div className="result-label">Highest risk SKU</div>
                <div className="result-value">{queue.overview.highestRiskSku}</div>
                <div className="result-meta">
                  Risk score: {queue.overview.highestRiskScore}/100
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Monthly profit leader</div>
                <div className="result-value">{queue.overview.topProfitSku}</div>
                <div className="result-meta">
                  Estimated monthly profit: ${queue.overview.topProfitValue}
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Highest efficiency SKU</div>
                <div className="result-value">{queue.overview.topGrowthSku}</div>
                <div className="result-meta">
                  Capital efficiency: {queue.overview.topGrowthValue}
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Margin leak to watch</div>
                <div className="result-value">{queue.overview.marginLeakSku}</div>
                <div className="result-meta">
                  Gross margin: {queue.overview.marginLeakValue}%
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">If cash is limited</div>
                <div className="result-value">{queue.overview.cashProtectedOrder}</div>
                <div className="result-meta">
                  Auretix would protect these first before funding lower-priority items.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Current strategy</div>
                <div className="result-value">{queue.overview.objectiveLabel}</div>
                <div className="result-meta">
                  The queue and action paths are being optimized for this business objective.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Scenario mode</div>
                <div className="result-value">{queue.overview.scenarioLabel}</div>
                <div className="result-meta">
                  This shows which future condition the portfolio is currently being tested against.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Cash-safe budget</div>
                <div className="result-value">${queue.overview.cashBudget}</div>
                <div className="result-meta">
                  The modeled plan is being checked against a near-term funding limit.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Capacity gap</div>
                <div className="result-value">
                  {queue.overview.capacityGap > 0 ? `+${queue.overview.capacityGap}` : queue.overview.capacityGap}
                </div>
                <div className="result-meta">
                  Positive means the recommended plan would exceed current storage capacity.
                </div>
              </div>
            </div>

            <div className="dashboard-overview-grid playbook-strip">
              <div className="result-block playbook-block protect-block">
                <div className="result-label">Protect</div>
                <div className="result-value">{queue.playbookSummary.protect}</div>
                <div className="result-meta">
                  SKUs where continuity, revenue, or account confidence must be protected.
                </div>
              </div>
              <div className="result-block playbook-block grow-block">
                <div className="result-label">Grow</div>
                <div className="result-value">{queue.playbookSummary.grow}</div>
                <div className="result-meta">
                  SKUs that deserve more funding because demand and economics are working.
                </div>
              </div>
              <div className="result-block playbook-block fix-block">
                <div className="result-label">Fix</div>
                <div className="result-value">{queue.playbookSummary.fix}</div>
                <div className="result-meta">
                  SKUs that need margin, supplier, or planning repair before scaling harder.
                </div>
              </div>
              <div className="result-block playbook-block deprioritize-block">
                <div className="result-label">Deprioritize</div>
                <div className="result-value">{queue.playbookSummary.deprioritize}</div>
                <div className="result-meta">
                  SKUs that should run lean until they earn capital priority again.
                </div>
              </div>
            </div>

            <div className="dashboard-overview-grid playbook-strip">
              <div className="result-block">
                <div className="result-label">Open approvals</div>
                <div className="result-value">{approvalSummary.Open}</div>
                <div className="result-meta">
                  Decision items still waiting for an approval or defer call.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Approved spend</div>
                <div className="result-value">${approvalSummary.approvedSpend}</div>
                <div className="result-meta">
                  Value of currently approved replenishment or protection actions.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Pending exposure</div>
                <div className="result-value">${approvalSummary.pendingValue}</div>
                <div className="result-meta">
                  Cash tied to open or watching actions that still need a decision.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Workspace type</div>
                <div className="result-value">{queue.workspace.businessLabel}</div>
                <div className="result-meta">
                  This dashboard is now running on seeded products, suppliers, and purchase orders.
                </div>
              </div>
            </div>

            <div className="dashboard-overview-grid inventory-summary-grid">
              <div className="result-block">
                <div className="result-label">Tracked SKUs</div>
                <div className="result-value">{queue.items.length}</div>
                <div className="result-meta">
                  Items currently in the decision queue.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Total on hand</div>
                <div className="result-value">{queue.overview.totalOnHand}</div>
                <div className="result-meta">
                  Units currently available across the tracked portfolio.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Inbound units</div>
                <div className="result-value">{queue.overview.totalInbound}</div>
                <div className="result-meta">
                  Units in transit or arriving on open purchase orders.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Reserved units</div>
                <div className="result-value">{queue.overview.totalReserved}</div>
                <div className="result-meta">
                  Units already committed to demand or allocation.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Below reorder point</div>
                <div className="result-value">{queue.overview.belowReorderCount}</div>
                <div className="result-meta">
                  SKUs already under the inventory level where replenishment should start.
                </div>
              </div>
              <div className="result-block">
                <div className="result-label">Excess inventory</div>
                <div className="result-value">{queue.overview.excessCount}</div>
                <div className="result-meta">
                  SKUs carrying more inventory than current demand needs.
                </div>
              </div>
            </div>

            <div className="lab-card" id="decision-queue-section">
              <div className="results-header">
                <h3>Decision queue</h3>
                <span className="tier-chip">Multi-SKU</span>
              </div>
              <div className="queue-table">
                <div className="queue-table-header">
                  <span>SKU</span>
                  <span>Lane</span>
                  <span>Risk</span>
                  <span>Priority</span>
                  <span>Role</span>
                  <span>Available</span>
                  <span>ROP</span>
                  <span>ETA</span>
                  <span>Margin</span>
                  <span>Monthly profit</span>
                  <span>Recommended PO</span>
                  <span>Cash</span>
                </div>
                {queue.items.map((item) => (
                  <button
                    className={`queue-table-row queue-table-button${
                      selectedItem?.sku === item.sku ? " selected-row" : ""
                    }`}
                    key={item.sku}
                    onClick={() => setSelectedSku(item.sku)}
                    type="button"
                  >
                    <span>{item.sku}</span>
                    <span>{item.playbookLabel}</span>
                    <span>{item.riskScore}/100</span>
                    <span>{item.priority}</span>
                    <span>{item.roleLabel}</span>
                    <span>{item.availableUnits}</span>
                    <span>{item.reorderPointUnits}</span>
                    <span>{item.nextEtaDays}d</span>
                    <span>{item.grossMarginPct}%</span>
                    <span>${item.monthlyProfit}</span>
                    <span>{item.reorderUnits}</span>
                    <span>${item.cashImpact}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="decision-panel-grid">
              {queue.topActions.map((item) => (
                <div className="decision-panel active-panel" key={`${item.rank}-${item.sku}`}>
                  <div className="decision-panel-header">
                    <h4>
                      #{item.rank} {item.sku}
                    </h4>
                    <span className="tier-chip">{item.badge}</span>
                  </div>
                  <div className="result-label inline-summary-label">{item.title}</div>
                  <p className="queue-action-copy">{item.detail}</p>
                </div>
              ))}
            </div>

            <div className="lab-card" id="supplier-relationship-section">
              <div className="results-header">
                <h3>Execution board</h3>
                <span className="tier-chip">Today / This Week / Later</span>
              </div>
              <div className="execution-board">
                <div className="execution-column">
                  <div className="result-label">Today</div>
                  {queue.executionBoard.today.length > 0 ? (
                    queue.executionBoard.today.map((item) => (
                      <div className="execution-card" key={`today-${item.sku}`}>
                        <strong>{item.sku}</strong>
                        <p>{item.detail}</p>
                      </div>
                    ))
                  ) : (
                    <div className="execution-card empty-card">No immediate actions right now.</div>
                  )}
                </div>
                <div className="execution-column">
                  <div className="result-label">This week</div>
                  {queue.executionBoard.thisWeek.length > 0 ? (
                    queue.executionBoard.thisWeek.map((item) => (
                      <div className="execution-card" key={`week-${item.sku}`}>
                        <strong>{item.sku}</strong>
                        <p>{item.detail}</p>
                      </div>
                    ))
                  ) : (
                    <div className="execution-card empty-card">No this-week actions queued.</div>
                  )}
                </div>
                <div className="execution-column">
                  <div className="result-label">Later</div>
                  {queue.executionBoard.later.length > 0 ? (
                    queue.executionBoard.later.map((item) => (
                      <div className="execution-card" key={`later-${item.sku}`}>
                        <strong>{item.sku}</strong>
                        <p>{item.detail}</p>
                      </div>
                    ))
                  ) : (
                    <div className="execution-card empty-card">No later-stage follow-ups queued.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="lab-card" id="open-purchase-orders-section">
              <div className="results-header">
                <h3>Portfolio-wide solutions</h3>
                <span className="tier-chip">Strategy-aware</span>
              </div>
              <ul className="action-list">
                {queue.portfolioRecommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="lab-card" id="task-workflow-section">
              <div className="results-header">
                <h3>30 / 60 / 90-day planning</h3>
                <span className="tier-chip">S&amp;OP board</span>
              </div>
              <div className="planning-board">
                {queue.planningBoard.map((phase) => (
                  <div className="planning-card" key={phase.horizon}>
                    <div className="decision-panel-header">
                      <h4>{phase.horizon}</h4>
                      <span className="tier-chip">{phase.badge}</span>
                    </div>
                    <p className="queue-action-copy">{phase.focus}</p>
                    <ul className="action-list">
                      {phase.outcomes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Scenario compare</h3>
                <span className="tier-chip">Normal vs stress</span>
              </div>
              <div className="scenario-compare-grid">
                {queue.scenarioCompare.map((entry) => (
                  <div className="scenario-compare-card" key={entry.mode}>
                    <div className="result-label">{entry.label}</div>
                    <div className="result-value">{entry.highestRiskSku}</div>
                    <div className="result-meta">Immediate cash: ${entry.immediateCash}</div>
                    <div className="result-meta">Protect lanes: {entry.protectCount}</div>
                    <div className="result-meta">Fix lanes: {entry.fixCount}</div>
                    <div className="result-meta">Workspace alerts: {entry.openAlerts}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Constraint-aware recommendations</h3>
                <span className="tier-chip">Cash / capacity / MOQ</span>
              </div>
              <ul className="action-list">
                {queue.constraintRecommendations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Procurement optimizer</h3>
                <span className="tier-chip">Buy smarter</span>
              </div>
              <ul className="action-list">
                {queue.workspace.procurementOptimizer.optimizerSummary.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="planning-board">
                {queue.workspace.procurementOptimizer.recommendations.map((item) => (
                  <div className="planning-card" key={`optimizer-${item.id}`}>
                    <div className="decision-panel-header">
                      <h4>{item.product}</h4>
                      <span className="tier-chip">{item.shippingMode}</span>
                    </div>
                    <div className="result-meta">PO strategy: {item.poStrategy}</div>
                    <div className="result-meta">Supplier path: {item.supplierDecision}</div>
                    <div className="result-meta">
                      Best buy: {item.bestBuyUnits} units
                    </div>
                    <div className="result-meta">
                      Cash-safe max: {item.maxAffordableUnits} units
                    </div>
                    <div className="result-meta">Cycle spend: ${item.spend}</div>
                    <p className="queue-action-copy">{item.rationale}</p>
                    <div className="award-decision-card">
                      <div className="decision-panel-header">
                        <div>
                          <div className="result-label">Recommended award</div>
                          <div className="result-value">{item.recommendedAward}</div>
                        </div>
                        <span className="tier-chip">{item.bestBuyUnits} units</span>
                      </div>
                      <p className="queue-action-copy">{item.awardReason}</p>
                      <div className="button-row">
                        <button
                          className="button button-primary"
                          onClick={() => createDraftPo(item)}
                          type="button"
                        >
                          Create draft PO
                        </button>
                      </div>
                    </div>
                    <div className="tracker-table optimizer-compare-table">
                      <div className="tracker-table-header supplier-compare-header">
                        <span>Supplier</span>
                        <span>Unit cost</span>
                        <span>Landed cost</span>
                        <span>Lead time</span>
                        <span>Reliability</span>
                        <span>Terms</span>
                        <span>Shipping</span>
                        <span>Landed margin</span>
                        <span>Fit</span>
                      </div>
                      {item.supplierComparisons.map((comparison) => (
                        <div className="tracker-table-row supplier-compare-row" key={comparison.id}>
                          <span>{comparison.name}</span>
                          <span>${comparison.unitCost.toFixed(2)}</span>
                          <span>${comparison.landedUnitCost.toFixed(2)}</span>
                          <span>{comparison.leadTimeDays}d</span>
                          <span>{comparison.reliability}%</span>
                          <span>{comparison.paymentTerms}</span>
                          <span>{comparison.shippingMode}</span>
                          <span>{comparison.landedMarginPct}%</span>
                          <span>
                            <span className="optimizer-fit-chip">{comparison.recommendation}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="tracker-table optimizer-compare-table">
                      <div className="tracker-table-header scenario-sim-header">
                        <span>Scenario</span>
                        <span>Landed margin</span>
                        <span>Arrival date</span>
                        <span>Service risk</span>
                        <span>Cash timing</span>
                        <span>Delay odds</span>
                        <span>Award</span>
                      </div>
                      {item.awardScenarios.map((scenario) => (
                        <div className="tracker-table-row scenario-sim-row" key={scenario.id}>
                          <span>{scenario.label}</span>
                          <span>{scenario.landedMarginPct}%</span>
                          <span>{scenario.arrivalDate}</span>
                          <span>{scenario.serviceRisk}</span>
                          <span>{scenario.cashOutTiming}</span>
                          <span>{scenario.probabilityOfDelay}%</span>
                          <span>
                            <span className="optimizer-fit-chip">{scenario.decision}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="tracker-table optimizer-compare-table">
                      <div className="tracker-table-header supplier-memory-header">
                        <span>Supplier</span>
                        <span>On-time</span>
                        <span>Lead drift</span>
                        <span>Defect risk</span>
                        <span>Terms quality</span>
                        <span>Historical score</span>
                      </div>
                      {item.supplierMemory.map((memory) => (
                        <div className="tracker-table-row supplier-memory-row" key={`${memory.id}-memory`}>
                          <span>{memory.name}</span>
                          <span>{memory.onTimeRate}%</span>
                          <span>{memory.leadTimeDriftDays}d</span>
                          <span>{memory.defectRisk}</span>
                          <span>{memory.termsQuality}</span>
                          <span>{memory.historicalRecommendationScore}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Forecast board</h3>
                <span className="tier-chip">30 / 60 / 90 days</span>
              </div>
              <div className="tracker-table">
                <div className="tracker-table-header forecast-table-header">
                  <span>Product</span>
                  <span>Channel</span>
                  <span>30d</span>
                  <span>60d</span>
                  <span>90d</span>
                  <span>Confidence</span>
                </div>
                {queue.workspace.forecastBoard.map((forecast) => (
                  <div className="tracker-table-row forecast-table-row" key={`forecast-${forecast.id}`}>
                    <span>{forecast.name}</span>
                    <span>{forecast.channel}</span>
                    <span>{forecast.forecast30}</span>
                    <span>{forecast.forecast60}</span>
                    <span>{forecast.forecast90}</span>
                    <span>{forecast.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Anomaly detection</h3>
                <span className="tier-chip">{queue.workspace.anomalies.length} anomalies</span>
              </div>
              <div className="timeline-stack">
                {queue.workspace.anomalies.map((anomaly) => (
                  <div className="planning-card" key={anomaly.id}>
                    <div className="decision-panel-header">
                      <h4>{anomaly.title}</h4>
                      <span className="tier-chip">{anomaly.severity}</span>
                    </div>
                    <p className="queue-action-copy">{anomaly.detail}</p>
                    <div className="result-meta">Owner: {anomaly.owner}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Channel sync</h3>
                <span className="tier-chip">Amazon-ready mock</span>
              </div>
              <div className="scenario-compare-grid">
                {syncChannels.map((channel) => (
                  <div className="scenario-compare-card" key={channel.id}>
                    <div className="result-label">{channel.name}</div>
                    <div className="result-value">{channel.connectionStatus}</div>
                    <div className="result-meta">Sync mode: {channel.syncMode}</div>
                    <div className="result-meta">Health: {channel.health}</div>
                    <div className="result-meta">Last event: {channel.lastSyncLabel}</div>
                  </div>
                ))}
              </div>
              <div className="button-row">
                <button className="button button-primary" onClick={simulateAmazonSale} type="button">
                  Simulate Amazon sale
                </button>
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Channel allocation</h3>
                <span className="tier-chip">{queue.workspace.channelAllocations.length} channels</span>
              </div>
              <div className="tracker-table">
                <div className="tracker-table-header channel-table-header">
                  <span>Channel</span>
                  <span>Products</span>
                  <span>Revenue</span>
                  <span>Profit %</span>
                  <span>Risk load</span>
                  <span>Allocation</span>
                </div>
                {queue.workspace.channelAllocations.map((channel) => (
                  <div className="tracker-table-row channel-table-row" key={channel.channel}>
                    <span>{channel.channel}</span>
                    <span>{channel.products}</span>
                    <span>${channel.monthlyRevenue}</span>
                    <span>{channel.profitShare}%</span>
                    <span>{channel.riskLoad}</span>
                    <span>{channel.recommendedAllocation}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Shared inventory ledger</h3>
                <span className="tier-chip">{queue.items.length} live items</span>
              </div>
              <div className="tracker-table">
                <div className="tracker-table-header ledger-table-header">
                  <span>Product</span>
                  <span>Channel</span>
                  <span>On hand</span>
                  <span>Reserved</span>
                  <span>Available</span>
                  <span>Next ETA</span>
                </div>
                {queue.items.map((item) => (
                  <div className="tracker-table-row ledger-table-row" key={`ledger-${item.id}`}>
                    <span>{item.name}</span>
                    <span>{item.channel}</span>
                    <span>{item.onHandUnits}</span>
                    <span>{item.reservedUnits}</span>
                    <span>{item.availableUnits}</span>
                    <span>{item.nextEtaDays} days</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Sync event timeline</h3>
                <span className="tier-chip">{syncEvents.length} events</span>
              </div>
              <div className="timeline-stack">
                {syncEvents.map((event) => (
                  <div className="planning-card" key={event.id}>
                    <div className="decision-panel-header">
                      <h4>{event.title}</h4>
                      <span className="tier-chip">{event.timeLabel}</span>
                    </div>
                    <p className="queue-action-copy">{event.detail}</p>
                    <div className="result-meta">
                      Channel: {event.channel} | SKU: {event.sku} | Qty: {event.quantity}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Supplier risk board</h3>
                <span className="tier-chip">{queue.workspace.suppliers.length} suppliers</span>
              </div>
              <div className="tracker-table">
                <div className="tracker-table-header supplier-table-header">
                  <span>Supplier</span>
                  <span>Region</span>
                  <span>Reliability</span>
                  <span>Lead time</span>
                  <span>Open POs</span>
                  <span>At-risk products</span>
                </div>
                {queue.workspace.suppliers.map((supplier) => (
                  <div className="tracker-table-row supplier-table-row" key={supplier.id}>
                    <span>{supplier.name}</span>
                    <span>{supplier.region}</span>
                    <span>{supplier.reliability}%</span>
                    <span>{supplier.leadTimeDays} days</span>
                    <span>{supplier.openPoCount}</span>
                    <span>{supplier.atRisk}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Supplier scorecards</h3>
                <span className="tier-chip">{queue.workspace.supplierScorecards.length} scorecards</span>
              </div>
              <div className="tracker-table">
                <div className="tracker-table-header scorecard-table-header">
                  <span>Supplier</span>
                  <span>Grade</span>
                  <span>Reliability</span>
                  <span>Avg risk</span>
                  <span>Avg margin</span>
                  <span>Recommendation</span>
                </div>
                {queue.workspace.supplierScorecards.map((supplier) => (
                  <div className="tracker-table-row scorecard-table-row" key={`score-${supplier.id}`}>
                    <span>{supplier.name}</span>
                    <span>{supplier.supplierGrade}</span>
                    <span>{supplier.reliability}%</span>
                    <span>{supplier.avgRisk}</span>
                    <span>{supplier.avgMargin}%</span>
                    <span>{supplier.recommendation}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Supplier relationship dashboard</h3>
                <span className="tier-chip">{supplierRelationshipRows.length} suppliers</span>
              </div>
              <div className="tracker-table">
                <div className="tracker-table-header relationship-table-header">
                  <span>Supplier</span>
                  <span>Prepared</span>
                  <span>Replies</span>
                  <span>No response</span>
                  <span>Escalations</span>
                  <span>Response rate</span>
                  <span>Response speed</span>
                  <span>Drag signal</span>
                </div>
                {supplierRelationshipRows.map((supplier) => (
                  <div className="tracker-table-row relationship-table-row" key={`relationship-${supplier.id}`}>
                    <span>{supplier.name}</span>
                    <span>{supplier.messagesPrepared}</span>
                    <span>{supplier.repliedCount}</span>
                    <span>{supplier.noResponseCount}</span>
                    <span>{supplier.escalationCount}</span>
                    <span>{supplier.responseRate}%</span>
                    <span>{supplier.responseSpeedLabel}</span>
                    <span>{supplier.dragSignal}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Supplier action recommendations</h3>
                <span className="tier-chip">{supplierActionRecommendations.length} actions</span>
              </div>
              <div className="timeline-stack">
                {supplierActionRecommendations.map((action) => (
                  <div className="planning-card" key={`supplier-action-${action.id}`}>
                    <div className="decision-panel-header">
                      <h4>{action.title}</h4>
                      <span className="tier-chip">{action.badge}</span>
                    </div>
                    <p className="queue-action-copy">{action.detail}</p>
                    <div className="result-meta">
                      Supplier: {action.supplierName} | Response rate: {action.responseRate}% |
                      Drag signal: {action.dragSignal}
                    </div>
                    <div className="result-meta">
                      Strategy memory:{" "}
                      {action.memory
                        ? `${action.memory.strategy} (${action.memory.source})`
                        : "No stored strategy yet"}
                    </div>
                    <div className="button-row template-copy-row">
                      <button
                        className="button button-secondary"
                        onClick={() => approveSupplierStrategy(action)}
                        type="button"
                      >
                        Approve recommendation
                      </button>
                      <select
                        className="tracker-select supplier-strategy-select"
                        onChange={(event) =>
                          updateSupplierStrategyDraft(action.id, event.target.value)
                        }
                        value={
                          supplierStrategyDrafts[action.id] ||
                          action.memory?.strategy ||
                          action.recommendedStrategy
                        }
                      >
                        <option value="preferred">Preferred</option>
                        <option value="watch">Watch</option>
                        <option value="reduce">Reduce</option>
                        <option value="exit">Exit</option>
                      </select>
                      <button
                        className="button button-primary"
                        onClick={() => saveSupplierStrategyOverride(action)}
                        type="button"
                      >
                        Save strategy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Supplier exposure control</h3>
                <span className="tier-chip">{supplierExposurePortfolio.rows.length} suppliers</span>
              </div>
              <div className="tracker-table">
                <div className="tracker-table-header exposure-table-header">
                  <span>Supplier</span>
                  <span>Strategy</span>
                  <span>Live units</span>
                  <span>Planned units</span>
                  <span>Total units</span>
                  <span>Total value</span>
                  <span>Open issues</span>
                  <span>Signal</span>
                </div>
                {supplierExposurePortfolio.rows.map((supplier) => (
                  <div className="tracker-table-row exposure-table-row" key={`exposure-${supplier.id}`}>
                    <span>{supplier.supplierName}</span>
                    <span>{supplier.strategy}</span>
                    <span>{supplier.liveUnits}</span>
                    <span>{supplier.plannedUnits}</span>
                    <span>{supplier.totalUnits}</span>
                    <span>${supplier.totalValue}</span>
                    <span>{supplier.openIssues}</span>
                    <span>{supplier.concentrationSignal}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Supplier rebalance recommendations</h3>
                <span className="tier-chip">
                  {supplierExposurePortfolio.recommendations.length} moves
                </span>
              </div>
              <div className="timeline-stack">
                {supplierExposurePortfolio.recommendations.map((action) => (
                  <div className="planning-card" key={`rebalance-${action.id}`}>
                    <div className="decision-panel-header">
                      <h4>{action.title}</h4>
                      <span className="tier-chip">{action.badge}</span>
                    </div>
                    <p className="queue-action-copy">{action.detail}</p>
                    <div className="result-meta">Supplier: {action.supplierName}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Cross-supplier reallocation planner</h3>
                <span className="tier-chip">{crossSupplierReallocationPlan.length} shifts</span>
              </div>
              <div className="timeline-stack">
                {crossSupplierReallocationPlan.map((plan) => (
                  <div className="planning-card" key={plan.id}>
                    {approvedReallocationPlans[plan.productId] ? (
                      <div className="result-meta option-approval-summary">
                        Approved path:{" "}
                        {approvedReallocationPlans[plan.productId].selectedOptionLabel ||
                          "Reallocation approved"}{" "}
                        | Supplier split:{" "}
                        {approvedReallocationPlans[plan.productId].approvedSupplierPath ||
                          approvedReallocationPlans[plan.productId].previewSupplierPath}
                      </div>
                    ) : null}
                    <div className="decision-panel-header">
                      <h4>{plan.sku}</h4>
                      <span className="tier-chip">
                        {approvedReallocationPlans[plan.productId]
                          ? approvedReallocationPlans[plan.productId].selectedOptionLabel
                          : plan.strategy}
                      </span>
                    </div>
                    <p className="queue-action-copy">{plan.summary}</p>
                    <div className="result-meta">
                      From: {plan.fromSupplier} | To: {plan.toSupplier} | Shifted units:{" "}
                      {plan.shiftedUnits}
                    </div>
                    <div className="result-meta">
                      Cash tradeoff: {plan.tradeoff}
                    </div>
                    <div className="result-meta">
                      ETA tradeoff: {plan.etaTradeoff}
                    </div>
                    <div className="result-meta">
                      Risk tradeoff: {plan.riskTradeoff}
                    </div>
                    <div className="result-meta">
                      Optimizer award: {plan.recommendedAward}
                    </div>
                    <div className="result-label inline-summary-label">
                      Execution impact preview
                    </div>
                    <div className="draft-review-grid">
                      <div className="result-meta">
                        Draft award: {plan.currentDraftAward} {" -> "} {plan.previewDraftAward}
                      </div>
                      <div className="result-meta">
                        Supplier split: {plan.currentSupplierPath} {" -> "} {plan.previewSupplierPath}
                      </div>
                      <div className="result-meta">
                        Landed margin: {plan.currentMargin}% {" -> "} {plan.previewMargin}%
                      </div>
                      <div className="result-meta">
                        Inbound plan: {plan.currentInboundPlan} {" -> "} {plan.previewInboundPlan}
                      </div>
                    </div>
                    <div className="result-label inline-summary-label">
                      Multi-plan compare
                    </div>
                    <div className="planning-board">
                      {plan.comparePlans.map((option) => (
                        <div
                          className={`planning-card compare-option-card${
                            approvedReallocationPlans[plan.productId]?.selectedOptionId === option.id
                              ? " compare-option-approved"
                              : ""
                          }`}
                          key={option.id}
                        >
                          <div className="decision-panel-header">
                            <h4>{option.label}</h4>
                            <span className="tier-chip">{option.award}</span>
                          </div>
                          <div className="result-meta">
                            Supplier split: {option.supplierPath}
                          </div>
                          <div className="result-meta">
                            Shifted units: {option.shiftedUnits}
                          </div>
                          <div className="result-meta">
                            Landed margin: {option.landedMargin}%
                          </div>
                          <div className="result-meta">
                            Inbound plan: {option.inboundPlan}
                          </div>
                          <div className="result-meta">
                            Cash tradeoff: {option.cashTradeoff}
                          </div>
                          <div className="result-meta">
                            Risk tradeoff: {option.riskTradeoff}
                          </div>
                          <div className="button-row template-copy-row">
                            <button
                              className={`button ${
                                approvedReallocationPlans[plan.productId]?.selectedOptionId === option.id
                                  ? "button-secondary"
                                  : "button-primary"
                              }`}
                              onClick={() => approveReallocationPlan(plan, option)}
                              type="button"
                            >
                              {approvedReallocationPlans[plan.productId]?.selectedOptionId === option.id
                                ? "Approved option"
                                : `Approve ${option.label.toLowerCase()}`}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Draft purchase orders</h3>
                <span className="tier-chip">{draftPurchaseOrders.length} drafts</span>
              </div>
              {draftPurchaseOrders.length > 0 ? (
                <>
                  <div className="tracker-table">
                    <div className="tracker-table-header draft-po-table-header">
                      <span>Draft PO</span>
                      <span>Product</span>
                      <span>Award</span>
                      <span>Supplier path</span>
                      <span>Units</span>
                      <span>Terms</span>
                      <span>Shipping</span>
                      <span>ETA</span>
                    </div>
                    {draftPurchaseOrders.map((draft) => (
                      <button
                        className={`tracker-table-row draft-po-table-row draft-po-table-button${
                          selectedDraftPurchaseOrder?.id === draft.id ? " selected-row" : ""
                        }`}
                        key={draft.id}
                        onClick={() => setSelectedDraftPoId(draft.id)}
                        type="button"
                      >
                        <span>{draft.id}</span>
                        <span>{draft.product}</span>
                        <span>{draft.awardDecision}</span>
                        <span>{draft.supplierPath}</span>
                        <span>{draft.units}</span>
                        <span>{draft.paymentTerms}</span>
                        <span>{draft.shippingMode}</span>
                        <span>{draft.expectedArrival}</span>
                      </button>
                    ))}
                  </div>

                  {selectedDraftPurchaseOrder ? (
                    <div className="award-decision-card draft-review-card">
                      <div className="decision-panel-header">
                        <div>
                          <div className="result-label">Draft review</div>
                          <div className="result-value">{selectedDraftPurchaseOrder.product}</div>
                        </div>
                        <span className="tier-chip">{selectedDraftPurchaseOrder.status}</span>
                      </div>
                      <div className="draft-review-grid">
                        <div>
                          <label htmlFor="draft-units">Units</label>
                          <input
                            id="draft-units"
                            min="0"
                            name="units"
                            onChange={updateDraftField}
                            type="number"
                            value={selectedDraftPurchaseOrder.units}
                          />
                        </div>
                        <div>
                          <label htmlFor="draft-shippingMode">Shipping mode</label>
                          <select
                            className="tracker-select"
                            id="draft-shippingMode"
                            name="shippingMode"
                            onChange={updateDraftField}
                            value={selectedDraftPurchaseOrder.shippingMode}
                          >
                            <option value="Air">Air</option>
                            <option value="Air + ocean split">Air + ocean split</option>
                            <option value="Ocean">Ocean</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="draft-paymentTerms">Payment terms</label>
                          <input
                            id="draft-paymentTerms"
                            name="paymentTerms"
                            onChange={updateDraftField}
                            type="text"
                            value={selectedDraftPurchaseOrder.paymentTerms}
                          />
                        </div>
                        <div>
                          <label htmlFor="draft-status">Draft status</label>
                          <input
                            id="draft-status"
                            name="status"
                            readOnly
                            type="text"
                            value={selectedDraftPurchaseOrder.status}
                          />
                        </div>
                      </div>
                      <label htmlFor="draft-reviewNotes">Review notes</label>
                      <textarea
                        className="inventory-import-textarea draft-review-notes"
                        id="draft-reviewNotes"
                        name="reviewNotes"
                        onChange={updateDraftField}
                        value={selectedDraftPurchaseOrder.reviewNotes}
                      />
                      <div className="result-meta">
                        Expected arrival: {selectedDraftPurchaseOrder.expectedArrival} | Landed
                        margin: {selectedDraftPurchaseOrder.expectedLandedMargin}% | Cash timing:{" "}
                        {selectedDraftPurchaseOrder.cashTiming}
                      </div>
                      <div className="button-row">
                        <button
                          className="button button-secondary"
                          onClick={() =>
                            moveDraftToStatus(
                              selectedDraftPurchaseOrder.id,
                              "Approved for release",
                            )
                          }
                          type="button"
                        >
                          Approve for release
                        </button>
                        <button
                          className="button button-primary"
                          onClick={() =>
                            moveDraftToStatus(
                              selectedDraftPurchaseOrder.id,
                              "Sent to supplier",
                            )
                          }
                          type="button"
                        >
                          Mark sent to supplier
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="planning-card draft-po-empty">
                  <div className="result-label">No draft POs yet</div>
                  <p className="queue-action-copy">
                    Approve a recommended supplier award in the procurement optimizer and Auretix
                    will prefill the PO path, units, terms, shipping mode, and expected arrival.
                  </p>
                </div>
              )}
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Open purchase orders</h3>
                <span className="tier-chip">{queue.workspace.purchaseOrders.length} live POs</span>
              </div>
              <div className="tracker-table">
                <div className="tracker-table-header po-table-header">
                  <span>PO</span>
                  <span>Supplier</span>
                  <span>Status</span>
                  <span>Units</span>
                  <span>Value</span>
                  <span>ETA</span>
                </div>
                {queue.workspace.purchaseOrders.map((po) => (
                  <button
                    className={`tracker-table-row po-table-row po-table-button${
                      selectedLivePurchaseOrder?.id === po.id ? " selected-row" : ""
                    }`}
                    key={po.id}
                    onClick={() => setSelectedLivePoId(po.id)}
                    type="button"
                  >
                    <span>{po.id}</span>
                    <span>{po.supplierName}</span>
                    <span>{po.status}</span>
                    <span>{po.units}</span>
                    <span>${po.value}</span>
                    <span>{po.nextEtaDays} days</span>
                  </button>
                ))}
              </div>
              {selectedLivePurchaseOrder ? (
                <div className="award-decision-card po-detail-card">
                  <div className="decision-panel-header">
                    <div>
                      <div className="result-label">Live PO detail</div>
                      <div className="result-value">{selectedLivePurchaseOrder.id}</div>
                    </div>
                    <span className="tier-chip">{selectedLivePurchaseOrder.status}</span>
                  </div>
                  <div className="draft-review-grid">
                    <div className="result-meta">
                      Supplier: {selectedLivePurchaseOrder.supplierName}
                    </div>
                    <div className="result-meta">
                      Next ETA: {selectedLivePurchaseOrder.nextEtaDays} days
                    </div>
                    <div className="result-meta">
                      Total units: {selectedLivePurchaseOrder.units}
                    </div>
                    <div className="result-meta">
                      PO value: ${selectedLivePurchaseOrder.value}
                    </div>
                  </div>
                  <div className="draft-review-grid">
                    <div>
                      <label htmlFor="live-po-communication">Supplier state</label>
                      <select
                        className="tracker-select"
                        id="live-po-communication"
                        onChange={updateLivePoCommunicationState}
                        value={selectedLivePurchaseOrder.communicationState}
                      >
                        <option value="waiting_on_supplier">Waiting on supplier</option>
                        <option value="awaiting_confirmation">Awaiting confirmation</option>
                        <option value="issue_raised">Issue raised</option>
                      </select>
                    </div>
                    <div className="live-po-flag-card">
                      <div className="result-label">Escalation flag</div>
                      <div className="result-value">
                        {selectedLivePurchaseOrder.escalationFlag ? "Raised" : "Clear"}
                      </div>
                      <button
                        className="button button-secondary"
                        onClick={toggleLivePoEscalation}
                        type="button"
                      >
                        {selectedLivePurchaseOrder.escalationFlag
                          ? "Clear escalation"
                          : "Raise escalation"}
                      </button>
                    </div>
                  </div>
                  <div className="tracker-table optimizer-compare-table">
                    <div className="tracker-table-header po-line-table-header">
                      <span>Product</span>
                      <span>SKU</span>
                      <span>Units</span>
                      <span>ETA</span>
                      <span>Unit cost</span>
                    </div>
                    {selectedLivePurchaseOrder.lineItems.map((line) => (
                      <div className="tracker-table-row po-line-table-row" key={`${selectedLivePurchaseOrder.id}-${line.productId}`}>
                        <span>{line.productName}</span>
                        <span>{line.sku}</span>
                        <span>{line.units}</span>
                        <span>{line.etaDays} days</span>
                        <span>${line.unitCost}</span>
                      </div>
                    ))}
                  </div>
                  <div className="button-row">
                    <button
                      className="button button-secondary"
                      onClick={() => moveLivePoToStatus(selectedLivePurchaseOrder.id, "confirmed")}
                      type="button"
                    >
                      Mark confirmed
                    </button>
                    <button
                      className="button button-secondary"
                      onClick={() => moveLivePoToStatus(selectedLivePurchaseOrder.id, "in_transit")}
                      type="button"
                    >
                      Mark in transit
                    </button>
                    <button
                      className="button button-secondary"
                      onClick={() => moveLivePoToStatus(selectedLivePurchaseOrder.id, "delayed")}
                      type="button"
                    >
                      Mark delayed
                    </button>
                    <button
                      className="button button-primary"
                      onClick={() => moveLivePoToStatus(selectedLivePurchaseOrder.id, "received")}
                      type="button"
                    >
                      Mark received
                    </button>
                    <button
                      className="button button-primary"
                      onClick={generateSupplierPacket}
                      type="button"
                    >
                      Generate supplier packet
                    </button>
                  </div>
                  <label htmlFor="live-po-follow-up">Follow-up note</label>
                  <textarea
                    className="inventory-import-textarea draft-review-notes"
                    id="live-po-follow-up"
                    onChange={(event) => setLivePoNoteText(event.target.value)}
                    value={livePoNoteText}
                  />
                  <div className="button-row">
                    <button
                      className="button button-secondary"
                      onClick={addLivePoFollowUpNote}
                      type="button"
                    >
                      Add follow-up note
                    </button>
                  </div>
                  <div className="timeline-stack po-history-stack">
                    {selectedLivePurchaseOrder.followUpNotes.map((entry, index) => (
                      <div
                        className="planning-card"
                        key={`${selectedLivePurchaseOrder.id}-followup-${index}`}
                      >
                        <div className="decision-panel-header">
                          <h4>{entry.communicationState.replaceAll("_", " ")}</h4>
                          <span className="tier-chip">{entry.timeLabel}</span>
                        </div>
                        <p className="queue-action-copy">{entry.note}</p>
                        <div className="result-meta">
                          Escalation: {entry.escalationFlag ? "Raised" : "Clear"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="timeline-stack po-history-stack">
                    {selectedLivePurchaseOrder.statusHistory.map((entry, index) => (
                      <div className="planning-card" key={`${selectedLivePurchaseOrder.id}-history-${index}`}>
                        <div className="decision-panel-header">
                          <h4>{entry.status}</h4>
                          <span className="tier-chip">{entry.timeLabel}</span>
                        </div>
                        <p className="queue-action-copy">{entry.detail}</p>
                      </div>
                    ))}
                  </div>
                  {supplierPackets.find((packet) => packet.poId === selectedLivePurchaseOrder.id) ? (
                    <div className="award-decision-card supplier-packet-card">
                      {(() => {
                        const packet = supplierPackets.find(
                          (entry) => entry.poId === selectedLivePurchaseOrder.id,
                        );

                        return (
                          <>
                            <div className="decision-panel-header">
                              <div>
                                <div className="result-label">Supplier-facing execution packet</div>
                                <div className="result-value">{packet.packetTitle}</div>
                              </div>
                              <span className="tier-chip">{packet.generatedAt}</span>
                            </div>
                            <p className="queue-action-copy">{packet.summary}</p>
                            <div className="result-meta">Supplier: {packet.supplierName}</div>
                            <div className="result-meta">Lines: {packet.lineSummary}</div>
                            <div className="result-label inline-summary-label">Issue flags</div>
                            <ul className="action-list">
                              {packet.issueFlags.map((flag) => (
                                <li key={flag}>{flag}</li>
                              ))}
                            </ul>
                            <div className="result-label inline-summary-label">Supplier notes</div>
                            {packet.followUpNotes.length > 0 ? (
                              <div className="timeline-stack po-history-stack">
                                {packet.followUpNotes.map((note, index) => (
                                  <div
                                    className="planning-card"
                                    key={`${packet.id}-note-${index}`}
                                  >
                                    <div className="decision-panel-header">
                                      <h4>{note.state.replaceAll("_", " ")}</h4>
                                      <span className="tier-chip">{note.timeLabel}</span>
                                    </div>
                                    <p className="queue-action-copy">{note.note}</p>
                                    <div className="result-meta">
                                      Escalation: {note.escalationFlag ? "Raised" : "Clear"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="result-meta">
                                No supplier notes are attached to this packet yet.
                              </div>
                            )}
                            <div className="result-label inline-summary-label">Send-ready communication mode</div>
                            <div className="button-row template-mode-row">
                              <button
                                className={`button ${
                                  templateDeliveryMode === "email"
                                    ? "button-primary"
                                    : "button-secondary"
                                }`}
                                onClick={() => setTemplateDeliveryMode("email")}
                                type="button"
                              >
                                Email-ready
                              </button>
                              <button
                                className={`button ${
                                  templateDeliveryMode === "chat"
                                    ? "button-primary"
                                    : "button-secondary"
                                }`}
                                onClick={() => setTemplateDeliveryMode("chat")}
                                type="button"
                              >
                                Chat-ready
                              </button>
                            </div>
                            <div className="timeline-stack po-history-stack">
                              {packet.templates.map((template) => (
                                <div className="planning-card supplier-template-card" key={template.id}>
                                  <div className="decision-panel-header">
                                    <h4>{template.mode}</h4>
                                    <span className="tier-chip">{template.channel}</span>
                                  </div>
                                  <div className="result-meta">Subject: {template.subject}</div>
                                  <div className="button-row template-copy-row">
                                    <button
                                      className="button button-secondary"
                                      onClick={() => copySupplierTemplate(template)}
                                      type="button"
                                    >
                                      {copiedTemplateId === template.id
                                        ? "Copied"
                                        : `Copy ${templateDeliveryMode}`}
                                    </button>
                                  </div>
                                  <pre className="supplier-template-body">
                                    {formatSupplierTemplate(template, templateDeliveryMode)}
                                  </pre>
                                </div>
                              ))}
                            </div>
                            <div className="result-label inline-summary-label">
                              Packet export history
                            </div>
                            {packet.exportHistory && packet.exportHistory.length > 0 ? (
                              <div className="timeline-stack po-history-stack">
                                {packet.exportHistory.map((entry) => (
                                  <div
                                    className="planning-card supplier-template-card"
                                    key={entry.id}
                                  >
                                    <div className="decision-panel-header">
                                      <h4>{entry.templateMode}</h4>
                                      <span className="tier-chip">
                                        {entry.outboundStatus || "prepared"}
                                      </span>
                                    </div>
                                    <div className="result-meta">Copied: {entry.copiedAt}</div>
                                    <div className="result-meta">
                                      Delivery mode: {entry.deliveryMode}
                                    </div>
                                    <div className="result-meta">Channel: {entry.channel}</div>
                                    <div className="button-row template-copy-row">
                                      <button
                                        className="button button-secondary"
                                        onClick={() =>
                                          updatePacketExportStatus(packet.id, entry.id, "sent")
                                        }
                                        type="button"
                                      >
                                        Sent
                                      </button>
                                      <button
                                        className="button button-secondary"
                                        onClick={() =>
                                          updatePacketExportStatus(packet.id, entry.id, "replied")
                                        }
                                        type="button"
                                      >
                                        Replied
                                      </button>
                                      <button
                                        className="button button-secondary"
                                        onClick={() =>
                                          updatePacketExportStatus(
                                            packet.id,
                                            entry.id,
                                            "no_response",
                                          )
                                        }
                                        type="button"
                                      >
                                        No response
                                      </button>
                                      <button
                                        className="button button-primary"
                                        onClick={() =>
                                          updatePacketExportStatus(
                                            packet.id,
                                            entry.id,
                                            "resolved",
                                          )
                                        }
                                        type="button"
                                      >
                                        Resolved
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="result-meta">
                                No supplier messages have been copied from this packet yet.
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Data intake</h3>
                <span className="tier-chip">Next layer</span>
              </div>
              <ul className="action-list">
                {queue.workspace.alerts.map((alert) => (
                  <li key={alert}>{alert}</li>
                ))}
                <li>
                  Next connection targets: CSV inventory upload, purchase-order import, and supplier score sync.
                </li>
              </ul>
            </div>

            {selectedItem ? (
              <div className="lab-card sku-detail-card">
                <div className="results-header">
                  <h3>{selectedItem.name} detail</h3>
                  <span className="tier-chip">{selectedItem.priority}</span>
                </div>

                <div className="dashboard-overview-grid sku-detail-metrics">
                  <div className="result-block">
                    <div className="result-label">Playbook lane</div>
                    <div className="result-value">{selectedItem.playbookLabel}</div>
                  </div>
                  <div className="result-block">
                    <div className="result-label">Role</div>
                    <div className="result-value">{selectedItem.roleLabel}</div>
                  </div>
                  <div className="result-block">
                    <div className="result-label">Supplier</div>
                    <div className="result-value">{selectedItem.supplierName}</div>
                  </div>
                  <div className="result-block">
                    <div className="result-label">Risk score</div>
                    <div className="result-value">{selectedItem.riskScore}/100</div>
                  </div>
                  <div className="result-block">
                    <div className="result-label">Gross margin</div>
                    <div className="result-value">{selectedItem.grossMarginPct}%</div>
                  </div>
                  <div className="result-block">
                    <div className="result-label">Monthly profit</div>
                    <div className="result-value">${selectedItem.monthlyProfit}</div>
                  </div>
                  <div className="result-block">
                    <div className="result-label">Capital efficiency</div>
                    <div className="result-value">{selectedItem.capitalEfficiency}</div>
                  </div>
                  <div className="result-block">
                    <div className="result-label">Open PO lines</div>
                    <div className="result-value">{selectedItem.poCount}</div>
                  </div>
                </div>

                <div className="decision-panel-grid">
                  <div className="decision-panel active-panel">
                    <div className="decision-panel-header">
                      <h4>Why it is risky</h4>
                      <span className="tier-chip">Reasons</span>
                    </div>
                    <ul className="action-list">
                      {selectedItem.riskReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="decision-panel active-panel">
                    <div className="decision-panel-header">
                      <h4>Why this lane</h4>
                      <span className="tier-chip">{selectedItem.playbookLabel}</span>
                    </div>
                    <ul className="action-list">
                      {selectedItem.playbookReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="tracker-table">
                  <div className="tracker-table-header action-path-header">
                    <span>Path</span>
                    <span>Outcome</span>
                    <span>Cash impact</span>
                  </div>
                  {selectedItem.actionPaths.map((path) => (
                    <div className="tracker-table-row action-path-row" key={path.key}>
                      <span>{path.label}</span>
                      <span>{path.outcome}</span>
                      <span>{path.cashImpact}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="lab-card">
              <div className="results-header">
                <h3>Action tracker</h3>
                <span className="tier-chip">{queue.overview.atRiskCount} active risks</span>
              </div>
              <div className="tracker-table">
                <div className="tracker-table-header">
                  <span>SKU</span>
                  <span>Lane</span>
                  <span>Priority</span>
                  <span>Action</span>
                  <span>Status</span>
                </div>
                {queue.items.slice(0, 6).map((item) => (
                  <div className="tracker-table-row" key={`tracker-${item.sku}`}>
                    <span>{item.name}</span>
                    <span>{item.playbookLabel}</span>
                    <span>{item.priority}</span>
                    <span>{item.action}</span>
                    <span>
                      <select
                        className="tracker-select"
                        onChange={(event) =>
                          updateActionState(item.id, event.target.value)
                        }
                        value={actionState[item.id] || "Open"}
                      >
                        {approvalStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lab-card">
              <div className="results-header">
                <h3>Task workflow</h3>
                <span className="tier-chip">{queue.workspace.taskWorkflow.length} owned tasks</span>
              </div>
              <div className="tracker-table">
                <div className="tracker-table-header workflow-table-header">
                  <span>SKU</span>
                  <span>Lane</span>
                  <span>Owner</span>
                  <span>Due</span>
                  <span>Escalation</span>
                  <span>Action</span>
                </div>
                {queue.workspace.taskWorkflow.map((task) => (
                  <div className="tracker-table-row workflow-table-row" key={`task-${task.id}`}>
                    <span>{task.sku}</span>
                    <span>{task.lane}</span>
                    <span>{task.owner}</span>
                    <span>{task.dueWindow}</span>
                    <span>{task.escalation}</span>
                    <span>{task.action}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="lab-card controls-card">
          <h3>Business inputs</h3>

          <label htmlFor="businessType">Business type</label>
          <select
            id="businessType"
            name="businessType"
            onChange={updateField}
            value={scenario.businessType}
          >
            <option value="ecommerce">Ecommerce</option>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="distribution">Distribution</option>
            <option value="consumerBrand">Consumer brand</option>
          </select>

          <label htmlFor="businessScale">Business scale</label>
          <select
            id="businessScale"
            name="businessScale"
            onChange={updateField}
            value={scenario.businessScale}
          >
            <option value="small">Small business</option>
            <option value="growth">Growth stage</option>
            <option value="midmarket">Mid-market</option>
            <option value="enterprise">Enterprise</option>
          </select>

          <label htmlFor="objectiveMode">Business objective</label>
          <select
            id="objectiveMode"
            name="objectiveMode"
            onChange={updateField}
            value={scenario.objectiveMode}
          >
            <option value="service">Protect service levels</option>
            <option value="cash">Protect cash</option>
            <option value="growth">Protect growth</option>
          </select>

          <label htmlFor="scenarioMode">Scenario mode</label>
          <select
            id="scenarioMode"
            name="scenarioMode"
            onChange={updateField}
            value={scenario.scenarioMode}
          >
            <option value="normal">Normal</option>
            <option value="supplierDelay">Supplier delay</option>
            <option value="demandSpike">Demand spike</option>
          </select>

          <label htmlFor="monthlyUnits">Monthly units sold</label>
          <input
            id="monthlyUnits"
            min="1"
            name="monthlyUnits"
            onChange={updateField}
            type="number"
            value={scenario.monthlyUnits}
          />

          <label htmlFor="inventory">Current inventory on hand</label>
          <input
            id="inventory"
            min="0"
            name="inventory"
            onChange={updateField}
            type="number"
            value={scenario.inventory}
          />

          <label htmlFor="leadTime">Supplier lead time (days)</label>
          <input
            id="leadTime"
            min="1"
            name="leadTime"
            onChange={updateField}
            type="number"
            value={scenario.leadTime}
          />

          <label htmlFor="supplierReliability">Supplier reliability (%)</label>
          <input
            id="supplierReliability"
            max="100"
            min="0"
            name="supplierReliability"
            onChange={updateField}
            type="number"
            value={scenario.supplierReliability}
          />

          <label htmlFor="growthRate">Expected sales growth next month (%)</label>
          <input
            id="growthRate"
            max="300"
            min="-100"
            name="growthRate"
            onChange={updateField}
            type="number"
            value={scenario.growthRate}
          />

          <label htmlFor="margin">Gross margin (%)</label>
          <input
            id="margin"
            max="100"
            min="0"
            name="margin"
            onChange={updateField}
            type="number"
            value={scenario.margin}
          />

          <label htmlFor="cashRunway">Cash runway for inventory buys (days)</label>
          <input
            id="cashRunway"
            min="1"
            name="cashRunway"
            onChange={updateField}
            type="number"
            value={scenario.cashRunway}
          />

          {renderConditionalInputs()}

          <div className="button-row">
            <button className="button button-primary" onClick={runDecisionEngine} type="button">
              Run Auretix
            </button>
            <button className="button button-secondary" onClick={resetScenario} type="button">
              Reset
            </button>
          </div>

          <div className="engine-pillars-card">
            <div className="result-label">5 core engine pillars</div>
            <ul className="action-list">
              <li>Prevent stockouts before they cost revenue.</li>
              <li>Control overbuying so cash is not trapped.</li>
              <li>Improve reorder timing and PO sizing.</li>
              <li>Reduce supplier and inbound uncertainty.</li>
              <li>Protect cash flow while the business grows.</li>
            </ul>
          </div>

          <div className="engine-pillars-card">
            <div className="result-label">Inventory import</div>
            <div className="result-meta">
              Paste inventory CSV data here to replace the seeded on-hand and reserved values with seller-specific numbers.
            </div>
            <input onChange={handleInventoryFileUpload} type="file" accept=".csv,text/csv" />
            <textarea
              className="inventory-import-textarea"
              onChange={(event) => setInventoryImportText(event.target.value)}
              value={inventoryImportText}
            />
            <div className="button-row">
              <button className="button button-secondary" onClick={importInventoryLedger} type="button">
                Import CSV into ledger
              </button>
            </div>
            {inventoryImportStatus ? (
              <div className="result-meta import-status-copy">{inventoryImportStatus}</div>
            ) : null}
          </div>

          <div className="engine-pillars-card">
            <div className="result-label">Saved workspaces</div>
            <div className="button-row">
              <button className="button button-secondary" onClick={saveCurrentWorkspace} type="button">
                Save current workspace
              </button>
            </div>
            {savedWorkspaces.length > 0 ? (
              <div className="timeline-stack">
                {savedWorkspaces.map((workspace) => (
                  <div className="planning-card" key={workspace.id}>
                    <div className="decision-panel-header">
                      <h4>{workspace.name}</h4>
                      <span className="tier-chip">{workspace.savedAt}</span>
                    </div>
                    <p className="queue-action-copy">
                      {workspace.scenario.businessType} | {workspace.scenario.objectiveMode} | {workspace.scenario.scenarioMode}
                    </p>
                    <div className="button-row">
                      <button
                        className="button button-secondary"
                        onClick={() => loadSavedWorkspace(workspace)}
                        type="button"
                      >
                        Load workspace
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="result-meta import-status-copy">
                No saved workspaces yet. Save the current seller state to keep working across sessions.
              </div>
            )}
          </div>
        </section>

        <section className="lab-card results-card">
          <div className="results-header">
            <h3>Engine output</h3>
            <span className={`decision-badge ${decision.badgeLevel}`}>{decision.badgeText}</span>
          </div>

          <div className="result-label summary-label">{focusedSummaryLabel}</div>
          <div className="result-summary">{decision.summary}</div>

          <div className="result">
            {visibleMetrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>

          <div className="decision-panel-grid">
            {visiblePanels.length > 0 ? (
              visiblePanels.map((panel) => (
                  <DecisionPanel
                    isActive={focus !== "overview" && panel.key === focus}
                    key={panel.title}
                    panel={panel}
                  />
                ))
            ) : (
              <div className="decision-panel decision-panel-empty">
                <div className="decision-panel-header">
                  <h4>Combined decision output</h4>
                  <span className="tier-chip">Run engine</span>
                </div>
                <p>
                  Auretix will split the result into procurement, supply chain, and a
                  unified next move once you run a seller scenario.
                </p>
              </div>
            )}
          </div>

          <div className="action-stack">
            <div className="result-block">
              <div className="result-label">{focusedActionLabel}</div>
              <ul className="action-list">
                {decision.actions.length > 0 ? (
                  decision.actions.map((action) => <li key={action}>{action}</li>)
                ) : (
                  <li>{focusedEmptyCopy}</li>
                )}
              </ul>
            </div>

            {decision.supportTier ? (
              <div className="result-block support-block">
                <div className="result-label">Suggested support tier</div>
                <div className="support-tier-row">
                  <div className="result-value">{decision.supportTier.name}</div>
                  <span className="tier-chip">{decision.supportTier.price}</span>
                </div>
                <div className="result-copy">{decision.supportTier.reason}</div>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </div>
  );
}
