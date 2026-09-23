import type { Metadata } from "next";
import Link from "next/link";
import { SellerApplicationForm } from "@/components/seller-application-form";
import { SellerStart } from "@/components/seller-start";
import { SellerToolsPreview } from "@/components/seller-tools-preview";
import { SellerProceedsCalculator } from "@/components/seller-proceeds-calculator";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { config } from "@/lib/config";
import { formatFeePercent } from "@/lib/fees";
import { activeProtectionPolicy } from "@/lib/protection";
import "@/components/sell-page.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sell with us",
  description: "Sell models from your own collection or apply as a store. Compare fees and preview the seller tools.",
  alternates: { canonical: "/sell" },
};

export default function SellPage() {
  const professionalFee = formatFeePercent(config.professionalMarketplaceFeeBps);
  const foundingFee = formatFeePercent(config.foundingSellerMarketplaceFeeBps);
  const promotionDuration = config.foundingSellerPromotionMonths === 6
    ? "six months" : `${config.foundingSellerPromotionMonths} months`;

  return (
    <main>
      <SiteHeader />
      <div id="main-content" tabIndex={-1} className="inner-page shell sell-page">
        <section className="sell-intro" aria-labelledby="sell-title">
          <p className="eyebrow">For collectors and stores</p>
          <h1 id="sell-title">Find the next home for your models.</h1>
          <p>Sell models from your collection or your store. Choose how to start.</p>
        </section>
        <SellerStart
          collectorFee={formatFeePercent(config.collectorMarketplaceFeeBps)}
          professionalFee={professionalFee}
          application={
            <section className="sell-application" aria-labelledby="application-title">
              <div className="sell-application-intro">
                <p className="eyebrow">For stores and businesses</p>
                <h2 id="application-title">Apply as a store</h2>
                <p>Tell us about your business and inventory. Keep your existing sales channels and add models individually or by spreadsheet.</p>
                <div className="sell-founding-offer">
                  <h3>Founding-store offer</h3>
                  <p><strong>Eligible stores: {foundingFee} for {promotionDuration}, then {professionalFee}, plus processing.</strong></p>
                  <details>
                    <summary>Who qualifies, and when will I know?</summary>
                    <p>Only professional stores assigned the offer by Model Car Center qualify. Eligibility is confirmed separately from store approval; applying alone does not activate the rate.</p>
                    <p>You’ll know you qualify when Model Car Center confirms the offer and its start and end dates for your store. Your active rate appears in Seller Dashboard. Until eligibility is confirmed, plan on the standard {professionalFee} rate. <Link href="/contact#seller-setup-help">Contact us about eligibility</Link>.</p>
                  </details>
                </div>
                <details className="sell-requirements">
                  <summary>What you need before listings go live</summary>
                  <ul>
                    <li>Store approval and a completed public store profile.</li>
                    <li>Stripe payout setup and shipping options.</li>
                    <li>Model details, condition disclosures and photos of your actual inventory.</li>
                  </ul>
                  <p>There is no automatic stock sync with other websites. Update quantities here when a model sells elsewhere.</p>
                </details>
              </div>
              <SellerApplicationForm marketplaceFeeBps={config.professionalMarketplaceFeeBps} />
            </section>
          }
        />
        <SellerToolsPreview />
        <SellerProceedsCalculator rates={{
          collector: config.collectorMarketplaceFeeBps,
          professional: config.professionalMarketplaceFeeBps,
          founding: config.foundingSellerMarketplaceFeeBps,
        }} />
        <section className="sell-support" aria-labelledby="seller-help-title">
          <h2 id="seller-help-title">A few things to know</h2>
          <details>
            <summary>When do I get paid?</summary>
            <ol>
              <li>The buyer pays. Proceeds are held while you prepare the order.</li>
              <li>Ship by the order’s deadline and add tracking.</li>
              <li>Confirmed delivery starts the order’s protection window, currently {activeProtectionPolicy.deliveredDays} calendar days.</li>
              <li>After the deadline, proceeds become eligible for release if there are no open cases or payment holds and processing fees are final.</li>
              <li>Stripe sends the bank payout on its schedule. Bank arrival happens after release.</li>
            </ol>
            <p>Open cases pause release until resolved. Existing orders keep the protection terms under which they were sold. <Link href="/seller-terms#fees">Full payout and fee details</Link>.</p>
          </details>
          <details>
            <summary>Can I get help with setup or a spreadsheet?</summary>
            <p>Email us for help with your first listings or an inventory upload. You can also ask about a short setup session; availability is confirmed individually.</p>
            <p><Link href="/contact#seller-setup-help">Contact seller support</Link> or <Link href="/help#inventory">read the seller guide</Link>.</p>
          </details>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
