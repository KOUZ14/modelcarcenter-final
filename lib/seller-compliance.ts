import { getD1 } from "@/db";
import { config } from "./config";
import { legalNotice } from "./legal-notifications";
import { requiredString, ValidationError } from "./validation";

type Sale={at:string;qualifyingCents:number;grossCents:number};
const DAY=86400000;
/** Any consecutive 12-month window in the prior 24 months; calendar dates, not calendar years. */
export function informCoverage(sales:Sale[],now=new Date()) {
  const start=new Date(now); start.setUTCFullYear(start.getUTCFullYear()-2);
  const yearAgo=new Date(now); yearAgo.setUTCFullYear(yearAgo.getUTCFullYear()-1);
  const rows=sales.filter(s=>Date.parse(s.at)>=start.getTime()&&Date.parse(s.at)<=now.getTime()).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  let covered=false,maxTransactions=0,maxRevenueCents=0;
  const qualifying=rows.filter(s=>s.qualifyingCents>0);
  let left=0,total=0;
  for(let right=0;right<qualifying.length;right++) {
    const cutoff=new Date(qualifying[right].at);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-1);
    total+=qualifying[right].qualifyingCents;
    while(left<right&&Date.parse(qualifying[left].at)<=cutoff.getTime()) total-=qualifying[left++].qualifyingCents;
    const count=right-left+1;
    maxTransactions=Math.max(maxTransactions,count);maxRevenueCents=Math.max(maxRevenueCents,total);
    if(count>=200&&total>=500000)covered=true;
  }
  const annualGrossCents=rows.filter(s=>Date.parse(s.at)>yearAgo.getTime()).reduce((n,s)=>n+s.grossCents,0);
  return {covered,disclosureRequired:covered&&annualGrossCents>=2000000,maxTransactions,maxRevenueCents,annualGrossCents};
}

