import type { Metadata } from "next";
import { CartPage } from "@/components/cart-page";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { config } from "@/lib/config";
import "@/components/cart-page.css";

export const metadata: Metadata = { title: "Cart", robots: { index: false, follow: false } };
export default function CartRoute() { return <main className="cart-route"><SiteHeader/><div id="main-content" tabIndex={-1} className="inner-page shell cart-page-shell"><CartPage automaticTax={config.automaticTax} taxBehavior={config.stripeTaxBehavior}/></div><SiteFooter/></main>; }
