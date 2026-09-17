"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMarketplace } from "./marketplace-provider";
import { Icon } from "./icons";
import { BrandLogo } from "./brand-logo";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { cart, wishlist, collector, authReady, signOut } = useMarketplace();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  return <header onKeyDown={(event) => {
    if (event.key !== "Escape") return;
    if (open) { setOpen(false); menuButton.current?.focus(); }
    const accountMenu = event.currentTarget.querySelector<HTMLDetailsElement>("details[open]");
    if (accountMenu) { accountMenu.open = false; accountMenu.querySelector("summary")?.focus(); }
  }} className={`site-header ${overlay ? "overlay" : "inner"}`}>
    <Link className="brand" href="/" aria-label="Model Car Center home"><BrandLogo priority dark={!overlay}/></Link>
    <nav id="main-navigation" className={open ? "main-nav open" : "main-nav"} aria-label="Main navigation"><Link href="/marketplace" onClick={() => setOpen(false)}>Shop</Link><Link href="/marketplace#filters" onClick={() => setOpen(false)}>Browse by scale</Link><Link href="/#model-hunt" onClick={() => setOpen(false)}>Model Hunt</Link><Link href="/sell" onClick={() => setOpen(false)}>Sell with us</Link>{collector && <div className="mobile-account-links">{collector.store && <Link href="/store">Store Console</Link>}<Link href="/messages">Messages</Link><Link href="/account">My Garage</Link><Link href="/resolution">Customer Support</Link><Link href="/account?view=hunts">My Model Hunts</Link>{!collector.store && <Link href="/sell/model">Sell a Model</Link>}<button type="button" onClick={() => void signOut()}>Sign Out</button></div>}</nav>
    <div className="header-actions">{collector && <Link className="icon-button" href="/messages" aria-label="Messages"><Icon name="message"/></Link>}<Link className="icon-button" href="/wishlist" aria-label={`Saved items, ${wishlist.length}`}><Icon name="heart"/>{wishlist.length > 0 && <span className="count">{wishlist.length}</span>}</Link><Link className="icon-button" href="/cart" aria-label={`Shopping cart, ${cartCount} items`}><Icon name="bag"/>{cartCount > 0 && <span className="count">{cartCount}</span>}</Link>{authReady && (collector ? <details className="account-menu"><summary aria-label="Account"><span className="account-avatar">{collector.displayName.slice(0, 1).toUpperCase()}</span><span className="account-label">{collector.displayName}</span></summary><div>{collector.store && <Link href="/store">Store Console</Link>}<Link href="/messages">Messages</Link><Link href="/account">My Garage</Link><Link href="/resolution">Customer Support</Link><Link href="/wishlist">Wishlist</Link><Link href="/account?view=hunts">Model Hunts</Link>{!collector.store && <Link href="/sell/model">Sell a Model</Link>}<button type="button" onClick={() => void signOut()}>Sign Out</button></div></details> : <Link className="account-sign-in" href="/sign-in">Sign In</Link>)}<button className="icon-button menu-toggle" ref={menuButton} aria-controls="main-navigation" type="button" aria-expanded={open} aria-label="Toggle navigation" onClick={() => setOpen(!open)}><Icon name="menu"/></button></div>
  </header>;
}
