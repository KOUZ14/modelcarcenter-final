import { config } from "@/lib/config";
import { routeError } from "@/lib/http";
import { processShippoTrackingWebhook } from "@/lib/shipping";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supplied = new URL(request.url).searchParams.get("token") ?? "";
    if (
      !config.shippoWebhookSecret ||
      !(await secureEqual(supplied, config.shippoWebhookSecret))
    )
      return Response.json({ error: "Invalid webhook token." }, { status: 401 });
    const payload = await request.json();
    return Response.json({
      ok: true,
      ...(await processShippoTrackingWebhook(payload)),
    });
  } catch (error) {
    return routeError(error, "The Shippo event could not be processed.");
  }
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1)
    mismatch |= leftBytes[index] ^ rightBytes[index];
  return mismatch === 0;
}
