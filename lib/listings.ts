import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  productImages,
  products,
  sellerAddresses,
  sellers,
} from "@/db/schema";
import { getOwnedProduct, type VerifiedCollectorUser } from "./collector-store";
import {
  createAccountOnboardingLink,
  createConnectedAccount,
  retrieveStripeAccount,
} from "./stripe";
import {
  assertCollectibleListingReady,
  cleanText,
  makeSlug,
  parseCollectorListing,
  ValidationError,
} from "./validation";
import { isCurrentPolicyVersion } from "./legal";

type CollectorProfile = { displayName: string; bio: string };

export async function getOrCreateCollectorSeller(
  user: VerifiedCollectorUser,
  profile: CollectorProfile,
) {
  const db = getDb();
  const existing = await db
    .select()
    .from(sellers)
    .where(eq(sellers.ownerUserId, user.id))
    .limit(1);
  if (existing[0]) {
    if (existing[0].sellerType !== "collector")
      throw new ValidationError(
        "This account is already linked to a managed seller.",
      );
    return existing[0];
  }
  const id = crypto.randomUUID();
  const storeName = profile.displayName;
  const seller = {
    id,
    slug: `${makeSlug(storeName)}-${id.slice(0, 6)}`,
    storeName,
    contactName: profile.displayName,
    contactEmail: user.email,
    description: profile.bio,
    sellerType: "collector" as const,
    ownerUserId: user.id,
    status: "approved" as const,
    defaultShippingCents: 0,
    shippingMode: "calculated" as const,
    shippingOriginCountry: "US",
    shippingOriginRegion: null,
    shippingOriginStreet1: null,
    shippingOriginStreet2: null,
    shippingOriginCity: null,
    shippingOriginPostalCode: null,
    shippingOriginPhone: null,
    defaultPackageLength: "12",
    defaultPackageWidth: "9",
    defaultPackageHeight: "6",
    defaultPackageWeight: "2",
    shippingPolicySummary: "Ships directly from this collector seller.",
    returnPolicySummary: "Contact Model Car Center before returning an order.",
    stripeAccountId: null,
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
  };
  await db.insert(sellers).values(seller);
  return seller;
}

