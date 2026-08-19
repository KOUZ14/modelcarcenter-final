"use client";

import Link from "next/link";
import { useState } from "react";
import { useMarketplace } from "./marketplace-provider";
import { Icon } from "./icons";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [open, setOpen] = useState(false);
  const { cart, wishlist } = useMarketplace();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  return <header className={`site-header ${overlay ? "overlay" : "inner"}`}>
    <Link className="brand" href="/" aria-label="Model Car Center home"><span className="brand-mark">MCC</span><span className="brand-name">MODEL CAR <b>CENTER</b></span></Link>
    <nav className={open ? "main-nav open" : "main-nav"} aria-label="Main navigation"><Link href="/#inventory" onClick={() => setOpen(false)}>Shop</Link><Link href="/#scales" onClick={() => setOpen(false)}>Browse by scale</Link><Link href="/#model-hunt" onClick={() => setOpen(false)}>Model Hunt</Link><Link href="/sell" onClick={() => setOpen(false)}>Sell with us</Link></nav>
    <div className="header-actions"><Link className="icon-button" href="/wishlist" aria-label={`Saved items, ${wishlist.length}`}><Icon name="heart"/>{wishlist.length > 0 && <span className="count">{wishlist.length}</span>}</Link><Link className="icon-button" href="/cart" aria-label={`Shopping cart, ${cartCount} items`}><Icon name="bag"/>{cartCount > 0 && <span className="count">{cartCount}</span>}</Link><button className="icon-button menu-toggle" type="button" aria-expanded={open} aria-label="Toggle navigation" onClick={() => setOpen(!open)}><Icon name="menu"/></button></div>
  </header>;
}
