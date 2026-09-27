"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { BrandLogo } from "./brand-logo";
import { CookieSettingsButton } from "./cookie-notice";

const groups = [
  { title: "Marketplace", links: [["/marketplace", "Browse all"], ["/#scales", "Browse by scale"], ["/#model-hunt", "Model Hunt"], ["/wishlist", "Saved items"]] },
  { title: "Sell", links: [["/sell", "Sell with us"], ["/seller-terms", "Seller terms"]] },
  { title: "Support", links: [["/help", "Shopping & selling help"], ["/resolution", "Customer Support"], ["/protection", "Buyer & seller protection"], ["/contact", "Contact"], ["/shipping", "Shipping"], ["/returns", "Returns & refunds"]] },
  { title: "Policies", links: [["/terms", "Marketplace terms"], ["/privacy", "Privacy"], ["/privacy/request", "Data deletion requests"], ["/cookies", "Cookies & local storage"]] },
];

export function SiteFooter() {
  const footer = useRef<HTMLElement>(null);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 820px)");
    const update = () => footer.current?.querySelectorAll("details").forEach(group => { group.open = !mobile.matches; });
    update();
    mobile.addEventListener("change", update);
    return () => mobile.removeEventListener("change", update);
  }, []);

  return <footer ref={footer} className="site-footer">
    <div className="shell footer-top"><Link className="brand footer-brand" href="/" aria-label="Model Car Center home"><BrandLogo /></Link><p>One search for the models worth collecting.</p></div>
    <div className="shell footer-links">
      {groups.map(group => <details key={group.title} className="footer-group">
        <summary onClick={event => { if (window.matchMedia("(min-width: 821px)").matches) event.preventDefault(); }}>{group.title}</summary>
        <div className="footer-group-links">{group.links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}{group.title === "Policies" && <CookieSettingsButton />}</div>
      </details>)}
    </div>
    <div className="shell footer-bottom"><span>© 2026 Model Car Center</span><span>Made for collectors.</span></div>
  </footer>;
}
