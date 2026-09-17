import { getCollectorAuth } from "@/lib/auth";
import { requireAdultConsent } from "@/lib/form-consent";
import { readJsonObject } from "@/lib/http";
import { routeError } from "@/lib/http";

export const dynamic = "force-dynamic";

async function handler(request: Request) {
  try {
    if (request.method === "POST" && new URL(request.url).pathname.replace(/\/$/, "") === "/api/auth/sign-in/magic-link") {
      const payload = await readJsonObject(request.clone());
      requireAdultConsent(payload.adultConsent);
    }
    return await getCollectorAuth().handler(request);
  } catch (error) {
    return routeError(error, "Collector authentication is temporarily unavailable.");
  }
}

export const GET = handler;
export const POST = handler;
