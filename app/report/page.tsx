import Link from "next/link";
import { config } from "@/lib/config";
import { PolicyPage } from "@/components/policy-page";
import { ComplianceForm } from "@/components/compliance-form";
export default function ReportPage() {
  return <PolicyPage title="Report suspicious activity" intro="Anyone can report suspicious, counterfeit, stolen, unsafe, or misleading marketplace content. No account is required.">
    <p>Email <a href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>{config.reportingPhone&&<> or call <a href={`tel:${config.reportingPhone}`}>{config.reportingPhone}</a></>}. For copyright notices, use <Link href="/copyright">Copyright reports</Link>. For a purchase problem, use <Link href="/resolution">Customer Support</Link>.</p>
    <ComplianceForm endpoint="/api/reports" values={{kind:'suspicious'}} label="Send report"><label>Your name<input name="name" required maxLength={200}/></label><label>Reply email<input name="email" type="email" required/></label><label>Listing, seller, or content URL<input name="subjectUrl" type="url" required maxLength={2000}/></label><label>What happened?<textarea name="details" required maxLength={12000}/></label><label>Type your name to sign<input name="signature" required maxLength={200}/></label><label><input type="checkbox" name="truthful" required/>This report is accurate to the best of my knowledge.</label><p>Do not include passwords, payment details, or identity documents. We restrict access to reports and use them to investigate and respond.</p></ComplianceForm>
  </PolicyPage>;
}
