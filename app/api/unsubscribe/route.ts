import { stopOptionalEmails } from "@/lib/email-preferences";
import { routeError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const queryToken = new URL(request.url).searchParams.get("token");
    const token = queryToken ?? String((await request.formData()).get("token") ?? "");
    if (!await stopOptionalEmails(token)) return new Response("This link is invalid. Use the link in your email or contact support@modelcarcenter.com to unsubscribe.", { status: 400, headers: { "Cache-Control": "no-store" } });
    // Mailbox-provider one-click requests use the query token and must not require a browser redirect.
    if (queryToken) return new Response("Unsubscribed", { headers: { "Cache-Control": "no-store" } });
    return new Response(null, { status: 303, headers: { Location: "/unsubscribe?done=1", "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error, "We couldn't update your email preferences. Please contact support."); }
}