export async function assessSellerCompliance(sellerId:string,now=new Date()) {
  // Unknown historical condition counts conservatively pending documentary review.
  const rows=await getD1().prepare(`SELECT o.paid_at AS at,SUM(i.unit_price_cents*i.quantity) AS grossCents,
    SUM(CASE WHEN e.snapshot IS NULL OR json_extract(e.snapshot,'$.condition') IN ('new','new_sealed','new_opened')
      THEN i.unit_price_cents*i.quantity ELSE 0 END) AS qualifyingCents
    FROM orders o JOIN order_items i ON i.order_id=o.id
    LEFT JOIN purchase_evidence e ON e.checkout_id=o.checkout_reservation_id AND e.product_id=i.product_id
    WHERE o.seller_id=? AND o.paid_at IS NOT NULL AND o.is_test_order=0 AND julianday(o.paid_at)>=julianday(?,'-2 years') GROUP BY o.id`).bind(sellerId,now.toISOString()).all<Sale>();
  const coverage=informCoverage(rows.results??[],now),db=getD1(),at=now.toISOString();
  if(coverage.covered) {
    const result=await db.prepare(`INSERT OR IGNORE INTO seller_compliance(seller_id,covered,disclosure_required,requested_at,due_at) VALUES(?,1,?,?,?)`).bind(sellerId,coverage.disclosureRequired?1:0,at,new Date(now.getTime()+10*DAY).toISOString()).run();
    await db.prepare("UPDATE seller_compliance SET covered=1,disclosure_required=? WHERE seller_id=?").bind(coverage.disclosureRequired?1:0,sellerId).run();
    if(result.meta.changes) {
      const seller=await db.prepare("SELECT contact_email FROM sellers WHERE id=?").bind(sellerId).first<{contact_email:string}>();
      if(seller) await legalNotice(`inform:${sellerId}`,seller.contact_email,"Seller verification required",`Provide and certify your business contact information within 10 days at ${config.siteUrl}/store/compliance. We will verify identity, tax and payment information through our secure payment provider. Sales may be restricted until reporting and verification requirements are met.`).run();
    }
  } else await db.prepare("UPDATE seller_compliance SET covered=0,disclosure_required=0 WHERE seller_id=?").bind(sellerId).run();
  const row=await db.prepare("SELECT * FROM seller_compliance WHERE seller_id=?").bind(sellerId).first<SellerCompliance>();
  if(row?.covered&&row.certified_at&&Date.parse(row.certified_at)<=now.getTime()-365*DAY&&row.status==='verified') {
    await db.prepare("UPDATE seller_compliance SET status='recertification_due',requested_at=?,due_at=? WHERE seller_id=? AND status='verified'").bind(at,new Date(now.getTime()+10*DAY).toISOString(),sellerId).run();
    const seller=await db.prepare("SELECT contact_email FROM sellers WHERE id=?").bind(sellerId).first<{contact_email:string}>();
    if(seller)await legalNotice(`inform-annual:${sellerId}:${row.certified_at}`,seller.contact_email,"Annual seller certification required",`Certify or update your seller information within 10 days at ${config.siteUrl}/store/compliance.`).run();
  }
  const current=await db.prepare("SELECT * FROM seller_compliance WHERE seller_id=?").bind(sellerId).first<SellerCompliance>();
  const blocked=Boolean(current?.covered&&(!config.reportingPhone||current.status==='suspended'||
    (current.status!=='verified'&&Date.parse(current.due_at)<=now.getTime())||
    (current.disclosure_required&&!current.public_disclosure)));
  if(blocked)await db.prepare("UPDATE seller_compliance SET suspended_at=COALESCE(suspended_at,?) WHERE seller_id=?").bind(at,sellerId).run();
  else if(current)await db.prepare("UPDATE seller_compliance SET suspended_at=NULL WHERE seller_id=?").bind(sellerId).run();
  return {...coverage,blocked,record:current};
}
export type SellerCompliance={seller_id:string;covered:number;disclosure_required:number;status:string;due_at:string;certified_at:string|null;public_disclosure:string|null;information:string|null};
export async function assertSellerCompliance(sellerId:string) {
  if((await assessSellerCompliance(sellerId)).blocked)throw new ValidationError("This seller must complete marketplace verification and reporting requirements before accepting new purchases.");
}
export async function certifySeller(userId:string,payload:Record<string,unknown>) {
  const seller=await getD1().prepare("SELECT id FROM sellers WHERE owner_user_id=?").bind(userId).first<{id:string}>();
  if(!seller)throw new ValidationError("Seller account required.");
  if(payload.certified!==true)throw new ValidationError("Certify that the information is accurate and current.");
  const info=Object.fromEntries(['businessName','businessAddress','businessPhone','businessEmail'].map(key=>[key,requiredString(payload[key],key,500)]));
  info.homeAddressException=payload.homeAddressException===true?'requested':'not_requested';
  const now=new Date().toISOString();
  await getD1().batch([
    getD1().prepare(`INSERT INTO seller_compliance(seller_id,requested_at,due_at,information,submitted_at,certified_at,status,verification_due_at)
      VALUES(?,?,?,?,?,?,'submitted',?) ON CONFLICT(seller_id) DO UPDATE SET information=excluded.information,submitted_at=excluded.submitted_at,
      certified_at=excluded.certified_at,status='submitted',verification_due_at=excluded.verification_due_at,public_disclosure=NULL`).bind(seller.id,now,new Date(Date.now()+10*DAY).toISOString(),JSON.stringify(info),now,now,new Date(Date.now()+10*DAY).toISOString()),
    getD1().prepare("INSERT INTO compliance_audit(id,subject_id,actor,action,detail) VALUES(?,?,?,'seller_certification',?)").bind(crypto.randomUUID(),seller.id,userId,JSON.stringify({information:info,certifiedAt:now})),
    legalNotice(`inform-submitted:${seller.id}:${now}`,config.supportEmail,"Seller verification due within 10 days",`Review ${seller.id} in /admin/compliance. Verify the supplied identity/contact details and bank/tax records held by the payment provider. Review any home-address disclosure exception before publishing.`),
  ]);
}
export async function processSellerCompliance(now=new Date()) {
  // Sellers with transactions or an existing certification, including suspended sellers.
  const rows=await getD1().prepare("SELECT id FROM sellers WHERE id IN (SELECT seller_id FROM orders WHERE is_test_order=0) OR id IN (SELECT seller_id FROM seller_compliance)").all<{id:string}>();
  for(const row of rows.results??[])await assessSellerCompliance(row.id,now);
}
