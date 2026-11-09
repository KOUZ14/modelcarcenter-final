import { getD1 } from "@/db";
import { config } from "./config";
import { getCollectorAuth } from "./auth";
import { analyticsConsent, sanitizeAnalyticsDetails, type AnalyticsDetails, type AnalyticsEventName } from "./analytics-rules";
import { pruneMeasurementRecords } from "./measurement-retention";
export { pruneMeasurementRecords } from "./measurement-retention";
export async function mayMeasure(request: Request) {
  if (config.marketplaceMode !== "live" || !analyticsConsent(request.headers.get("cookie")) || request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1" || /bot|crawler|spider|headless/i.test(request.headers.get("user-agent") ?? "")) return false;
  const session = await getCollectorAuth().api.getSession({ headers: request.headers });
  const staff = (process.env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map(value => value.trim());
  const staffEmail = request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  if (staffEmail && staff.includes(staffEmail)) return false;
  return !session?.user.email || (!staff.includes(session.user.email.toLowerCase()) && !/(@example\.(com|org|net)$|^beta[-+.]|^test[-+.])/i.test(session.user.email));
}
export async function recordMeasurement(id: string, name: AnalyticsEventName, details: AnalyticsDetails = {}) {
  const data = sanitizeAnalyticsDetails(details), db = getD1();
  // One opaque event id prevents retries and confirmed purchases from counting twice.
  await db.prepare("INSERT OR IGNORE INTO task_measurements (id,name,day,step,result,count,duration_ms) VALUES (?,?,?,?,?,?,?)").bind(id, name, new Date().toISOString().slice(0,10), data.step ?? "", data.result ?? "", data.count ?? null, data.durationMs ?? null).run();
  await pruneMeasurementRecords(db);
}
export async function measureConfirmedPurchase(request: Request, sessionId: string, count: number, createdAt: string) {
  try {
    // Do not recount old orders after event retention has expired, or test checkouts.
    if (sessionId.startsWith("cs_test_") || Date.now() - Date.parse(createdAt) > 89 * 86400000) return;
    if (!await mayMeasure(request)) return;
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mcc-purchase:${sessionId}`));
    const key = Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
    await recordMeasurement(key, "purchase_completed", { count, result: "success" });
  } catch { /* Confirmation must work independently of measurement. */ }
}
