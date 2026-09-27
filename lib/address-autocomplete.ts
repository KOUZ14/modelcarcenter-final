import type { AddressSuggestion } from "./address.ts";

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };
type PlaceDetails = { addressComponents?: AddressComponent[] };

export function parsePlaceAddress(place: PlaceDetails) {
  const part = (type: string, short = false) => {
    const component = place.addressComponents?.find((item) => item.types?.includes(type));
    return (short ? component?.shortText : component?.longText) ?? "";
  };
  const country = part("country", true);
  // A suggestion is a convenience, never proof that an address is deliverable.
  if (country !== "US") return null;
  const zip = part("postal_code");
  const suffix = part("postal_code_suffix");
  return {
    street1: [part("street_number"), part("route")].filter(Boolean).join(" "),
    street2: part("subpremise"),
    city: part("locality") || part("postal_town") || part("sublocality_level_1"),
    state: part("administrative_area_level_1", true),
    zip: zip && suffix ? `${zip}-${suffix}` : zip,
    country,
  };
}

export async function lookupAddress(
  payload: { query?: string; placeId?: string; sessionToken: string },
  apiKey: string,
  request: typeof fetch = fetch,
) {
  const headers = { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey };
  if (payload.placeId) {
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(payload.placeId)}`);
    url.searchParams.set("sessionToken", payload.sessionToken);
    url.searchParams.set("languageCode", "en");
    const response = await request(url, {
      headers: { ...headers, "X-Goog-FieldMask": "addressComponents" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("Address lookup unavailable.");
    const address = parsePlaceAddress(await response.json() as PlaceDetails);
    if (!address) throw new Error("Choose a United States address or enter it manually.");
    return { address };
  }
  const response = await request("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST", headers: { ...headers, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text" },
    body: JSON.stringify({ input: payload.query, sessionToken: payload.sessionToken, includedRegionCodes: ["us"], languageCode: "en", regionCode: "us" }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("Address lookup unavailable.");
  const body = await response.json() as {
    suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
  };
  const suggestions: AddressSuggestion[] = (body.suggestions ?? []).flatMap(({ placePrediction: prediction }) =>
    prediction?.placeId && prediction.text?.text ? [{ id: prediction.placeId, label: prediction.text.text }] : [],
  ).slice(0, 5);
  return { suggestions };
}