export async function saveCollectorListing(input: {
  user: VerifiedCollectorUser;
  profile: CollectorProfile;
  payload: Record<string, unknown>;
  productId?: string | null;
}) {
  const values = parseCollectorListing(input.payload);
  const seller = await getOrCreateCollectorSeller(input.user, input.profile);
  const db = getDb();
  const shipFromAddress = await resolveShipFromAddress(seller.id, values);
  await updateCollectorSellerPreferences(seller.id, values);
  if (input.productId) {
    const owned = await getOwnedProduct(input.user.id, input.productId);
    if (!owned) throw new ValidationError("Listing not found.");
    if (values.inventoryQuantity < owned.product.reservedQuantity) {
      throw new ValidationError(
        `Quantity cannot be below ${owned.product.reservedQuantity} reserved item(s).`,
      );
    }
    const nextStatus =
      owned.product.status === "active" ? "pending_review" : "draft";
    await db
      .update(products)
      .set({
        ...listingProductValues(values),
        shipFromAddressId: shipFromAddress.id,
        status: nextStatus,
        rejectionReason: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(eq(products.id, input.productId), eq(products.sellerId, seller.id)),
      );
    return {
      productId: input.productId,
      status: nextStatus,
      shipFromAddress,
    };
  }
  const id = crypto.randomUUID();
  const slug = `${makeSlug(values.title)}-${id.slice(0, 8)}`;
  await db.insert(products).values({
    id,
    sellerId: seller.id,
    slug,
    sellerSku: `COL-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    shipFromAddressId: shipFromAddress.id,
    ...listingProductValues(values),
    currency: "usd",
    status: "draft",
  });
  return { productId: id, status: "draft" as const, shipFromAddress };
}

async function updateCollectorSellerPreferences(
  sellerId: string,
  values: ReturnType<typeof parseCollectorListing>,
) {
  await getDb()
    .update(sellers)
    .set({
      storeName: values.sellerDisplayName,
      description: values.sellerDescription,
      shippingMode: "calculated",
      ...(values.rememberPackageDefaults
        ? {
            defaultPackageLength: values.packageLength,
            defaultPackageWidth: values.packageWidth,
            defaultPackageHeight: values.packageHeight,
            defaultPackageWeight: values.packageWeight,
          }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sellers.id, sellerId));
}

async function resolveShipFromAddress(
  sellerId: string,
  values: ReturnType<typeof parseCollectorListing>,
) {
  const db = getDb();
  if (values.shipFromAddressId) {
    const selected = await db
      .select()
      .from(sellerAddresses)
      .where(
        and(
          eq(sellerAddresses.id, values.shipFromAddressId),
          eq(sellerAddresses.sellerId, sellerId),
        ),
      )
      .limit(1);
    if (!selected[0]) {
      throw new ValidationError("Choose one of your saved ship-from addresses.");
    }
    return selected[0];
  }

  const existing = await db
    .select()
    .from(sellerAddresses)
    .where(eq(sellerAddresses.sellerId, sellerId));
  const matching = existing.find(
    (address) =>
      normalizedAddressPart(address.street1) ===
        normalizedAddressPart(values.shippingOriginStreet1) &&
      normalizedAddressPart(address.street2) ===
        normalizedAddressPart(values.shippingOriginStreet2) &&
      normalizedAddressPart(address.city) ===
        normalizedAddressPart(values.shippingOriginCity) &&
      normalizedAddressPart(address.region) ===
        normalizedAddressPart(values.shippingOriginRegion) &&
      normalizedAddressPart(address.postalCode) ===
        normalizedAddressPart(values.shippingOriginPostalCode) &&
      normalizedAddressPart(address.country) ===
        normalizedAddressPart(values.shippingOriginCountry) &&
      normalizedAddressPart(address.phone) ===
        normalizedAddressPart(values.shippingOriginPhone),
  );
  if (matching) return matching;

  const address = {
    id: crypto.randomUUID(),
    sellerId,
    label: values.shipFromAddressLabel,
    street1: values.shippingOriginStreet1,
    street2: values.shippingOriginStreet2,
    city: values.shippingOriginCity,
    region: values.shippingOriginRegion,
    postalCode: values.shippingOriginPostalCode,
    country: values.shippingOriginCountry,
    phone: values.shippingOriginPhone,
    isDefault: existing.length === 0,
  };
  await db.insert(sellerAddresses).values(address);
  if (address.isDefault) {
    await db
      .update(sellers)
      .set({
        shippingOriginStreet1: address.street1,
        shippingOriginStreet2: address.street2,
        shippingOriginCity: address.city,
        shippingOriginRegion: address.region,
        shippingOriginPostalCode: address.postalCode,
        shippingOriginCountry: address.country,
        shippingOriginPhone: address.phone,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sellers.id, sellerId));
  }
  return address;
}

function normalizedAddressPart(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function listingProductValues(
  values: ReturnType<typeof parseCollectorListing>,
) {
  return {
    title: values.title,
    description: values.description,
    scale: values.scale,
    modelManufacturer: values.modelManufacturer,
    vehicleMake: values.vehicleMake,
    vehicleModel: values.vehicleModel,
    vehicleYear: values.vehicleYear,
    color: values.color,
    condition: values.condition,
    modelCondition: values.modelCondition,
    packagingCondition: values.packagingCondition,
    originalBoxStatus: values.originalBoxStatus,
    missingParts: values.missingParts,
    defects: values.defects,
    restorationCustomization: values.restorationCustomization,
    material: values.material,
    productNumber: values.productNumber,
    editionSerial: values.editionSerial,
    coaStatus: values.coaStatus,
    accessories: values.accessories,
    provenance: values.provenance,
    photoFrontChecked: values.photoFrontChecked,
    photoRearChecked: values.photoRearChecked,
    photoSidesChecked: values.photoSidesChecked,
    photoBaseChecked: values.photoBaseChecked,
    photoPackagingChecked: values.photoPackagingChecked,
    photoIssuesChecked: values.photoIssuesChecked,
    priceCents: values.priceCents,
    packageLength: values.packageLength,
    packageWidth: values.packageWidth,
    packageHeight: values.packageHeight,
    packageWeight: values.packageWeight,
    inventoryQuantity: values.inventoryQuantity,
    keywords:
      `${values.vehicleMake} ${values.vehicleModel} ${values.modelManufacturer} ${values.scale} ${values.color ?? ""}`.trim(),
  };
}

export async function submitCollectorListing(
  userId: string,
  productId: string,
  sellerTermsVersion: string,
) {
  if (!isCurrentPolicyVersion(sellerTermsVersion)) {
    throw new ValidationError("Accept the current Seller Terms before submitting.");
  }
  const owned = await getOwnedProduct(userId, productId);
  if (!owned) throw new ValidationError("Listing not found.");
  if (owned.sellerStatus === "suspended")
    throw new ValidationError("This seller is suspended.");
  const sellerRows = await getDb()
    .select()
    .from(sellers)
    .where(eq(sellers.id, owned.product.sellerId))
    .limit(1);
  const seller = sellerRows[0];
  if (
    !seller?.stripeChargesEnabled ||
    !seller.stripePayoutsEnabled ||
    seller.status !== "active"
  ) {
    throw new ValidationError(
      "Complete Stripe payout onboarding before submitting this listing.",
    );
  }
  const imageCount = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  assertCollectibleListingReady(
    owned.product,
    Number(imageCount[0]?.count ?? 0),
  );
  await getDb()
    .update(sellers)
    .set({
      sellerTermsVersion,
      sellerTermsAcceptedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sellers.id, owned.product.sellerId));
  await getDb()
    .update(products)
    .set({
      status: "pending_review",
      rejectionReason: null,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(products.id, productId),
        eq(products.sellerId, owned.product.sellerId),
      ),
    );
  return { status: "pending_review" as const };
}

export async function startCollectorStripeOnboarding(
  user: VerifiedCollectorUser,
  profile: CollectorProfile,
  sellerTermsVersion: string,
) {
  if (!isCurrentPolicyVersion(sellerTermsVersion)) {
    throw new ValidationError("Accept the current Seller Terms before onboarding.");
  }
  const seller = await getOrCreateCollectorSeller(user, profile);
  if (seller.status === "suspended")
    throw new ValidationError("This seller is suspended.");
  await getDb()
    .update(sellers)
    .set({
      sellerTermsVersion,
      sellerTermsAcceptedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sellers.id, seller.id));
  let accountId = seller.stripeAccountId;
  if (!accountId) {
    const account = await createConnectedAccount({
      sellerId: seller.id,
      email: user.email,
      storeName: seller.storeName,
    });
    accountId = account.id;
    await getDb()
      .update(sellers)
      .set({
        stripeAccountId: accountId,
        status: "onboarding",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sellers.id, seller.id));
  }
  const link = await createAccountOnboardingLink(
    accountId,
    "/account?view=listings&stripe=returned",
    "/account?view=listings&stripe=refresh",
  );
  return { onboardingUrl: link.url };
}

export async function refreshCollectorStripe(userId: string) {
  const rows = await getDb()
    .select()
    .from(sellers)
    .where(eq(sellers.ownerUserId, userId))
    .limit(1);
  const seller = rows[0];
  if (!seller?.stripeAccountId)
    throw new ValidationError("Stripe onboarding has not started.");
  const account = await retrieveStripeAccount(seller.stripeAccountId);
  const ready = account.charges_enabled && account.payouts_enabled;
  const status =
    seller.status === "suspended"
      ? "suspended"
      : ready
        ? "active"
        : "onboarding";
  await getDb()
    .update(sellers)
    .set({
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(sellers.id, seller.id));
  return {
    status,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  };
}

export async function deactivateCollectorListing(
  userId: string,
  productId: string,
) {
  const owned = await getOwnedProduct(userId, productId);
  if (!owned) throw new ValidationError("Listing not found.");
  await getDb()
    .update(products)
    .set({ status: "inactive", updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(products.id, productId),
        eq(products.sellerId, owned.product.sellerId),
      ),
    );
}

export function listingStatusLabel(status: string) {
  return (
    (
      {
        draft: "Draft",
        pending_review: "Awaiting Review",
        active: "Live",
        sold_out: "Sold",
        rejected: "Rejected",
        inactive: "Inactive",
      } as Record<string, string>
    )[status] ?? cleanText(status, 40)
  );
}
