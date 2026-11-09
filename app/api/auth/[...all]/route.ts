import { getCollectorAuth } from "@/lib/auth";
import { requireAdultConsent } from "@/lib/form-consent";
import { readJsonObject } from "@/lib/http";
import { routeError } from "@/lib/http";
import { cleanText, isEmail, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

async function handler(request: Request) {
  try {
    if (request.method === "POST" && new URL(request.url).pathname.replace(/\/$/, "") === "/api/auth/sign-in/magic-link") {
      const payload = await readJsonObject(request.clone());
      requireAdultConsent(payload.adultConsent);
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      if (email.length > 254 || !isEmail(email)) throw new ValidationError("Enter a valid email address.");
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      // Cloudflare cannot use Vinext's proxied request as constructor input.
      request = new Request(request.url, {
        method: request.method,
        headers,
        signal: request.signal,
        body: JSON.stringify({
          email,
          name: cleanText(payload.name, 120),
          callbackURL: payload.callbackURL,
          newUserCallbackURL: payload.newUserCallbackURL,
          errorCallbackURL: payload.errorCallbackURL,
        }),
      });
    }
    return await getCollectorAuth().handler(request);
  } catch (error) {
    return routeError(error, "Collector authentication is temporarily unavailable.");
  }
}

export const GET = handler;
export const POST = handler;
