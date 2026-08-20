import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Buyer & Seller Protection Rules",
  description: "Eligibility, evidence, deadlines, returns, refunds, and exclusions for Model Car Center order cases.",
};

export default function ProtectionPage() {
  return <PolicyPage title="Buyer & Seller Protection Rules" intro="These rules govern Model Car Center’s order-level Resolution & Protection Center. They explain who is covered, what each party must do, the deadlines the product enforces, and how eligible remedies are issued.">
    <p><Link href="/resolution"><b>Open the Resolution &amp; Protection Center →</b></Link></p>

    <h2>1. Orders covered</h2>
    <p>Protection applies to an order paid through Model Car Center checkout while the buyer and seller use the platform case record in good faith. Covered problems include non-delivery, carrier damage, a wrong or missing item, a material difference from the listing, and a reasonable authenticity concern. Coverage is limited to the remaining paid order balance and does not replace non-waivable rights under applicable law.</p>

    <h2>2. Enforced deadlines</h2>
    <div className="legal-table-wrap"><table><thead><tr><th>Step</th><th>Deadline</th><th>What happens</th></tr></thead><tbody>
      <tr><td>Buyer opens a case</td><td>Within 30 calendar days after the seller marks the order shipped; if unshipped, within 45 calendar days after payment</td><td>The system blocks a new case after the window, unless applicable law requires otherwise.</td></tr>
      <tr><td>Buyer supplies evidence</td><td>Within 5 calendar days after opening</td><td>Clear photos or PDFs should show the model, packaging, shipping label, and claimed problem.</td></tr>
      <tr><td>Seller responds</td><td>Within 3 calendar days after opening</td><td>After the deadline, the buyer may escalate for platform review.</td></tr>
      <tr><td>Buyer reviews a seller response</td><td>Within 3 calendar days after the response</td><td>The buyer may accept/close, continue with an authorized return, or escalate.</td></tr>
      <tr><td>Buyer ships an authorized return</td><td>Within 7 calendar days after authorization</td><td>The buyer adds carrier tracking and keeps the receipt. A missed deadline may affect eligibility.</td></tr>
    </tbody></table></div>

    <h2>3. Buyer protection requirements</h2>
    <ul>
      <li>Use the correct order, describe the problem accurately, and request a proportionate remedy.</li>
      <li>Preserve the model, original product packaging, certificates, accessories, inserts, shipping carton, and label while the case is open.</li>
      <li>Provide unaltered, relevant evidence. For damage, discrepancy, wrong/missing item, or authenticity claims, at least one photo or PDF is required when the case opens.</li>
      <li>Do not ship a return before an RMA and return instructions appear in the case. Use the provided label and add tracking by the stated deadline.</li>
      <li>Do not file duplicate claims, misrepresent condition, substitute items, or seek recovery exceeding the paid balance.</li>
    </ul>

    <h2>4. Seller protection requirements</h2>
    <ul>
      <li>Ship to the checkout address, use adequate collectible-safe packaging, and add valid carrier tracking.</li>
      <li>Keep the listing, condition disclosures, pre-shipment images, packing records, serial or edition details, and carrier receipt.</li>
      <li>Respond in the case within three calendar days. Address the reported facts and upload relevant evidence rather than moving the dispute off-platform.</li>
      <li>For a covered return, issue an RMA, clear packing instructions, and a prepaid PDF or image label. The seller bears reasonable authorized return shipping for covered listing, authenticity, wrong-item, missing-item, or transit-damage problems.</li>
      <li>Issue an approved partial or full refund through the case to the original payment method. Do not condition a required refund on store credit or an off-platform agreement.</li>
    </ul>

    <h2>5. Remedies and return handling</h2>
    <p>A supported claim may result in a full refund, a return for a full refund, or a partial refund the buyer keeps with the item. A replacement is used only when separately offered and accepted. Authorized returns receive a case-specific RMA and downloadable prepaid label. Refunds are submitted through Stripe to the original payment method; card networks and banks control posting time after submission.</p>

    <h2>6. What is not covered</h2>
    <ul>
      <li>Payments, deposits, side agreements, or returns completed outside Model Car Center.</li>
      <li>Buyer’s remorse or preference-based returns unless the seller’s disclosed return policy accepts them.</li>
      <li>Damage, loss, opening of a sealed model, assembly, modification, part removal, or misuse occurring after delivery.</li>
      <li>Differences that were clearly and accurately disclosed in the listing photographs and condition details.</li>
      <li>Unauthorized returns, refusal to provide reasonable evidence, return of a different or incomplete item, or material deadline abuse.</li>
      <li>Customs charges, carrier delays alone, or indirect losses except where applicable law requires a remedy.</li>
    </ul>

    <h2>7. Platform review and cooperation</h2>
    <p>When a case is escalated, Model Car Center may review the order, listing snapshot, payment and shipment records, case messages, and private files. We may request more information, preserve records for payment disputes, and apply account restrictions for fraud, retaliation, evidence tampering, repeated non-response, or protection abuse. A review outcome does not limit rights that cannot lawfully be waived.</p>

    <h2>8. Privacy and records</h2>
    <p>Case evidence and return labels are access-controlled to the authenticated buyer, authenticated seller, and authorized Model Car Center reviewers. They are not public listing media. Transaction and case records may be retained for fraud prevention, legal compliance, accounting, and dispute handling under the Privacy Policy.</p>
  </PolicyPage>;
}

