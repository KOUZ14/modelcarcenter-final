import Link from "next/link";
import { getD1 } from "@/db";
import { config } from "@/lib/config";
export async function SellerDisclosure({sellerId}:{sellerId:string}) {
  const row=await getD1().prepare("SELECT public_disclosure FROM seller_compliance WHERE seller_id=? AND covered=1 AND disclosure_required=1 AND status='verified'").bind(sellerId).first<{public_disclosure:string|null}>();
  return <aside aria-label="Seller disclosures and reporting">{row?.public_disclosure&&<p style={{whiteSpace:'pre-line'}}>{row.public_disclosure}</p>}<p><Link href="/report">Report suspicious seller or listing activity</Link>{config.reportingPhone&&<> · <a href={`tel:${config.reportingPhone}`}>{config.reportingPhone}</a></>}</p></aside>;
}
