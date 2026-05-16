"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  auretixFeatureCatalog,
  customerNeeds,
  featureCategories,
  featureStatusLabels,
  pricingPlans,
} from "../lib/product-catalog";

const readinessStorageKey = "auretix-readiness-board-v1";

const readinessStatuses = [
  {
    id: "not-tested",
    label: "Not tested",
    description: "Feature exists in the catalog, but we have not validated the flow yet.",
  },
  {
    id: "works",
    label: "Works",
    description: "The feature works in manual testing but is not ready to promise in a sales offer yet.",
  },
  {
    id: "needs-fix",
    label: "Needs fix",
    description: "The feature is visible or planned, but a customer would hit a broken or confusing path.",
  },
  {
    id: "sellable",
    label: "Sellable",
    description: "This can be confidently included in the matching package today.",
  },
  {
    id: "future",
    label: "Future",
    description: "Keep this out of live sales claims until the later build track is complete.",
  },
];

function defaultReadinessFor(feature) {
  if (feature.status === "future") {
    return "future";
  }

  return "not-tested";
}

function createDefaultBoardState() {
  return Object.fromEntries(
    auretixFeatureCatalog.map((feature) => [
      feature.id,
      {
        readiness: defaultReadinessFor(feature),
        note: "",
        lastTested: "",
      },
    ]),
  );
}

function getStatus(statusId) {
  return readinessStatuses.find((status) => status.id === statusId) || readinessStatuses[0];
}

function getCategoryLabel(categoryId) {
  return featureCategories.find((category) => category.id === categoryId)?.name || categoryId;
}

function getNeedLabels(needIds) {
  return needIds
    .map((needId) => customerNeeds.find((need) => need.id === needId)?.name || needId)
    .join(", ");
}

function getPlanFit(feature) {
  return pricingPlans
    .filter((plan) => {
      if (feature.status === "future" && plan.id !== "operator") {
        return false;
      }

      if (plan.id === "starter") {
        return (
          feature.status === "live" &&
          ["core-engine", "data-access", "customer-growth"].includes(feature.category) &&
          feature.customerNeeds.some((need) => plan.primaryNeeds.includes(need))
        );
      }

      if (plan.id === "growth") {
        return (
          feature.status !== "future" &&
          feature.customerNeeds.some((need) => plan.primaryNeeds.includes(need))
        );
      }

      return feature.customerNeeds.some((need) => plan.primaryNeeds.includes(need));
    })
    .map((plan) => plan.name);
}

function summarizeByStatus(boardState) {
  return readinessStatuses.map((status) => {
    const count = auretixFeatureCatalog.filter(
      (feature) => (boardState[feature.id]?.readiness || defaultReadinessFor(feature)) === status.id,
    ).length;

    return {
      ...status,
      count,
    };
  });
}

