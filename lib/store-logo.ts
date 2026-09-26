import { optionalHttpUrl, ValidationError } from "./validation";

export function storeLogoUrl(value: string, storeId: string) {
  if (!value) return null;
  const prefix = `/media/store-logos/${encodeURIComponent(storeId)}/`;
  if (value.startsWith(prefix) && /^[a-f0-9-]+\.jpg$/.test(value.slice(prefix.length))) return value;
  const external = optionalHttpUrl(value);
  if (external) return external;
  throw new ValidationError("Choose a logo uploaded for this store.");
}
