"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMarketplace } from "./marketplace-provider";
import { Icon } from "./icons";
import { BrandLogo } from "./brand-logo";
import { MobileSheet } from "./mobile-sheet";

const primaryLinks = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/marketplace", label: "Shop", icon: "search" },
  { href: "/community", label: "Community", icon: "users" },
  { href: "/sell", label: "Sell", icon: "arrow" },
] as const;

export function SiteHeader({ overlay = false, showSearch = true, searchDisplay = "full" }: { overlay?: boolean; showSearch?: boolean; searchDisplay?: "full" | "compact" }) {
  const { cart, collector, authReady, signOut } = useMarketplace();
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const searchParams = useSearchParams();
  const returnTo = path + (searchParams.toString() ? `?${searchParams}` : "");
  const signInHref = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
  const count = cart.reduce((n, item) => n + item.quantity, 0);
  const isCurrent = (href: string) => path === href || path.startsWith(`${href}/`);
  const menuGroups = [
    { title: "Discover", links: [
      ["/", "Home"], ["/search", "Search all of MCC"], ["/marketplace", "Shop models"],
      ["/marketplace?availability=preorder", "Upcoming releases"], ["/community", "Collector community"],
      ["/wishlist", "Wishlist"], ["/account?view=hunts", "Model Hunts"],
    ] },
    { title: "Your collection & account", links: [
      ["/profile", "Your profile"], ["/collection", "My Collection"], ["/messages", "Inbox"],
      ["/notifications", "Notifications"], ["/account", "Account & orders"],
      ["/preorders", "Your preorders"], ["/cart", `Shopping cart${count ? ` (${count})` : ""}`],
    ] },
    { title: "Sell & get help", links: [
      ["/sell/model", "Sell a Model"], ["/sell", "Become a seller"],
      ...(collector?.store ? [["/store", "Seller Dashboard"]] : []),
      ["/resolution", "Customer Support"], ["/shipping", "Shipping & delivery"],
    ] },
  ];

  return <>
    <header className={`site-header collector-header ${overlay ? "overlay" : "inner"}${searchDisplay === "compact" ? " compact-search-header" : ""}`} onKeyDown={event => {
      if (event.key === "Escape") {
        const menu = event.currentTarget.querySelector<HTMLDetailsElement>("details[open]");
        if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); }
      }
    }}>
      <Link className="brand" href="/" aria-label="Model Car Center home"><BrandLogo priority dark={!overlay} /></Link>
      <nav className="collector-main-nav" aria-label="Main navigation">
        {primaryLinks.map(({ href, label, icon }) => <Link className={href === "/" ? "header-home" : href === "/sell" ? "header-sell" : undefined} key={href} href={href} aria-current={isCurrent(href) ? "page" : undefined}>
          <Icon name={icon} /><span>{label}</span>
        </Link>)}
        {collector?.store && <Link className="header-dashboard" href="/store" aria-current={isCurrent("/store") ? "page" : undefined}>Seller Dashboard</Link>}
        <button className="mobile-menu-button" type="button" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(true)}>
          <Icon name="menu" /><span>Menu</span>
        </button>
      </nav>
      {showSearch && searchDisplay === "full" && <form className="header-search" action="/marketplace" role="search"><label className="sr-only" htmlFor="header-model-search">Search model cars</label><input id="header-model-search" type="search" name="q" placeholder="Search model cars"/><button type="submit" aria-label="Search models"><Icon name="search"/></button></form>}
      <div className="header-actions">
        {showSearch && searchDisplay === "compact" && <Link className="icon-button header-search-link" href="/marketplace#marketplace-query" aria-label="Search model cars" title="Search model cars"><Icon name="search"/></Link>}
        <Link className="icon-button" href="/cart" aria-label={`Shopping cart, ${count} items`}><Icon name="bag" />{count > 0 && <span className="count">{count > 99 ? "99+" : count}</span>}</Link>
        {authReady && (collector ? <details className="account-menu"><summary aria-label="Account controls"><span className="account-avatar">{collector.displayName.slice(0, 1).toUpperCase()}</span></summary><div>
          <Link href="/profile">Profile</Link><Link href="/collection">My Collection</Link>
          <Link href="/messages">Inbox</Link><Link href="/notifications">Notifications</Link>
          {collector.store && <Link href="/store">Seller Dashboard</Link>}
          <Link href="/account">Account & orders</Link><Link href="/wishlist">Wishlist</Link><Link href="/preorders">Your preorders</Link>
          <Link href="/resolution">Customer Support</Link><Link href="/account?view=hunts">Model Hunts</Link><Link href="/sell/model">Sell a Model</Link>
          <button type="button" onClick={() => void signOut()}>Sign Out</button>
        </div></details> : <Link className="account-sign-in" href={signInHref}>Sign in</Link>)}
      </div>
    </header>
    <MobileSheet id="mobile-menu" title="Menu" open={menuOpen} onClose={() => setMenuOpen(false)}>
      {authReady && <div className="mobile-menu-account">
        {collector ? <><span className="account-avatar">{collector.displayName.slice(0, 1).toUpperCase()}</span><span>{collector.displayName}</span></> : <Link className="button dark" href={signInHref} onClick={() => setMenuOpen(false)}>Sign in or create an account</Link>}
      </div>}
      <nav className="mobile-menu-groups" aria-label="Menu">
        {menuGroups.map(group => <section key={group.title}>
          <h3>{group.title}</h3>
          {group.links.map(([href, label]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={path === href ? "page" : undefined}><span>{label}</span><Icon name="arrow" /></Link>)}
        </section>)}
      </nav>
      {collector && <button className="mobile-menu-sign-out" type="button" onClick={() => { setMenuOpen(false); void signOut(); }}>Sign Out</button>}
    </MobileSheet>
  </>;
}