export default function ReadinessBoard() {
  const [boardState, setBoardState] = useState(createDefaultBoardState);
  const [filters, setFilters] = useState({
    category: "all",
    plan: "all",
    readiness: "all",
    query: "",
  });
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(readinessStorageKey);

      if (saved) {
        setBoardState({
          ...createDefaultBoardState(),
          ...JSON.parse(saved),
        });
      }
    } catch {
      setBoardState(createDefaultBoardState());
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(readinessStorageKey, JSON.stringify(boardState));
  }, [boardState, isHydrated]);

  const boardRows = useMemo(
    () =>
      auretixFeatureCatalog.map((feature) => {
        const state = boardState[feature.id] || {
          readiness: defaultReadinessFor(feature),
          note: "",
          lastTested: "",
        };
        const planFit = getPlanFit(feature);

        return {
          ...feature,
          readiness: state.readiness,
          note: state.note,
          lastTested: state.lastTested,
          planFit,
          categoryLabel: getCategoryLabel(feature.category),
          needLabels: getNeedLabels(feature.customerNeeds),
        };
      }),
    [boardState],
  );

  const filteredRows = boardRows.filter((feature) => {
    const query = filters.query.trim().toLowerCase();
    const matchesQuery =
      !query ||
      feature.name.toLowerCase().includes(query) ||
      feature.testCase.toLowerCase().includes(query) ||
      feature.needLabels.toLowerCase().includes(query);
    const matchesCategory = filters.category === "all" || feature.category === filters.category;
    const matchesPlan =
      filters.plan === "all" || feature.planFit.some((plan) => plan.includes(filters.plan));
    const matchesReadiness =
      filters.readiness === "all" || feature.readiness === filters.readiness;

    return matchesQuery && matchesCategory && matchesPlan && matchesReadiness;
  });

  const statusSummary = summarizeByStatus(boardState);
  const sellableCount = statusSummary.find((status) => status.id === "sellable")?.count || 0;
  const needsFixCount = statusSummary.find((status) => status.id === "needs-fix")?.count || 0;
  const notTestedCount = statusSummary.find((status) => status.id === "not-tested")?.count || 0;

  function updateFilter(event) {
    const { name, value } = event.target;
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updateFeature(featureId, patch) {
    setBoardState((current) => ({
      ...current,
      [featureId]: {
        ...current[featureId],
        ...patch,
      },
    }));
  }

  function markTested(featureId, readiness) {
    updateFeature(featureId, {
      readiness,
      lastTested: new Date().toLocaleDateString(),
    });
  }

  function resetBoard() {
    const nextState = createDefaultBoardState();
    setBoardState(nextState);
    window.localStorage.setItem(readinessStorageKey, JSON.stringify(nextState));
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">Feature QA</div>
          <h1>Readiness board</h1>
          <p className="hero-text">
            Test every Auretix capability, mark what is sellable, and keep future
            integration work out of live customer promises until it is proven.
          </p>
        </div>
        <nav className="app-nav">
          <Link href="/app">Rescue board</Link>
          <Link href="/app/procurement">Procurement</Link>
          <Link href="/app/supply-chain">Supply chain</Link>
          <Link href="/app/readiness">Readiness</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <section className="dashboard-stack readiness-stack">
        <div className="dashboard-overview-grid">
          <div className="result-block">
            <div className="result-label">Sellable now</div>
            <div className="result-value">{sellableCount}</div>
            <div className="result-meta">Features cleared for a package promise.</div>
          </div>
          <div className="result-block">
            <div className="result-label">Needs fix</div>
            <div className="result-value">{needsFixCount}</div>
            <div className="result-meta">Visible flows that need repair before selling.</div>
          </div>
          <div className="result-block">
            <div className="result-label">Untested</div>
            <div className="result-value">{notTestedCount}</div>
            <div className="result-meta">Feature tests still waiting for a pass.</div>
          </div>
        </div>

        <div className="lab-card readiness-controls">
          <div className="results-header">
            <h3>Filter the board</h3>
            <button className="button button-secondary" onClick={resetBoard} type="button">
              Reset QA state
            </button>
          </div>

          <div className="readiness-filter-grid">
            <label htmlFor="readiness-query">
              Search
              <input
                id="readiness-query"
                name="query"
                onChange={updateFilter}
                placeholder="Feature, need, or test case"
                type="search"
                value={filters.query}
              />
            </label>

            <label htmlFor="readiness-category">
              Category
              <select
                id="readiness-category"
                name="category"
                onChange={updateFilter}
                value={filters.category}
              >
                <option value="all">All categories</option>
                {featureCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label htmlFor="readiness-plan">
              Plan fit
              <select id="readiness-plan" name="plan" onChange={updateFilter} value={filters.plan}>
                <option value="all">All plans</option>
                <option value="Starter">Starter</option>
                <option value="Growth">Growth</option>
                <option value="Operator+">Operator+</option>
              </select>
            </label>

            <label htmlFor="readiness-status">
              Readiness
              <select
                id="readiness-status"
                name="readiness"
                onChange={updateFilter}
                value={filters.readiness}
              >
                <option value="all">All readiness</option>
                {readinessStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="readiness-status-grid">
          {statusSummary.map((status) => (
            <div className={`readiness-status-card readiness-${status.id}`} key={status.id}>
              <div className="result-label">{status.label}</div>
              <div className="result-value">{status.count}</div>
              <p>{status.description}</p>
            </div>
          ))}
        </div>

        <div className="readiness-board-grid">
          {filteredRows.map((feature) => {
            const status = getStatus(feature.readiness);

            return (
              <article className="lab-card readiness-feature-card" key={feature.id}>
                <div className="decision-panel-header">
                  <div>
                    <div className="result-label">{feature.categoryLabel}</div>
                    <h3>{feature.name}</h3>
                  </div>
                  <span className={`tier-chip readiness-chip readiness-${status.id}`}>
                    {status.label}
                  </span>
                </div>

                <div className="readiness-card-meta">
                  <span>{featureStatusLabels[feature.status] || feature.status}</span>
                  <span>{feature.planFit.length ? feature.planFit.join(", ") : "No package yet"}</span>
                </div>

                <div className="result-meta">Solves: {feature.needLabels}</div>

                <div className="engine-pillars-card">
                  <div className="result-label">Manual test</div>
                  <p className="queue-action-copy">{feature.testCase}</p>
                </div>

                <div className="readiness-action-grid">
                  <button
                    className="button button-secondary"
                    onClick={() => markTested(feature.id, "works")}
                    type="button"
                  >
                    Mark works
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => markTested(feature.id, "needs-fix")}
                    type="button"
                  >
                    Needs fix
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => markTested(feature.id, "sellable")}
                    type="button"
                  >
                    Sellable
                  </button>
                </div>

                <label className="readiness-field" htmlFor={`${feature.id}-readiness`}>
                  Readiness status
                  <select
                    id={`${feature.id}-readiness`}
                    onChange={(event) =>
                      updateFeature(feature.id, {
                        readiness: event.target.value,
                        lastTested:
                          event.target.value === "not-tested"
                            ? feature.lastTested
                            : new Date().toLocaleDateString(),
                      })
                    }
                    value={feature.readiness}
                  >
                    {readinessStatuses.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="readiness-field" htmlFor={`${feature.id}-notes`}>
                  QA notes
                  <textarea
                    id={`${feature.id}-notes`}
                    onChange={(event) =>
                      updateFeature(feature.id, {
                        note: event.target.value,
                      })
                    }
                    placeholder="What passed, what failed, or what should be fixed before selling?"
                    rows="4"
                    value={feature.note}
                  />
                </label>

                <div className="result-meta">
                  Last tested: {feature.lastTested || "Not recorded yet"}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
