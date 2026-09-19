import type { Metadata } from "next";
import Link from "next/link";
import { SellerApplicationForm } from "@/components/seller-application-form";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { config } from "@/lib/config";
import { formatFeePercent } from "@/lib/fees";
import { SellerProceedsCalculator } from "@/components/seller-proceeds-calculator";
import { activeProtectionPolicy } from "@/lib/protection";
import "@/components/seller-workflows.css";

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
          <p className="eyebrow">Sell to model-car buyers</p>
          <h1>Bring your models to more collectors.</h1>
          <p>
            Reach buyers looking for model cars while keeping your existing store,
            website, and selling channels. Start with one model or a spreadsheet.
          </p>
          <div className="seller-founding-note"><b>Eligible founding stores: {foundingFee} for {config.foundingSellerPromotionMonths} months</b><p>Plus actual payment processing. Model Car Center assigns eligibility and records each store’s start and end dates. Those dates appear in your Seller Dashboard. The standard {professionalFee} rate applies afterward. Enrollment criteria and promotion start dates must be confirmed by the owner; applying alone does not activate this rate.</p></div>
          <div className="policy-table-wrap"><table className="seller-pricing-table"><caption>Seller pricing at a glance</caption><thead><tr><th>Seller type</th><th>Marketplace fee</th><th>Who it is for</th></tr></thead><tbody><tr><th>Collector</th><td>{collectorFee}</td><td>Individuals selling models from their own collection.</td></tr><tr><th>Professional</th><td>{professionalFee}</td><td>Approved stores and businesses managing ongoing inventory.</td></tr><tr><th>Eligible founding store</th><td>{foundingFee} for {config.foundingSellerPromotionMonths} months, then {professionalFee}</td><td>Professional stores specifically assigned an eligible promotion by Model Car Center.</td></tr></tbody></table></div><p>Every type pays actual payment processing in addition to the marketplace fee. No listing or monthly selling fees. Marketplace commission applies to item price, excluding shipping and tax.</p>
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
                <a className="button dark" href="#listing-preview">See how listing works</a>
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
                <li>Upload inventory from a spreadsheet</li>
                <li>Stock, order, shipping, and fulfillment tools</li>
                <li>Store settings, sales and performance</li>
              </ul>
              <div className="seller-actions row-actions">
                <a className="button outline" href="#listing-preview">
                  Preview the seller tools
                </a>
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
              <h2>Get ready</h2>
              <p>Connect your bank account to receive payments and set shipping options.</p>
            </article>
            <article>
              <span>03</span>
              <h2>Add inventory</h2>
              <p>Save a draft model or upload a spreadsheet. Preview and fix rows before saving.</p>
            </article>
            <article>
              <span>04</span>
              <h2>Fulfill</h2>
              <p>Manage orders, tracking, and store performance.</p>
            </article>
          </div>
        </section>
        <section className="seller-process-preview" id="listing-preview"><p className="eyebrow">Preview the listing process</p><h2>One model, four short steps.</h2><div className="seller-flow-preview"><article><b>1</b><h3>Identify the model</h3><p>Choose the exact release, then add your seller SKU, price, and stock.</p></article><article><b>2</b><h3>Describe its condition</h3><p>Record model and box condition separately, including missing parts or defects.</p></article><article><b>3</b><h3>Add actual photos</h3><p>Label what each image shows. Factory-sealed models can stay sealed.</p></article><article><b>4</b><h3>Save, then publish</h3><p>Your draft stays saved. Check any missing setup or review requirements before going live.</p></article></div><h3>Daily work in your Seller Dashboard</h3><p><b>Orders</b> shows what to ship and when. <b>Inventory</b> handles listings, spreadsheet uploads, price and stock updates. <b>Payments</b> explains held proceeds and release status. Store settings and Help remain easy to reach.</p><p><Link className="text-link" href="/help#inventory">Read the short seller guide</Link></p><div className="row-actions"><Link className="button dark" href="/sell/model">Sell a model</Link><a className="button outline" href="#professional-application">Apply as a professional seller</a><Link className="text-link" href="/store">Open Seller Dashboard</Link></div></section>
        <SellerProceedsCalculator rates={{ collector: config.collectorMarketplaceFeeBps, professional: config.professionalMarketplaceFeeBps, founding: config.foundingSellerMarketplaceFeeBps }}/>
        <section className="store-panel"><h2>When you get paid</h2><ol><li>Buyer pays. Proceeds are held while you prepare the order.</li><li>Ship by the order’s deadline and add tracking.</li><li>Confirmed delivery starts the order’s protection window. The current window is {activeProtectionPolicy.deliveredDays} calendar days.</li><li>After the deadline, proceeds become eligible for release if there are no open cases or payment holds and processing fees are final.</li><li>Stripe sends the bank payout on its schedule. Bank arrival happens after release.</li></ol><p>Open cases pause release until resolved. Existing orders keep the protection terms under which they were sold. <Link href="/seller-terms#fees">Full payout and fee details</Link>.</p></section>
        <section className="store-panel"><h2>Help with your first models</h2><p>Our support email is available for questions about setup and spreadsheet uploads. Ask about a short setup session; the owner will confirm availability. The dashboard shows relevant Model Hunt demand when requests exist, without sharing buyers’ private details.</p><p>Owner-led launch promotion and task videos are planned; neither is a guaranteed application benefit. There is no automatic stock synchronization with other websites. Update quantities here when an item sells elsewhere.</p><Link className="button outline" href="/contact#seller-setup-help">Need help getting your first models listed?</Link></section>
        <section className="application-section" id="professional-application">
          <div>
            <p className="eyebrow">Professional seller application</p>
            <h2>Seller application</h2>
            <p>
              Applying does not guarantee approval. We review each store before
              listings can become active. No fixed review time is promised. We’ll contact you by email with the next step.
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
