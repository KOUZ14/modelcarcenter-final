import Link from "next/link";

export function SiteFooter() {
  return <footer><div className="shell footer-top"><Link className="brand footer-brand" href="/"><span className="brand-mark">MCC</span><span className="brand-name">MODEL CAR <b>CENTER</b></span></Link><p>One search for the models worth collecting.</p></div><div className="shell footer-links">
    <div><h3>Marketplace</h3><Link href="/#inventory">Browse all</Link><Link href="/#scales">Browse by scale</Link><Link href="/#model-hunt">Model Hunt</Link><Link href="/wishlist">Saved items</Link></div>
    <div><h3>Sell</h3><Link href="/sell">Sell with us</Link><Link href="/seller-terms">Seller terms</Link></div>
    <div><h3>Support</h3><Link href="/contact">Contact</Link><Link href="/returns">Returns</Link></div>
    <div><h3>Model Car Center</h3><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/admin">Admin</Link></div>
  </div><div className="shell footer-bottom"><span>© 2026 Model Car Center</span><span>Made for collectors.</span></div></footer>;
}
