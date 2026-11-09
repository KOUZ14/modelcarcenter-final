import { getD1 } from "@/db";
import { mayMeasure } from "@/lib/measurement";
import { pruneMeasurementRecords } from "@/lib/measurement-retention";
import { TRAFFIC_COOKIE, trafficIdPattern, trafficPages, trafficSources } from "@/lib/traffic-rules";

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
    // Fresh consent is required for browser-level traffic measurement.
    if (!(request.headers.get("cookie") ?? "").split(";").some(part => part.trim() === `${TRAFFIC_COOKIE}=yes`) || !await mayMeasure(request)) return new Response(null, { status: 204 });
    const raw = await request.text();
    if (raw.length > 1024) return new Response(null, { status: 413 });
    let body;
    try { body = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.id !== "string" || !trafficIdPattern.test(body.id) ||
      typeof body.visitorId !== "string" || !trafficIdPattern.test(body.visitorId) ||
      typeof body.page !== "string" || !Object.hasOwn(trafficPages, body.page) ||
      typeof body.source !== "string" || !Object.hasOwn(trafficSources, body.source)) return new Response(null, { status: 400 });
    const db = getD1();
    await db.prepare("INSERT OR IGNORE INTO traffic_measurements (id, day, visitor_id, page, source) VALUES (?, ?, ?, ?, ?)")
      .bind(body.id, new Date().toISOString().slice(0, 10), body.visitorId, body.page, body.source).run();
    await pruneMeasurementRecords(db);
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 503 }); }
}
