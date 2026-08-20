import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export default function NotFound() { return <main><SiteHeader/><div className="inner-page shell empty-state"><p className="eyebrow">Not found</p><h1>That model left the shelf.</h1><p>The listing may be inactive or sold out. Search current inventory or start a Model Hunt.</p><Link className="button dark" href="/marketplace">Browse inventory</Link></div><SiteFooter/></main>; }
