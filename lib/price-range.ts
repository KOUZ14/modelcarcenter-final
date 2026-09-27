import { moneyToCents, ValidationError } from "./validation.ts";

export function parsePriceRange({ minPrice = "", maxPrice = "" }: { minPrice?: string; maxPrice?: string }) {
  const minCents = minPrice.trim() ? moneyToCents(minPrice, "Minimum price") : null;
  const maxCents = maxPrice.trim() ? moneyToCents(maxPrice, "Maximum price") : null;
  if (minCents !== null && maxCents !== null && minCents > maxCents) {
    throw new ValidationError("Maximum price must be at least the minimum price.");
  }
  return { minCents, maxCents };
}
