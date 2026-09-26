import { and, eq } from "drizzle-orm";
import { sellerPublicProfileComplete } from "./seller-setup";
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
import { listingPayloadWithCatalog, persistCatalogListing, prepareListingCatalog } from "./catalog-products";
import { catalogListingSnapshot } from "./catalog-product-rules";

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
  const owned = input.productId ? await getOwnedProduct(input.user.id, input.productId) : null;
  if (input.productId && !owned) throw new ValidationError("Listing not found.");
  const catalog = await prepareListingCatalog(input.payload, input.user.id, owned?.product.catalogProductId);
  const values = parseCollectorListing(listingPayloadWithCatalog(input.payload, catalog.model));
  const seller = await getOrCreateCollectorSeller(input.user, input.profile);
  if (seller.status === "suspended") throw new ValidationError("This seller is suspended.");
  const db = getDb();
  const shipFromAddress = await resolveShipFromAddress(seller.id, values);
  await updateCollectorSellerPreferences(seller.id, values);
  if (input.productId) {
    if (!owned) throw new ValidationError("Listing not found.");
    if (values.inventoryQuantity < owned.product.reservedQuantity) {
      throw new ValidationError(
        `Quantity cannot be below ${owned.product.reservedQuantity} reserved item(s).`,
        { quantity: `Enter at least ${owned.product.reservedQuantity} to cover reserved items.` },
      );
    }
    const nextStatus =
      owned.product.status === "active" ? "pending_review" : "draft";
    const model = await persistCatalogListing(catalog, (model) => db
      .update(products)
      .set({
        ...listingProductValues(values),
        ...catalogListingSnapshot(model),
        sellerSku: cleanText(input.payload.sellerSku, 100) || owned.product.sellerSku,
        conditionNotes: cleanText(input.payload.conditionNotes, 2000),
        shipFromAddressId: shipFromAddress.id,
        status: nextStatus,
        rejectionReason: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(eq(products.id, input.productId!), eq(products.sellerId, seller.id)),
      ).toSQL());
    return {
      productId: input.productId,
      catalogProductId: model.id,
      status: nextStatus,
      shipFromAddress,
    };
  }
  const id = crypto.randomUUID();
  const slug = `${makeSlug(values.title)}-${id.slice(0, 8)}`;
  const model = await persistCatalogListing(catalog, (model) => db.insert(products).values({
    id,
    sellerId: seller.id,
    slug,
    sellerSku: cleanText(input.payload.sellerSku, 100) || `COL-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    shipFromAddressId: shipFromAddress.id,
    ...listingProductValues(values),
    ...catalogListingSnapshot(model),
    conditionNotes: cleanText(input.payload.conditionNotes, 2000),
    currency: "usd",
    status: "draft",
  }).toSQL());
  return { productId: id, catalogProductId: model.id, status: "draft" as const, shipFromAddress };
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
      specialty: values.sellerSpecialty,
      packingApproach: values.sellerPackingApproach,
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
      throw new ValidationError("Choose one of your saved ship-from addresses.", { shipFromAddressId: "Choose a saved address or add a new one." });
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
      "Connect your bank account to receive payments before submitting this listing.",
    );
  }
  if (!sellerPublicProfileComplete(seller)) {
    const fields: Record<string, string> = {};
    if (seller.description.trim().length < 30) fields.sellerDescription = "Introduce yourself to buyers in at least 30 characters.";
    if (!seller.specialty?.trim()) fields.sellerSpecialty = "Describe the scales, makers, or themes you collect.";
    if ((seller.packingApproach?.trim().length ?? 0) < 20) fields.sellerPackingApproach = "Describe how you protect models for shipping in at least 20 characters.";
    if (!seller.shippingOriginCountry.trim() || !seller.shippingOriginRegion?.trim()) fields.shipFromAddressId = "Add a ship-from address with your country and state or region.";
    throw new ValidationError("Complete the highlighted seller details before review. Your draft is saved.", fields);
  }
  const evidenceImages = await getDb()
    .select({ alt: productImages.alt, url: productImages.url })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  assertCollectibleListingReady(
    owned.product,
    evidenceImages,
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
  listing?: {
    productId: string;
    collectionItem?: string;
    selling?: string;
    minimum?: string;
  },
) {
  if (!isCurrentPolicyVersion(sellerTermsVersion)) {
    throw new ValidationError("Accept the current Seller Terms before connecting your payment method.");
  }
  if (listing && !await getOwnedProduct(user.id, listing.productId)) {
    throw new ValidationError("Listing not found.");
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
  const query = new URLSearchParams(listing ? { id: listing.productId } : { view: "listings" });
  if (listing?.collectionItem) {
    query.set("collectionItem", listing.collectionItem);
    query.set("selling", listing.selling === "open_to_offers" ? "open_to_offers" : "for_sale");
    query.set("minimum", String(Math.max(0, Number(listing.minimum) || 0)));
  }
  const destination = listing ? "/sell/model" : "/account";
  const anchor = listing ? "#listing-review" : "";
  const link = await createAccountOnboardingLink(accountId,
    `${destination}?${query}&stripe=returned${anchor}`,
    `${destination}?${query}&stripe=refresh${anchor}`,
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
    throw new ValidationError("Your payment method is not connected yet.");
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
