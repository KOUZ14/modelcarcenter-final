import { readJsonObject } from "@/lib/http";
import { analyticsEvents, type AnalyticsEventName } from "@/lib/analytics-rules";
import { mayMeasure, recordMeasurement } from "@/lib/measurement";
import { requireAdminApi } from "@/lib/admin-auth";
import { getD1 } from "@/db";

export async function GET() {
  const identity = await requireAdminApi();
  if (identity instanceof Response) return identity;
  const data = await getD1().prepare("SELECT day, name, step, result, COUNT(*) AS events, SUM(count) AS quantity, COUNT(duration_ms) AS timed_events, ROUND(AVG(duration_ms)) AS average_duration_ms FROM task_measurements WHERE day >= date('now','-90 days') GROUP BY day,name,step,result ORDER BY day DESC,name,step,result").all();
  return Response.json({ days: 90, measurements: data.results }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request) {
  try {
    if (!await mayMeasure(request)) return new Response(null, { status: 204 });
    const body = await readJsonObject(request);
    if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id) || !analyticsEvents.includes(body.name as AnalyticsEventName) || body.name === "purchase_completed") return Response.json({ error: "Invalid measurement." }, { status: 400 });
    await recordMeasurement(body.id, body.name as AnalyticsEventName, body.details as never);
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 503 }); }
}
