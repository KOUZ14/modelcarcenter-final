import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { checkoutShippingQuotes } from "@/db/schema";
import type { loadAuthoritativeCart, ResolvedCheckoutShipping } from "./inventory";
import { config } from "./config";
import { createShippoShipment, type ShippoRate } from "./shippo";
import {
  combinePackages,
  highValueShippingRules,
  parseCheckoutShippingAddress,
  selectBuyerRates,
} from "./shipping-rules";
import { cleanText, ValidationError } from "./validation";

type AuthoritativeCart = Awaited<ReturnType<typeof loadAuthoritativeCart>>;

export function checkoutCartFingerprint(cart: AuthoritativeCart) {
  return JSON.stringify({
    sellerId: cart.seller.sellerId,
    currency: cart.currency.toUpperCase(),
    items: cart.items
      .map((item) => ({
        id: item.id,
        quantity: item.quantity,
        priceCents: item.priceCents,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
}

export async function quoteCheckoutShipping(
  cart: AuthoritativeCart,
  destinationInput: unknown,
  buyerUserId: string | null,
  buyerEmail: string | null,
) {
  if (cart.shippingMode === "free") {
    return {
      mode: "free" as const,
      quoteId: null,
      expiresAt: null,
      options: [syntheticRate("free", "Free shipping", 0)],
    };
  }
  if (cart.shippingMode === "flat") {
    return {
      mode: "flat" as const,
      quoteId: null,
      expiresAt: null,
      options: [
        syntheticRate(
          "flat",
          "Seller flat-rate shipping",
          cart.seller.shippingCents,
        ),
      ],
    };
  }
  if (cart.currency.toUpperCase() !== "USD")
    throw new ValidationError("Calculated shipping currently supports USD listings only.");
  const destination = parseCheckoutShippingAddress(destinationInput);
  requireCompleteOrigin(cart.seller);
  const parcel = combinePackages(cart.items, {
    length: cart.seller.defaultPackageLength,
    width: cart.seller.defaultPackageWidth,
    height: cart.seller.defaultPackageHeight,
    weight: cart.seller.defaultPackageWeight,
  });
  const rules = highValueShippingRules(
    cart.totals.subtotalCents,
    config.shippoInsuranceThresholdCents,
    config.shippoSignatureThresholdCents,
  );
  const result = await createShippoShipment({
    from: {
      name: cart.seller.contactName,
      company: cart.seller.sellerName,
      street1: cart.seller.shippingOriginStreet1!,
      street2: cart.seller.shippingOriginStreet2 ?? undefined,
      city: cart.seller.shippingOriginCity!,
      state: cart.seller.shippingOriginRegion ?? "",
      zip: cart.seller.shippingOriginPostalCode!,
      country: cart.seller.shippingOriginCountry,
      phone: cart.seller.shippingOriginPhone!,
      email: cart.seller.sellerEmail,
    },
    to: {
      ...destination,
      email: buyerEmail ?? "buyer@modelcarcenter.com",
    },
    parcel,
    metadata: `MCC checkout ${cart.seller.sellerId}`,
    insuranceAmountCents: rules.insuranceRequired
      ? cart.totals.subtotalCents
      : 0,
    signatureRequired: rules.signatureRequired,
  });
  const rates = selectBuyerRates(
    result.rates.filter(
      (rate) =>
        rate.currency.toUpperCase() === "USD" &&
        rate.amountCents <= config.shippoMaxLabelCostCents,
    ),
  );
  if (!rates.length)
    throw new ValidationError("No checkout shipping options are available for this address.");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + config.shippoQuoteExpirationMinutes * 60_000,
  ).toISOString();
  const quoteId = crypto.randomUUID();
  await getDb().insert(checkoutShippingQuotes).values({
    id: quoteId,
    sellerId: cart.seller.sellerId,
    buyerUserId,
    shippoShipmentId: result.shippoShipmentId,
    cartFingerprint: checkoutCartFingerprint(cart),
    destinationAddress: JSON.stringify(destination),
    rates: JSON.stringify(rates),
    parcelLength: parcel.length,
    parcelWidth: parcel.width,
    parcelHeight: parcel.height,
    parcelWeight: parcel.weight,
    declaredValueCents: cart.totals.subtotalCents,
    expiresAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  return {
    mode: "calculated" as const,
    quoteId,
    expiresAt,
    insuranceRequired: rules.insuranceRequired,
    signatureRequired: rules.signatureRequired,
    options: rates,
  };
}

export async function resolveCheckoutShipping(
  cart: AuthoritativeCart,
  selectionInput: unknown,
  buyerUserId: string | null,
): Promise<ResolvedCheckoutShipping> {
  if (cart.shippingMode === "free")
    return resolvedSynthetic("free", 0, "Free shipping");
  if (cart.shippingMode === "flat")
    return resolvedSynthetic(
      "flat",
      cart.seller.shippingCents,
      "Seller flat-rate shipping",
    );
  if (!selectionInput || typeof selectionInput !== "object" || Array.isArray(selectionInput))
    throw new ValidationError("Calculate shipping and choose a carrier service before checkout.");
  const selection = selectionInput as Record<string, unknown>;
  const quoteId = cleanText(selection.quoteId, 100);
  const rateId = cleanText(selection.rateId, 100);
  if (!quoteId || !rateId)
    throw new ValidationError("Calculate shipping and choose a carrier service before checkout.");
  const rows = await getDb()
    .select()
    .from(checkoutShippingQuotes)
    .where(
      and(
        eq(checkoutShippingQuotes.id, quoteId),
        eq(checkoutShippingQuotes.sellerId, cart.seller.sellerId),
      ),
    )
    .limit(1);
  const quote = rows[0];
  if (!quote || quote.status !== "active")
    throw new ValidationError("That shipping quote is no longer available. Calculate fresh rates.");
  if (quote.buyerUserId && quote.buyerUserId !== buyerUserId)
    throw new ValidationError("That shipping quote belongs to another buyer.");
  if (new Date(quote.expiresAt).getTime() <= Date.now()) {
    await getDb()
      .update(checkoutShippingQuotes)
      .set({ status: "expired", updatedAt: new Date().toISOString() })
      .where(eq(checkoutShippingQuotes.id, quote.id));
    throw new ValidationError("That shipping quote expired. Calculate fresh rates.");
  }
  if (quote.cartFingerprint !== checkoutCartFingerprint(cart))
    throw new ValidationError("Your cart changed after rates were calculated. Calculate fresh rates.");
  const rate = parseRates(quote.rates).find((candidate) => candidate.id === rateId);
  if (!rate)
    throw new ValidationError("Choose one of the carrier services quoted for this cart.");
  return {
    mode: "calculated",
    amountCents: rate.amountCents,
    checkoutShippingQuoteId: quote.id,
    rateId: rate.id,
    carrier: rate.provider,
    service: rate.serviceLevel,
    serviceToken: rate.serviceToken || null,
    estimatedDays: rate.estimatedDays,
    quotedAddress: quote.destinationAddress,
  };
}

function syntheticRate(id: string, serviceLevel: string, amountCents: number): ShippoRate {
  return {
    id,
    provider: "Seller",
    serviceLevel,
    serviceToken: id,
    amountCents,
    currency: "USD",
    estimatedDays: null,
    durationTerms: "",
    arrivesBy: null,
  };
}

function resolvedSynthetic(
  mode: "flat" | "free",
  amountCents: number,
  service: string,
): ResolvedCheckoutShipping {
  return {
    mode,
    amountCents,
    checkoutShippingQuoteId: null,
    rateId: mode,
    carrier: null,
    service,
    serviceToken: null,
    estimatedDays: null,
    quotedAddress: null,
  };
}

function parseRates(value: string) {
  try {
    const rates = JSON.parse(value) as ShippoRate[];
    if (!Array.isArray(rates)) throw new Error("invalid");
    return rates;
  } catch {
    throw new ValidationError("The stored shipping quote is invalid. Calculate fresh rates.");
  }
}

function requireCompleteOrigin(seller: AuthoritativeCart["seller"]) {
  if (
    !seller.shippingOriginStreet1 ||
    !seller.shippingOriginCity ||
    !seller.shippingOriginPostalCode ||
    !seller.shippingOriginPhone ||
    !seller.shippingOriginCountry ||
    (["US", "CA"].includes(seller.shippingOriginCountry) &&
      !seller.shippingOriginRegion)
  )
    throw new ValidationError(
      "This seller must complete their ship-from address before calculated shipping is available.",
    );
}
