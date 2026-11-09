import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export default function NotFound() { return <main><SiteHeader/><div id="main-content" tabIndex={-1} className="inner-page shell empty-state"><p className="eyebrow">404</p><h1>Page not found</h1><p>The page or listing you requested is unavailable. Search current inventory or start a Model Hunt.</p><Link className="button dark" href="/marketplace">Browse inventory</Link></div><SiteFooter/></main>; }
