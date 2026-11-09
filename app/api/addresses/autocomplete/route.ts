import { lookupAddress } from "@/lib/address-autocomplete";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return Response.json({ unavailable: true }, { headers });
  try {
    const raw = await request.text();
    if (raw.length > 2000) return Response.json({ error: "Request too long." }, { status: 400, headers });
    const payload = JSON.parse(raw) as { query?: unknown; placeId?: unknown; sessionToken?: unknown } | null;
    if (!payload || typeof payload.sessionToken !== "string" || !/^[\w-]{1,36}$/.test(payload.sessionToken))
      return Response.json({ error: "Invalid search session." }, { status: 400, headers });
    const query = typeof payload.query === "string" ? payload.query.trim() : "";
    const placeId = typeof payload.placeId === "string" ? payload.placeId : "";
    if ((placeId && !/^[\w-]{1,255}$/.test(placeId)) || (!placeId && (query.length < 3 || query.length > 200)))
      return Response.json({ error: "Enter a street address." }, { status: 400, headers });
    return Response.json(await lookupAddress({ query, placeId, sessionToken: payload.sessionToken }, apiKey), { headers });
  } catch {
    return Response.json({ unavailable: true }, { headers });
  }
}
