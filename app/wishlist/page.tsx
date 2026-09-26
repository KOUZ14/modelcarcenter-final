import type { Metadata } from "next";
import { WishlistPage } from "@/components/wishlist-page";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "@/components/wishlist-page.css";

export const metadata: Metadata = { title: "Your wishlist", robots: { index: false, follow: false } };
export default function WishlistRoute() { return <main className="wishlist-route"><SiteHeader/><div id="main-content" tabIndex={-1} className="inner-page shell wishlist-shell"><WishlistPage/></div><SiteFooter/></main>; }
