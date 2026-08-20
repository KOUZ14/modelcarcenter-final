import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { collectorProfiles, user as authUsers } from "@/db/schema";
import { requireCollectorApi } from "@/lib/collector-auth";
import {
  deleteCollectorAccount,
  getAccountCart,
  getWishlistIds,
  mergeGuestData,
  saveAccountCart,
  setWishlistItem,
} from "@/lib/collector-store";
import { readJsonObject, routeError } from "@/lib/http";
import { cleanText, optionalHttpUrl, requiredString, ValidationError } from "@/lib/validation";
import { deactivateCollectorListing } from "@/lib/listings";
import { shipOwnedStoreOrder } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) {
    return Response.json({ authenticated: false }, { status: 200 });
  }
  try {
    const [wishlist, cart] = await Promise.all([
      getWishlistIds(collector.user.id),
      getAccountCart(collector.user.id),
    ]);
    return Response.json({
      authenticated: true,
      user: collector.user,
      profile: collector.profile,
      store:
        collector.seller?.sellerType === "professional"
          ? {
              id: collector.seller.id,
              name: collector.seller.storeName,
              status: collector.seller.status,
            }
          : null,
      wishlist,
      cart,
    });
  } catch (error) {
    return routeError(error, "Your saved marketplace data is temporarily unavailable.");
  }
}

export async function POST(request: Request) {
  const collector = await requireCollectorApi(request);
  if (collector instanceof Response) return collector;
  try {
    const payload = await readJsonObject(request);
    const action = requiredString(payload.action, "action", 40);
    if (action === "wishlist") {
      const productId = requiredString(payload.productId, "productId", 100);
      await setWishlistItem(collector.user.id, productId, payload.saved === true);
      return Response.json({ ok: true, wishlist: await getWishlistIds(collector.user.id) });
    }
    if (action === "cart") {
      const items = parseCartItems(payload.items);
      return Response.json({ ok: true, cart: await saveAccountCart(collector.user.id, items) });
    }
    if (action === "merge") {
      const wishlist = Array.isArray(payload.wishlist)
        ? payload.wishlist.filter((item): item is string => typeof item === "string")
        : [];
      return Response.json(await mergeGuestData(collector.user.id, {
        wishlist,
        cart: parseCartItems(payload.cart),
      }));
    }
    if (action === "merge_choice") {
      const choice = requiredString(payload.choice, "choice", 20);
      if (choice === "replace") {
        return Response.json({ ok: true, cart: await saveAccountCart(collector.user.id, parseCartItems(payload.cart)) });
      }
      if (choice === "keep") return Response.json({ ok: true, cart: await getAccountCart(collector.user.id) });
      throw new ValidationError("Choose which cart to keep.");
    }
    if (action === "profile") {
      const displayName = requiredString(payload.displayName, "displayName", 100);
      const rawHandle = cleanText(payload.handle, 40).toLowerCase();
      const handle = rawHandle || null;
      if (handle && !/^[a-z0-9][a-z0-9_-]{2,39}$/.test(handle)) {
        throw new ValidationError("Handle must be 3–40 letters, numbers, underscores, or hyphens.");
      }
      const rawAvatar = cleanText(payload.avatarUrl, 1_500);
      const avatarUrl = rawAvatar ? optionalHttpUrl(rawAvatar) : null;
      if (rawAvatar && !avatarUrl) throw new ValidationError("Avatar must be an http or https URL.");
      const values = {
        displayName,
        handle,
        avatarUrl,
        bio: cleanText(payload.bio, 280),
        onboardingCompleted: true,
        updatedAt: new Date().toISOString(),
      };
      await getDb().update(collectorProfiles).set(values).where(eq(collectorProfiles.userId, collector.user.id));
      await getDb().update(authUsers).set({ name: displayName, image: avatarUrl, updatedAt: new Date() }).where(eq(authUsers.id, collector.user.id));
      return Response.json({ ok: true, profile: { ...collector.profile, ...values } });
    }
    if (action === "ship_sale") {
      return Response.json({ ok: true, ...await shipOwnedStoreOrder(collector.user.id, payload) });
    }
    if (action === "deactivate_listing") {
      await deactivateCollectorListing(collector.user.id, requiredString(payload.productId, "productId", 100));
      return Response.json({ ok: true });
    }
    if (action === "delete_account") {
      if (payload.confirm !== "DELETE") throw new ValidationError("Type DELETE to confirm account deletion.");
      if (collector.seller?.sellerType === "professional")
        throw new ValidationError(
          "Contact support to close or transfer a professional store account.",
        );
      await deleteCollectorAccount(collector.user.id);
      return Response.json({ ok: true, deleted: true });
    }
    throw new ValidationError("Unknown account action.");
  } catch (error) {
    return routeError(error, "The account change could not be saved.");
  }
}

function parseCartItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 25).map((entry) => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return { productId: String(item.productId ?? ""), quantity: Number(item.quantity) };
  });
}
