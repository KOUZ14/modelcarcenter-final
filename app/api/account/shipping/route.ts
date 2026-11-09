import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sellers } from "@/db/schema";
import { requireCollectorApi } from "@/lib/collector-auth";
import { config } from "@/lib/config";
import { readJsonObject, routeError } from "@/lib/http";
import { assertRequestOrigin, RequestSecurityError } from "@/lib/request-security";
import { integer } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let response: Response;
  try {
    assertRequestOrigin(request, config.siteUrl, process.env.NODE_ENV === "production");
    const collector = await requireCollectorApi(request);
    if (collector instanceof Response) response = collector;
    else {
      const payload = await readJsonObject(request);
      const value = payload.handlingTimeBusinessDays;
      const handlingTimeBusinessDays = integer(
        typeof value === "string" || typeof value === "number" ? value : undefined,
        "Handling time", 1, 10,
      );
      // Scope the update to the authenticated collector, never a submitted seller ID.
      // Existing checkout evidence and order deadlines retain their agreed terms.
      const [saved] = await getDb().update(sellers).set({
        handlingTimeBusinessDays, updatedAt: new Date().toISOString(),
      }).where(and(
        eq(sellers.ownerUserId, collector.user.id), eq(sellers.sellerType, "collector"),
      )).returning({ handlingTimeBusinessDays: sellers.handlingTimeBusinessDays });
      response = saved
        ? Response.json({ ok: true, ...saved })
        : Response.json({ error: "A collector seller account is required. Save a collector listing first." }, { status: 403 });
    }
  } catch (error) {
    response = error instanceof RequestSecurityError
      ? Response.json({ error: "Invalid request origin." }, { status: error.status })
      : routeError(error, "Your shipping settings could not be saved. Please try again.");
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
