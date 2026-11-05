import { getD1 } from "@/db";
import { sendEmail, escapeHtml } from "./email";

export function legalNotice(id: string, recipient: string, subject: string, body: string) {
  return getD1().prepare("INSERT OR IGNORE INTO legal_notifications(id,recipient,subject,body) VALUES(?,?,?,?)").bind(id,recipient,subject,body);
}

export async function deliverLegalNotices() {
  const rows = await getD1().prepare("SELECT * FROM legal_notifications WHERE sent_at IS NULL ORDER BY created_at LIMIT 30").all<{id:string;recipient:string;subject:string;body:string}>();
  for (const row of rows.results ?? []) {
    try {
      const result = await sendEmail({to:row.recipient,subject:row.subject,text:row.body,html:`<p>${escapeHtml(row.body).replaceAll("\n","<br>")}</p>`,idempotencyKey:row.id});
      if (!result.sent) throw new Error("Email delivery is not configured");
      await getD1().prepare("UPDATE legal_notifications SET sent_at=?,error=NULL,attempts=attempts+1 WHERE id=?").bind(new Date().toISOString(),row.id).run();
    } catch {
      await getD1().prepare("UPDATE legal_notifications SET attempts=attempts+1,error='Delivery pending; operations review required' WHERE id=?").bind(row.id).run();
    }
  }
}
