import type { Metadata } from "next";
import { WishlistPage } from "@/components/wishlist-page";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export const metadata: Metadata = { title: "Saved items", robots: { index: false, follow: false } };
export default function WishlistRoute() { return <main><SiteHeader/><div id="main-content" tabIndex={-1} className="inner-page shell"><WishlistPage/></div><SiteFooter/></main>; }
