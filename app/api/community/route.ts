import { getDb } from "@/db";
import { communitySubscribers } from "@/db/schema";
import { readJsonObject, routeError } from "@/lib/http";
import { isEmail, normalizeEmail, rejectHoneypot, ValidationError } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const payload = await readJsonObject(request);
    rejectHoneypot(payload);
    const email = normalizeEmail(payload.email);
    if (!isEmail(email)) throw new ValidationError("Enter a valid email address.");
    await getDb()
      .insert(communitySubscribers)
      .values({ id: crypto.randomUUID(), email, consentTimestamp: new Date().toISOString() })
      .onConflictDoNothing({ target: communitySubscribers.email });
    return Response.json({ ok: true, message: "You're on the list." }, { status: 201 });
  } catch (error) {
    return routeError(error, "We couldn't save your signup. Please try again.");
  }
}
