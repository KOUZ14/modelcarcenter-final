import { requireCollectorApi } from "@/lib/collector-auth";
import { readJsonObject, routeError } from "@/lib/http";
import { reportListing } from "@/lib/listing-reports";

export async function POST(request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  try {
    await reportListing(collector.user.id, await readJsonObject(request));
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeError(error, "Your report could not be sent.");
  }
}
