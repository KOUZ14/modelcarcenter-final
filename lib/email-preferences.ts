import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { availabilityAlerts, communitySubscribers, wantedRequests } from "@/db/schema";
import { config } from "./config";
import { createUnsubscribeToken, verifyUnsubscribeToken, type UnsubscribeScope } from "./unsubscribe-token";

export async function unsubscribeUrl(scope: UnsubscribeScope, id: string) {
  const token = await createUnsubscribeToken(scope, id, config.betterAuthSecret);
  return `${config.siteUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function stopOptionalEmails(token: string) {
  const subscription = await verifyUnsubscribeToken(token, config.betterAuthSecret);
  if (!subscription) return false;
  const db = getDb();
  let email: string | undefined;
  if (subscription.scope === "community") {
    email = (await db.select({ email: communitySubscribers.email }).from(communitySubscribers).where(eq(communitySubscribers.id, subscription.id)).limit(1))[0]?.email;
  } else if (subscription.scope === "hunt") {
    email = (await db.select({ email: wantedRequests.collectorEmail }).from(wantedRequests).where(eq(wantedRequests.referenceCode, subscription.id)).limit(1))[0]?.email;
  } else {
    email = (await db.select({ email: availabilityAlerts.email }).from(availabilityAlerts).where(eq(availabilityAlerts.unsubscribeToken, subscription.id)).limit(1))[0]?.email;
  }
  // A valid link for a removed record is already unsubscribed. Do not reveal addresses.
  if (!email) return true;
  await db.batch([
    db.delete(communitySubscribers).where(sql`lower(${communitySubscribers.email}) = lower(${email})`),
    db.update(wantedRequests).set({ status: "closed" }).where(sql`lower(${wantedRequests.collectorEmail}) = lower(${email})`),
    db.update(availabilityAlerts).set({ status: "unsubscribed", updatedAt: new Date().toISOString() }).where(sql`lower(${availabilityAlerts.email}) = lower(${email})`),
  ]);
  return true;
}
