import { getPublicOrderBySession } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return Response.json({ error: "Invalid session." }, { status: 400 });
  try {
    const order = await getPublicOrderBySession(sessionId);
    if (!order) return Response.json({ pending: true }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
    return Response.json({ order }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Order confirmation is temporarily unavailable." }, { status: 503 });
  }
}
