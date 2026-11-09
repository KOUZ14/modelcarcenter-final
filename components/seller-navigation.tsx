"use client";

import Link from "next/link";
import { useState } from "react";
import { useDialogFocus } from "./use-dialog-focus";

const sections = [["overview", "Overview"], ["orders", "Orders"], ["inventory", "Inventory"], ["payments", "Payments"], ["messages", "Buyer messages"], ["growth", "Growth"], ["analytics", "Analytics"], ["settings", "Settings"], ["help", "Help"]] as const;
type Props = { storeName: string; slug: string; email: string; status: string; termsAccepted: boolean; view: string; orders: number };

function Navigation({ data, onNavigate }: { data: Props; onNavigate?: () => void }) {
  // Match the public storefront's active-store/current-terms checks.
  const storefrontLive = data.status === "active" && data.termsAccepted;
  const nextStep = data.status === "suspended"
    ? { href: "/contact#seller-setup-help", label: "Contact seller support" }
    : !data.termsAccepted
      ? { href: "/store?view=settings&filter=terms#seller-terms", label: "Review Seller Terms" }
      : data.status === "applicant"
        ? { href: "/contact#seller-setup-help", label: "Check store approval" }
        : { href: "/store?view=payments", label: "Complete payment setup" };
  return <><nav aria-label="Seller Hub sections">{sections.map(([key, label]) => <Link key={key} href={`/store?view=${key}`} onClick={onNavigate} aria-current={data.view === key ? "page" : undefined}>{label}{key === "orders" && data.orders > 0 && <span>{data.orders}</span>}</Link>)}</nav><div className="store-sidebar-links">
    {storefrontLive
      ? <Link href={`/sellers/${encodeURIComponent(data.slug)}`} onClick={onNavigate}>View storefront</Link>
      : <div className="seller-storefront-status"><span>Storefront not live</span><Link href={nextStep.href} onClick={onNavigate}>{nextStep.label} →</Link></div>}
    <Link href="/account" onClick={onNavigate}>My Garage</Link><Link href="/marketplace" onClick={onNavigate}>Marketplace</Link>
  </div></>;
}
function Drawer({ data, onClose }: { data: Props; onClose(): void }) {
  const dialog = useDialogFocus(onClose);
  return <div className="seller-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="seller-drawer" role="dialog" aria-modal="true" aria-labelledby="seller-menu-title" ref={dialog} tabIndex={-1}><header><h2 id="seller-menu-title">Seller menu</h2><button type="button" className="button outline small" onClick={onClose} aria-label="Close seller menu">Close</button></header><p>{data.storeName}</p><Navigation data={data} onNavigate={onClose}/></section></div>;
}
export function SellerNavigation(data: Props) {
  const [open, setOpen] = useState(false);
  return <><header className="seller-mobile-header"><Link href="/store"><span>Seller Hub</span><strong>{data.storeName}</strong></Link><button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Menu <span aria-hidden="true">☰</span></button></header><aside className="store-sidebar"><Link className="store-brand" href="/store">MODEL CAR CENTER <b>Seller Hub</b></Link><div className="store-identity"><h1>{data.storeName}</h1><span>{data.email}</span><span className={`status ${data.status}`}>{data.status === "active" ? "Approved store" : data.status === "applicant" ? "Approval pending" : data.status === "suspended" ? "Sales suspended" : "Complete payment setup"}</span></div><Navigation data={data}/></aside>{open && <Drawer data={data} onClose={() => setOpen(false)}/>}</>;
}
