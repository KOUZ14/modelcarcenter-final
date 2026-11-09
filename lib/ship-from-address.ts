import { ValidationError } from "./validation.ts";

export type ShipFromAddressSnapshot = {
  label: string;
  street1: string;
  street2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
  phone: string;
};

type SellerOrigin = {
  shippingOriginStreet1: string | null;
  shippingOriginStreet2: string | null;
  shippingOriginCity: string | null;
  shippingOriginRegion: string | null;
  shippingOriginPostalCode: string | null;
  shippingOriginCountry: string;
  shippingOriginPhone: string | null;
};

export function sellerOriginSnapshot(
  seller: SellerOrigin,
  label = "Primary ship-from",
): ShipFromAddressSnapshot {
  return {
    label,
    street1: seller.shippingOriginStreet1 ?? "",
    street2: seller.shippingOriginStreet2 ?? null,
    city: seller.shippingOriginCity ?? "",
    region: seller.shippingOriginRegion ?? null,
    postalCode: seller.shippingOriginPostalCode ?? "",
    country: seller.shippingOriginCountry,
    phone: seller.shippingOriginPhone ?? "",
  };
}

export function serializeShipFromAddress(address: ShipFromAddressSnapshot) {
  return JSON.stringify(address);
}

export function parseStoredShipFromAddress(
  value: string | null | undefined,
  fallback: SellerOrigin,
) {
  let parsed: Partial<ShipFromAddressSnapshot> = {};
  try {
    parsed = value ? (JSON.parse(value) as Partial<ShipFromAddressSnapshot>) : {};
  } catch {
    parsed = {};
  }
  const legacy = sellerOriginSnapshot(fallback);
  const address = {
    label: clean(parsed.label) || legacy.label,
    street1: clean(parsed.street1) || legacy.street1,
    street2: clean(parsed.street2) || legacy.street2,
    city: clean(parsed.city) || legacy.city,
    region: clean(parsed.region) || legacy.region,
    postalCode: clean(parsed.postalCode) || legacy.postalCode,
    country: (clean(parsed.country) || legacy.country).toUpperCase(),
    phone: clean(parsed.phone) || legacy.phone,
  };
  requireCompleteShipFromAddress(address);
  return address;
}

export function requireCompleteShipFromAddress(
  address: ShipFromAddressSnapshot,
) {
  if (
    !address.street1 ||
    !address.city ||
    !address.postalCode ||
    !address.country ||
    !address.phone ||
    (["US", "CA"].includes(address.country) && !address.region)
  ) {
    throw new ValidationError(
      "Complete the ship-from street, city, state, postal code, country, and phone first.",
    );
  }
}

export function shipFromAddressKey(address: ShipFromAddressSnapshot) {
  return [
    address.street1,
    address.street2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
    address.phone,
  ]
    .map((part) => clean(part).toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
