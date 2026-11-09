import Link from "next/link";
import { getD1 } from "@/db";
import { requireAdminPage } from "@/lib/admin-auth";
import { AdminFrame } from "@/components/admin-frame";
import { adminEnvironment } from "@/lib/admin-environment";
import { ComplianceForm } from "@/components/compliance-form";
import { config } from "@/lib/config";
import { dmcaReady } from "@/lib/marketplace-reports";
export const dynamic="force-dynamic";
export const metadata={title:'Consumer compliance',robots:{index:false,follow:false}};
export default async function CompliancePage() {
  const admin=await requireAdminPage(),db=getD1();
  const queues=[
    ['Public reports',"SELECT * FROM marketplace_reports WHERE status NOT IN ('closed','restored') ORDER BY due_at LIMIT 200"],
    ['Seller certifications',"SELECT c.*,s.store_name FROM seller_compliance c JOIN sellers s ON s.id=c.seller_id ORDER BY c.due_at LIMIT 200"],
    ['Repeat copyright removals',"SELECT seller_id,count(*) AS removals FROM marketplace_reports WHERE kind='copyright' AND status='removed' AND seller_id IS NOT NULL GROUP BY seller_id HAVING count(*)>=2"],
    ['Late order reports',"SELECT r.*,c.order_id,c.status FROM resolution_late_reviews r JOIN resolution_cases c ON c.id=r.case_id WHERE c.status NOT IN ('closed','resolved','denied')"],
    ['Shipping delays and refunds',"SELECT * FROM order_shipping_delays WHERE status NOT IN ('refunded','fulfilled') OR error IS NOT NULL ORDER BY created_at LIMIT 200"],
    ['Overdue orders needing review',"SELECT id,order_number,ship_by_at,protection_policy_version FROM orders WHERE shipped_at IS NULL AND fulfillment_status IN ('unfulfilled','processing') AND payment_status IN ('paid','partially_refunded') AND julianday(ship_by_at)<julianday('now') LIMIT 200"],
    ['Legacy deposit review',"SELECT r.id,r.reason,l.amount_cents,l.refunded_cents,d.seller_transfer_id FROM preorder_reservations r JOIN preorder_payment_ledger l ON l.reservation_id=r.id AND l.kind='deposit' LEFT JOIN preorder_deposit_checkouts d ON d.reservation_id=r.id WHERE r.status IN ('cancelled','expired') AND r.order_id IS NULL AND l.refunded_cents<l.amount_cents AND r.reason IN ('account_deleted','buyer_change_of_mind','payment_deadline_expired') LIMIT 200"],
    ['Undelivered notices',"SELECT id,subject,created_at,attempts,error FROM legal_notifications WHERE sent_at IS NULL ORDER BY created_at LIMIT 200"],
    ['Recent decisions',"SELECT * FROM compliance_audit ORDER BY created_at DESC LIMIT 100"],
  ];
  const data=await Promise.all(queues.map(async([title,sql])=>({title,rows:(await db.prepare(sql).all()).results??[]})));
  return <AdminFrame adminEmail={admin.email} environment={adminEnvironment()}><h1>Consumer compliance</h1><p>Reporting phone: {config.reportingPhone||'Not configured — covered sellers cannot take new purchases'}. DMCA registration and published agent: {dmcaReady()?'Configured; verify renewal in the Copyright Office directory':'Pending owner setup'}.</p><p><Link href="/report">Public reporting</Link> · <Link href="/copyright">Copyright notices</Link> · <Link href="/admin?section=resolution">Resolve order cases</Link></p>
    <h2>Record a reviewed decision</h2><ComplianceForm endpoint="/api/admin/compliance"><label>Action<select name="action"><option value="verify_seller">Verify seller certification</option><option value="suspend_seller">Suspend seller (including repeat infringement)</option><option value="remove_listing">Remove reported listing and notify seller</option><option value="forward_counter">Forward valid counter-notice to claimant</option><option value="litigation">Record notice of filed court action</option><option value="restore_reviewed">Record completed content restoration</option><option value="close_report">Close report with findings</option><option value="late_hold">Hold payout after individual late-case review</option><option value="late_release">Release late-case payout hold</option><option value="refund_legacy_deposit">Refund reviewed legacy deposit</option><option value="cancel_overdue">Cancel reviewed overdue order and queue refund</option></select></label><label>Record ID (seller ID, report ID, case ID, reservation ID, or order ID)<input name="id" required maxLength={100}/></label><label>Findings, evidence and reason<textarea name="reason" required maxLength={4000}/></label><label>Secure verification reference (seller verification only)<input name="reference" maxLength={500}/></label><label>Public seller disclosure (seller verification only)<textarea name="disclosure" maxLength={2000}/></label><label>Home-address exception determination<textarea name="exemptionReason" maxLength={2000}/></label><label><input name="verified" type="checkbox"/>I completed the required independent review. For sellers: verified bank/tax records, identity and business contact details, and reviewed public disclosure or exemption. For counter-notices: validated required statements; for restoration: restored eligible content and checked for litigation.</label><p>Never paste bank numbers, tax IDs or identity documents. Public disclosure must include the business name, required address or approved limited location, and direct contact method. Use existing moderation tools to restore content after checking all other restrictions. A report alone is not proof of infringement.</p></ComplianceForm>
    {data.map(q=><section key={q.title}><h2>{q.title}</h2>{q.rows.length?<div style={{overflowX:'auto'}}><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(q.rows,null,2)}</pre></div>:<p>No pending records.</p>}</section>)}
  </AdminFrame>;
}
