"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
  const [openMenu, setOpenMenu] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!navRef.current?.contains(event.target)) {
        setOpenMenu(null);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function toggleMenu(menu) {
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  const investigationsOpen = openMenu === "investigations";
  const settingsOpen = openMenu === "settings";

  return (
    <nav
      className="app-nav advisor-primary-nav"
      aria-label="Auretix app navigation"
      ref={navRef}
    >
      <Link href="/app" onClick={() => setOpenMenu(null)}>
        Advisor
      </Link>
      <div className={`app-nav-menu${investigationsOpen ? " is-open" : ""}`}>
        <button
          aria-expanded={investigationsOpen}
          aria-haspopup="menu"
          className="app-nav-trigger"
          onClick={() => toggleMenu("investigations")}
          type="button"
        >
          <span>Investigations</span>
          <span aria-hidden="true" className="app-nav-indicator">
            {investigationsOpen ? "-" : "+"}
          </span>
        </button>
        {investigationsOpen ? (
          <div className="app-nav-dropdown" role="menu">
            {investigationLinks.map((link) => (
              <Link
                href={link.href}
                key={`${link.label}-${link.href}`}
                onClick={() => setOpenMenu(null)}
                role="menuitem"
              >
                {link.label}
              </Link>
            ))}
            <span className="app-nav-section-label">Advanced</span>
            {advancedLinks.map((link) => (
              <Link
                href={link.href}
                key={`${link.label}-${link.href}`}
                onClick={() => setOpenMenu(null)}
                role="menuitem"
              >
                {link.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <div className={`app-nav-menu${settingsOpen ? " is-open" : ""}`}>
        <button
          aria-expanded={settingsOpen}
          aria-haspopup="menu"
          className="app-nav-trigger"
          onClick={() => toggleMenu("settings")}
          type="button"
        >
          <span>Settings</span>
          <span aria-hidden="true" className="app-nav-indicator">
            {settingsOpen ? "-" : "+"}
          </span>
        </button>
        {settingsOpen ? (
          <div className="app-nav-dropdown app-nav-dropdown-right" role="menu">
            {settingsLinks.map((link) => (
              <Link
                href={link.href}
                key={`${link.label}-${link.href}`}
                onClick={() => setOpenMenu(null)}
                role="menuitem"
              >
                {link.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
