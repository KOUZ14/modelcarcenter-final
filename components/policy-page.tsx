import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import Link from "next/link";
import { POLICY_EFFECTIVE_DATE } from "@/lib/legal";

export function PolicyPage({ title, intro, children, effectiveDate = POLICY_EFFECTIVE_DATE }: { title: string; intro: string; children: React.ReactNode; effectiveDate?: string }) {
  return <main><SiteHeader/><article id="main-content" tabIndex={-1} className="inner-page shell legal-page"><p className="eyebrow">Model Car Center policies</p><h1>{title}</h1><p className="legal-intro">{intro}</p><p className="policy-effective"><b>Effective:</b> {effectiveDate}</p><nav className="policy-nav" aria-label="Legal policies"><Link href="/terms">Marketplace Terms</Link><Link href="/protection">Protection Rules</Link><Link href="/privacy">Privacy</Link><Link href="/returns">Returns &amp; Refunds</Link><Link href="/shipping">Shipping</Link><Link href="/cookies">Cookies</Link><Link href="/seller-terms">Seller Terms</Link></nav><div className="legal-content">{children}</div></article><SiteFooter/></main>;
}
