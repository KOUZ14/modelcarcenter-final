import { getCollectorAuth } from "@/lib/auth";
import {
  subscribeToRestock,
  unsubscribeAvailabilityAlert,
} from "@/lib/availability";
import { readJsonObject, routeError } from "@/lib/http";
import { requiredString } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await readJsonObject(request);
    const session = await getCollectorAuth().api.getSession({
      headers: request.headers,
    });
    const result = await subscribeToRestock({
      productId: requiredString(payload.productId, "productId", 100),
      email: payload.email || session?.user?.email,
      userId: session?.user?.id ?? null,
    });
    return Response.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return routeError(error, "We couldn't save this restock alert.");
  }
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const removed = await unsubscribeAvailabilityAlert(token);
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Restock alerts</title><body style="margin:0;background:#ebe9e4;color:#111;font:16px/1.6 Arial,sans-serif"><main style="max-width:560px;margin:12vh auto;background:#fff;padding:48px"><p style="letter-spacing:.12em;text-transform:uppercase;font-size:11px">Model Car Center</p><h1>${removed ? "Restock alert removed" : "Alert not found"}</h1><p>${removed ? "You won't receive another restock email for this model unless you sign up again." : "This alert link has expired or was already removed."}</p><a href="${escapeAttribute(new URL("/marketplace", request.url).toString())}" style="color:#111">Return to the marketplace</a></main></body></html>`,
    { status: removed ? 200 : 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
