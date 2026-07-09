"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AppNavigation from "./app-navigation";
import {
  briefingOpeningLines,
  confidenceLabel,
  endOfBriefingLine,
  evidenceStrengthLabel,
  formatImpact,
  getGreetingForDate,
} from "../lib/advisor-briefing-ui";

function severityLabel(value) {
  if (value === "high") {
    return "High exposure";
  }

  if (value === "medium") {
    return "Medium exposure";
  }

  return "Low exposure";
}

function evidenceHref(card) {
  const base = card?.drilldownTarget?.href || "/app/moat";

  return card?.evidenceIds?.length ? `${base}#evidence` : base;
}

function AdvisorFeedCard({ card, index }) {
  const evidenceLabel = evidenceStrengthLabel(card.evidenceStrength);
  const isLimited = card.evidenceStrength === "limited";

  return (
    <details className={`advisor-briefing-feed-card advisor-feed-${card.severity}`}>
      <summary>
        <div className="advisor-feed-card-rank">
          <span className="advisor-feed-rank-number">{index + 1}</span>
          <span className="advisor-feed-type">{card.type}</span>
        </div>
        <div className="advisor-feed-card-main">
          <div className="advisor-feed-card-topline">
            <span className={`advisor-feed-severity advisor-feed-severity-${card.severity}`}>
              {severityLabel(card.severity)}
            </span>
            <span className={`advisor-feed-evidence${isLimited ? " advisor-feed-evidence-limited" : ""}`}>
              {evidenceLabel}
            </span>
          </div>
          <h2>{card.title}</h2>
          <p>{card.summary}</p>
          <div className="advisor-feed-metrics" aria-label="Card metrics">
            <div>
              <span>Projected financial impact</span>
              <strong>{formatImpact(card.projectedFinancialImpact)}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>{confidenceLabel(card.confidence)}</strong>
            </div>
            <div>
              <span>{card.primaryMetric.label}</span>
              <strong>{card.primaryMetric.value}</strong>
            </div>
          </div>
        </div>
      </summary>

      <div className="advisor-feed-expanded">
        <section>
          <span>Why it matters</span>
          <p>{card.whyItMatters}</p>
        </section>

        <section>
          <span>Evidence summary</span>
          {card.evidenceIds.length ? (
            <p>{card.evidenceIds.length} evidence reference{card.evidenceIds.length === 1 ? "" : "s"} connected.</p>
          ) : (
            <p>Evidence is available through the source records behind this briefing card.</p>
          )}
          <div className="advisor-feed-source-refs">
            {card.sourceRefs.map((source) => (
              <small key={`${source.table}-${source.id}`}>
                {source.table}: {source.id}
              </small>
            ))}
          </div>
        </section>

        <section>
          <span>Possible response paths</span>
          <ul>
            {card.responsePaths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </section>

        <div className="advisor-feed-actions">
          <Link className="button button-secondary" href={evidenceHref(card)}>
            Open evidence
          </Link>
          <Link className="button button-primary" href={card.drilldownTarget.href}>
            Open details
          </Link>
        </div>
      </div>
    </details>
  );
}

export default function AdvisorBriefingSurface({ feed, userName = "Michel" }) {
  const [localNow] = useState(() => new Date());
  const greeting = useMemo(() => getGreetingForDate(localNow, userName), [localNow, userName]);
  const openingLines = briefingOpeningLines(feed);
  const cards = feed?.cards || [];
  const isQuiet = Boolean(feed?.quietState);

  return (
    <div className="app-shell advisor-briefing-shell">
      <header className="app-header advisor-briefing-topbar">
        <div>
          <div className="eyebrow">Auretix Advisor</div>
          <h1>Business briefing</h1>
          <p className="hero-text">Auretix informs. You decide.</p>
        </div>
        <AppNavigation />
      </header>

      <main className="advisor-briefing-surface" aria-label="Auretix advisor briefing">
        <section className="advisor-briefing-intro">
          <span className="result-label">Today</span>
          <h2>{greeting}</h2>
          <div className="advisor-briefing-opening">
            {openingLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>

        {isQuiet ? (
          <section className="advisor-briefing-quiet" aria-label="Quiet day briefing">
            <div>
              <span>Watching</span>
              <ul>
                {(feed.quietState?.watchedAreas || []).map((area) => (
                  <li key={area}>{area}</li>
                ))}
              </ul>
            </div>
            <p>{feed.quietState?.message}</p>
          </section>
        ) : (
          <section className="advisor-briefing-feed" aria-label="Advisor feed">
            {cards.map((card, index) => (
              <AdvisorFeedCard card={card} index={index} key={card.id} />
            ))}
          </section>
        )}

        <footer className="advisor-briefing-footer">
          <p>{endOfBriefingLine(false)}</p>
        </footer>
      </main>
    </div>
  );
}
