export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
  ["AS", "American Samoa"], ["GU", "Guam"], ["MP", "Northern Mariana Islands"],
  ["PR", "Puerto Rico"], ["VI", "U.S. Virgin Islands"],
  ["AA", "Armed Forces Americas"], ["AE", "Armed Forces Europe"], ["AP", "Armed Forces Pacific"],
] as const;

export type Address = {
  street1: string; street2: string; city: string; state: string; zip: string;
  country: string; name: string; phone: string;
};
export type AddressField = keyof Address;
export type AddressSuggestion = { id: string; label: string };
export const SHIP_FROM_FIELD_NAMES = {
  street1: "shippingOriginStreet1", street2: "shippingOriginStreet2",
  city: "shippingOriginCity", state: "shippingOriginRegion", zip: "shippingOriginPostalCode",
  country: "shippingOriginCountry", phone: "shippingOriginPhone", name: "name",
};

export function normalizeState(value: string) {
  return US_STATES.find(([code, label]) =>
    code === value.trim().toUpperCase() || label.toLowerCase() === value.trim().toLowerCase(),
  )?.[0] ?? value.trim();
}

export function countryName(code: string) {
  if (code.toUpperCase() === "US") return "United States";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code; }
  catch { return code; }
}

export function addressFieldError(field: AddressField, value: string, country = "US") {
  const labels: Record<AddressField, string> = {
    name: "your full name", street1: "a street address", street2: "", city: "a city",
    state: "a state", zip: "a ZIP code", country: "a country", phone: "a carrier contact phone number",
  };
  if (field === "street2") return "";
  if (field === "state" && !["US", "CA"].includes(country)) return "";
  if (!value.trim()) return field === "state" ? "Choose a state." : `Enter ${labels[field]}.`;
  if (country === "US" && field === "state" && !US_STATES.some(([code]) => code === normalizeState(value)))
    return "Choose a valid state.";
  if (country === "US" && field === "zip" && !/^\d{5}(-\d{4})?$/.test(value.trim()))
    return "Enter a 5-digit ZIP code, or ZIP+4 (12345-6789).";
  return "";
}

export function addressErrors(address: Partial<Address>, include: { name?: boolean; phone?: boolean } = {}) {
  const fields: AddressField[] = ["street1", "city", "state", "zip", "country"];
  if (include.name) fields.push("name");
  if (include.phone) fields.push("phone");
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const error = addressFieldError(field, address[field] ?? "", address.country);
    if (error) errors[field] = error;
  }
  return errors;
}

export function shipFromAddressValues(source: Record<string, unknown> | null): Address {
  return Object.fromEntries(Object.entries(SHIP_FROM_FIELD_NAMES).map(([field, name]) =>
    [field, String(source?.[name] ?? (field === "country" ? "US" : ""))],
  )) as Address;
}
