import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCollectorAuth } from "./auth";
import {
  claimGuestDataForUser,
  ensureCollectorProfile,
} from "./collector-store";
import { safeReturnPath } from "./account-rules";

export async function getCurrentCollector(requestHeaders?: Headers) {
  const session = await getCollectorAuth().api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
  if (!session?.user?.id) return null;
  const user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    image: session.user.image,
  };
  const profile = await ensureCollectorProfile(user);
  await claimGuestDataForUser(user);
  return { session: session.session, user, profile };
}

export async function requireCollector(
  returnTo = "/account",
  requestHeaders?: Headers,
) {
  const collector = await getCurrentCollector(requestHeaders);
  if (!collector)
    redirect(
      `/sign-in?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`,
    );
  return collector;
}

export async function requireCollectorApi(request: Request) {
  const collector = await getCurrentCollector(request.headers);
  if (!collector)
    return Response.json({ error: "Sign in to continue." }, { status: 401 });
  return collector;
}

export async function requireSellerOwner(sellerId: string, request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  const { getDb } = await import("@/db");
  const { sellers } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select()
    .from(sellers)
    .where(
      and(eq(sellers.id, sellerId), eq(sellers.ownerUserId, collector.user.id)),
    )
    .limit(1);
  if (!rows[0])
    return Response.json(
      { error: "You do not have access to this seller." },
      { status: 403 },
    );
  return { collector, seller: rows[0] };
}

export async function requireProductOwner(productId: string, request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  const { getOwnedProduct } = await import("./collector-store");
  const product = await getOwnedProduct(collector.user.id, productId);
  if (!product)
    return Response.json(
      { error: "You do not have access to this listing." },
      { status: 403 },
    );
  return { collector, product };
}
