import { parseCheckoutShippingAddress, type NormalizedShippingAddress } from "./shipping-rules.ts";
import { ValidationError } from "./validation.ts";

// Tab-local draft only; quotes and payment sessions must always be revalidated.
export const CHECKOUT_ADDRESS_KEY = "mcc-delivery-address-v1";
export const CHECKOUT_SESSION_KEY = "mcc-checkout-reservation-v1";
export const EMPTY_CHECKOUT_ADDRESS: NormalizedShippingAddress = {
  name: "", street1: "", street2: "", city: "", state: "", zip: "", country: "US",
};

export function readCheckoutAddressDraft(value: string | null): NormalizedShippingAddress {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...EMPTY_CHECKOUT_ADDRESS };
    return Object.fromEntries(Object.entries(EMPTY_CHECKOUT_ADDRESS).map(([key, fallback]) => {
      const field = (parsed as Record<string, unknown>)[key];
      return [key, typeof field === "string" ? field.slice(0, 200) : fallback];
    })) as NormalizedShippingAddress;
  } catch {
    return { ...EMPTY_CHECKOUT_ADDRESS };
  }
}

export function checkoutAddressKey(address: NormalizedShippingAddress) {
  return JSON.stringify(Object.keys(EMPTY_CHECKOUT_ADDRESS).map((key) =>
    address[key as keyof NormalizedShippingAddress].trim().toUpperCase(),
  ));
}

export function validateCheckoutDestination(value: unknown, allowedCountries: string[]) {
  const address = parseCheckoutShippingAddress(value);
  const fields = Object.fromEntries(Object.entries(address).filter(([key, field]) =>
    field.length > (key === "zip" ? 20 : 200),
  ).map(([key]) => [key, "This address field is too long."]));
  if (Object.keys(fields).length) throw new ValidationError("Check the highlighted delivery address fields.", fields);
  if (!allowedCountries.includes(address.country)) {
    throw new ValidationError("Shipping is not available to this country. Choose a supported delivery address.");
  }
  return address;
}

export function stripeShippingAddress(address: NormalizedShippingAddress) {
  return {
    name: address.name,
    address: {
      line1: address.street1, line2: address.street2, city: address.city,
      state: address.state, postal_code: address.zip, country: address.country,
    },
  };
}
