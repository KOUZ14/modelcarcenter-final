import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { checkoutShippingQuotes } from "@/db/schema";
import type { loadAuthoritativeCart, ResolvedCheckoutShipping } from "./inventory";
import { config } from "./config";
import { createShippoEstimate, createShippoShipment, type ShippoRate } from "./shippo";
import {
  combinePackages,
  highValueShippingRules,
  parseCheckoutShippingAddress,
  parseEstimateZip,
  selectBuyerRates,
} from "./shipping-rules";
import { cleanText, ValidationError } from "./validation";
import { checkoutAddressKey, validateCheckoutDestination } from "./checkout-address";
import {
  requireCompleteShipFromAddress,
  sellerOriginSnapshot,
} from "./ship-from-address";

type AuthoritativeCart = Awaited<ReturnType<typeof loadAuthoritativeCart>>;

function shipmentDetails(cart: AuthoritativeCart) {
  if (cart.currency.toUpperCase() !== "USD")
    throw new ValidationError("Calculated shipping currently supports USD listings only.");
  const origin = sellerOriginSnapshot(cart.seller);
  requireCompleteShipFromAddress(origin);
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
  return {
    rules,
    shipment: {
      from: {
        name: cart.seller.contactName,
        company: cart.seller.sellerName,
        street1: origin.street1,
        street2: origin.street2 ?? undefined,
        city: origin.city,
        state: origin.region ?? "",
        zip: origin.postalCode,
        country: origin.country,
        phone: origin.phone,
        email: cart.seller.sellerEmail,
      },
      parcel,
      insuranceAmountCents: rules.insuranceRequired ? cart.totals.subtotalCents : 0,
      signatureRequired: rules.signatureRequired,
    },
  };
}

function buyerRates(rates: ShippoRate[]) {
  return selectBuyerRates(rates.filter((rate) =>
    rate.currency.toUpperCase() === "USD" &&
    rate.amountCents <= config.shippoMaxLabelCostCents,
  ));
}

export async function estimateProductShipping(cart: AuthoritativeCart, zipInput: unknown) {
  const zip = parseEstimateZip(zipInput);
  if (cart.shippingMode !== "calculated") {
    return {
      estimate: true as const,
      zip,
      requiresAddress: false,
      options: [{
        provider: "Seller",
        serviceLevel: cart.shippingMode === "free" ? "Free shipping" : "Flat-rate shipping per order",
        amountCents: cart.shippingMode === "free" ? 0 : cart.seller.shippingCents,
        currency: cart.currency,
      }],
    };
  }
  const { shipment } = shipmentDetails(cart);
  const result = await createShippoEstimate({
    ...shipment,
    to: { zip, country: "US" },
    metadata: `MCC estimate ${cart.seller.sellerId}`,
  });
  const rates = buyerRates(result.rates);
  // Estimates never create a checkout quote or expose purchasable rate IDs.
  return {
    estimate: true as const,
    zip,
    requiresAddress: rates.length === 0,
    options: rates.map(({ provider, serviceLevel, amountCents, currency }) => ({
      provider, serviceLevel, amountCents, currency,
    })),
  };
}

export function checkoutCartFingerprint(cart: AuthoritativeCart) {
  return JSON.stringify({
    sellerId: cart.seller.sellerId,
    currency: cart.currency.toUpperCase(),
    shippingMode: cart.shippingMode,
    origin: sellerOriginSnapshot(cart.seller),
    parcel: combinePackages(cart.items, {
      length: cart.seller.defaultPackageLength, width: cart.seller.defaultPackageWidth,
      height: cart.seller.defaultPackageHeight, weight: cart.seller.defaultPackageWeight,
    }),
    insuranceThresholdCents: config.shippoInsuranceThresholdCents,
    signatureThresholdCents: config.shippoSignatureThresholdCents,
    items: cart.items
      .map((item) => ({
        id: item.id,
        quantity: item.quantity,
        priceCents: item.priceCents,
        shipFromAddressId: item.shipFromAddressId,
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
  const destination = validateCheckoutDestination(destinationInput, config.shippingCountries);
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
  const { shipment, rules } = shipmentDetails(cart);
  const { parcel } = shipment;
  const result = await createShippoShipment({
    ...shipment,
    to: {
      ...destination,
      email: buyerEmail ?? "buyer@modelcarcenter.com",
    },
    metadata: `MCC checkout ${cart.seller.sellerId}`,
  });
  const rates = buyerRates(result.rates);
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
  destinationInput: unknown,
): Promise<ResolvedCheckoutShipping> {
  const destination = validateCheckoutDestination(destinationInput, config.shippingCountries);
  if (cart.shippingMode === "free")
    return resolvedSynthetic("free", 0, "Free shipping", destination);
  if (cart.shippingMode === "flat")
    return resolvedSynthetic(
      "flat",
      cart.seller.shippingCents,
      "Seller flat-rate shipping",
      destination,
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
  if (!(new Date(quote.expiresAt).getTime() > Date.now())) {
    await getDb()
      .update(checkoutShippingQuotes)
      .set({ status: "expired", updatedAt: new Date().toISOString() })
      .where(eq(checkoutShippingQuotes.id, quote.id));
    throw new ValidationError("That shipping quote expired. Calculate fresh rates.");
  }
  if (quote.cartFingerprint !== checkoutCartFingerprint(cart))
    throw new ValidationError("Your cart changed after rates were calculated. Calculate fresh rates.");
  if (checkoutAddressKey(parseCheckoutShippingAddress(JSON.parse(quote.destinationAddress))) !== checkoutAddressKey(destination))
    throw new ValidationError("Your delivery address changed. Calculate fresh shipping rates before checkout.");
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
    quotedAddress: JSON.stringify(destination),
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
  destination: ReturnType<typeof parseCheckoutShippingAddress>,
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
    quotedAddress: JSON.stringify(destination),
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
