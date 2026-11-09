import { requireCollector } from "@/lib/collector-auth";
import { getD1 } from "@/db";
import { assessSellerCompliance } from "@/lib/seller-compliance";
import { PolicyPage } from "@/components/policy-page";
import { ComplianceForm } from "@/components/compliance-form";
export const dynamic="force-dynamic";
export default async function SellerCompliancePage() {
  const {user}=await requireCollector('/store/compliance');
  const seller=await getD1().prepare("SELECT id FROM sellers WHERE owner_user_id=?").bind(user.id).first<{id:string}>();
  const state=seller?await assessSellerCompliance(seller.id):null;
  return <PolicyPage title="Seller verification" intro="Keep your business information accurate. We use this information for verification and legally required disclosures.">{!seller?<p>Create a seller account first.</p>:<><p>Status: {state?.record?.status??'No certification submitted'}. {state?.blocked?'New purchases are restricted until the requirements are complete.':''}</p>{state?.record&&<p>Response deadline: {state.record.due_at}</p>}<ComplianceForm endpoint="/api/store/compliance" label="Submit certification">
    <label>Legal business name<input name="businessName" required maxLength={500}/></label><label>Business mailing address<textarea name="businessAddress" required maxLength={500}/></label><label>Business phone<input name="businessPhone" type="tel" required maxLength={100}/></label><label>Business email<input name="businessEmail" type="email" required maxLength={254}/></label>
    <label><input type="checkbox" name="homeAddressException"/>My only business address is my home address. Please review the permitted limited disclosure before publishing.</label><p>Do not enter Social Security numbers, tax IDs, bank numbers, or identity documents here. Keep those records in Stripe’s secure onboarding. Support may request verification through a secure channel. A public disclosure is reviewed separately.</p>
    <label><input name="certified" type="checkbox" required/>I certify this information is complete, accurate, and current and will notify MCC of changes.</label>
    </ComplianceForm></>}</PolicyPage>;
}
