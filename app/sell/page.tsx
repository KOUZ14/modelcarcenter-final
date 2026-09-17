import type { Metadata } from "next";
import Link from "next/link";
import { SellerApplicationForm } from "@/components/seller-application-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { config } from "@/lib/config";
import { formatFeePercent } from "@/lib/fees";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sell with us", description: "Keep your existing store. Model Car Center gives you another sales channel.", alternates: { canonical: "/sell" } };
export default function SellPage() {
  const collectorFee = formatFeePercent(config.collectorMarketplaceFeeBps);
  const professionalFee = formatFeePercent(
    config.professionalMarketplaceFeeBps,
  );
  const foundingFee = formatFeePercent(
    config.foundingSellerMarketplaceFeeBps,
  );
  return (
    <main>
      <SiteHeader />
      <div id="main-content" tabIndex={-1} className="inner-page shell">
        <section className="sell-intro">
          <p className="eyebrow">Two ways to sell</p>
          <h1>Sell model cars</h1>
          <p>
            Individual collectors can list their own models. Approved stores
            get a dedicated console for inventory, fulfillment, and analytics.
          </p>
          <div className="seller-paths">
            <article>
              <p className="eyebrow">For individual collectors</p>
              <h2>{collectorFee} Model Car Center marketplace fee</h2>
              <p className="seller-path-description">
                List one model, several models, or part of your collection from
                the same account you use to buy, save, and hunt.
              </p>
              <p className="seller-payment-note">
                <strong>You also pay the actual payment-processing fee, deducted from your proceeds.</strong>
              </p>
              <ul className="seller-benefits">
                <li>No listing fees</li>
                <li>No monthly fees</li>
                <li>Commission applies to the item subtotal, excluding shipping and tax</li>
              </ul>
              <div className="seller-actions">
                <Link className="button dark" href="/sell/model">
                  Sell a Model
                </Link>
              </div>
            </article>
            <article>
              <p className="eyebrow">For stores and businesses</p>
              <h2>{professionalFee} standard marketplace fee</h2>
              <p className="seller-path-description">
                Keep your existing sales channels. Model Car Center acts as an
                additional sales channel with professional tools built for
                growing inventory and orders.
              </p>
              <p className="seller-payment-note">
                <strong>You also pay the actual payment-processing fee, deducted from your proceeds.</strong>
              </p>
              <ul className="seller-benefits">
                <li>No listing fees</li>
                <li>No monthly fees to sell</li>
                <li>CSV inventory imports and listing management</li>
                <li>Stock, order, shipping, and fulfillment tools</li>
                <li>Storefront settings and sales analytics</li>
              </ul>
              <div className="seller-actions row-actions">
                <a className="button outline" href="#professional-application">
                  Apply as a Professional Seller
                </a>
                <Link className="text-link" href="/store">
                  Store sign in
                </Link>
              </div>
            </article>
          </div>
          <div className="process-grid">
            <article>
              <span>01</span>
              <h2>Apply</h2>
              <p>Tell us about your business and current inventory.</p>
            </article>
            <article>
              <span>02</span>
              <h2>Onboard</h2>
              <p>If approved, complete secure payout setup on Stripe.</p>
            </article>
            <article>
              <span>03</span>
              <h2>Import</h2>
              <p>Create products or import inventory in your store account.</p>
            </article>
            <article>
              <span>04</span>
              <h2>Fulfill</h2>
              <p>Manage orders, tracking, and store performance.</p>
            </article>
          </div>
        </section>
        <section className="application-section" id="professional-application">
          <div>
            <p className="eyebrow">Professional seller application</p>
            <h2>Seller application</h2>
            <p>
              Applying does not guarantee approval. We review each store before
              listings can become active.
            </p>
            <h3>
              Founding Seller Rate — {foundingFee} marketplace fee for your first
              6 months
            </h3>
            <p>
              Eligible professional stores are assigned by Model Car Center.
              After six months, the {professionalFee} standard professional rate
              applies automatically.
            </p>
            <p>
              No listing fees. No monthly fees. Sellers also pay actual payment processing.
            </p>
          </div>
          <SellerApplicationForm marketplaceFeeBps={config.professionalMarketplaceFeeBps} />
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
