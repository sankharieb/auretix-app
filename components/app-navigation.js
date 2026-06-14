"use client";

import Link from "next/link";

const investigationLinks = [
  { label: "Stockouts", href: "/app/supply-chain" },
  { label: "Cash", href: "/app/procurement" },
  { label: "Suppliers", href: "/app/network" },
  { label: "Procurement", href: "/app/procurement" },
  { label: "Learning", href: "/app/moat" },
  { label: "Partners", href: "/app/network" },
];

const advancedLinks = [
  { label: "SKU risk detail", href: "/app/sku-risk" },
  { label: "Feature readiness", href: "/app/readiness" },
];

const settingsLinks = [
  { label: "Sign in", href: "/login" },
  { label: "Sign out", href: "/logout" },
  { label: "Data + legal readiness", href: "/app/data-readiness" },
];

export default function AppNavigation() {
  return (
    <nav className="app-nav advisor-primary-nav" aria-label="Auretix app navigation">
      <Link href="/app">Advisor</Link>
      <details className="app-nav-menu">
        <summary>Investigations</summary>
        <div className="app-nav-dropdown">
          {investigationLinks.map((link) => (
            <Link href={link.href} key={`${link.label}-${link.href}`}>
              {link.label}
            </Link>
          ))}
          <span className="app-nav-section-label">Advanced</span>
          {advancedLinks.map((link) => (
            <Link href={link.href} key={`${link.label}-${link.href}`}>
              {link.label}
            </Link>
          ))}
        </div>
      </details>
      <details className="app-nav-menu">
        <summary>Settings</summary>
        <div className="app-nav-dropdown app-nav-dropdown-right">
          {settingsLinks.map((link) => (
            <Link href={link.href} key={`${link.label}-${link.href}`}>
              {link.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
