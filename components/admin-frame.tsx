"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BrandLogo } from "./brand-logo";
import "./admin.css";

export const adminSections = [
  ["overview", "Overview"], ["orders", "Orders"], ["products", "Products"],
  ["sellers", "Sellers"], ["import", "Import"], ["hunts", "Model Hunts"],
  ["community", "Subscribers"], ["tax", "Tax & compliance"],
  ["resolution", "Resolution"], ["production", "Production readiness"],
] as const;

export function AdminFrame({ adminEmail, environment, children }: {
  adminEmail: string; environment: string; children: ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const section = params.get("section") || "overview";
  const destinations = [
    ...adminSections.map(([id, label]) => ({ label, href: `/admin?section=${id}`, active: pathname === "/admin" && section === id })),
    ...[["preorders", "Preorder operations"], ["promotions", "Promoted listings"], ["community", "Community moderation"]].map(([id, label]) => ({ label, href: `/admin/${id}`, active: pathname === `/admin/${id}` })),
  ];
  return <div className="admin-shell">
    <header className="admin-header">
      <div><Link className="brand" href="/admin" aria-label="Admin overview"><BrandLogo priority /></Link><strong>Founder admin</strong></div>
      <div><span className="admin-environment">{environment}</span><span>{adminEmail}</span><a href="/signout-with-chatgpt?return_to=/">Sign out</a></div>
    </header>
    <div className="admin-navigation">
      <button className="admin-menu-toggle" aria-expanded={menuOpen} aria-controls="admin-sections" onClick={() => setMenuOpen(!menuOpen)}>Menu · {destinations.find(item => item.active)?.label || "Admin"}</button>
      <nav id="admin-sections" className={`admin-tabs ${menuOpen ? "is-open" : ""}`} aria-label="Admin sections">
        {destinations.map(item => <Link key={item.href} href={item.href} className={item.active ? "active" : ""} aria-current={item.active ? "page" : undefined} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}
      </nav>
    </div>
    <main id="main-content" tabIndex={-1} className="admin-main">{children}</main>
  </div>;
}
