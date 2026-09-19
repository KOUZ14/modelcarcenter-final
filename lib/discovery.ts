export type MarketplaceFilters = {
  q: string;
  scale: string;
  manufacturer: string;
  seller: string;
  condition: string;
  availability: string;
  sort: "newest" | "price_asc" | "price_desc";
  page: number;
};

type SearchValues = { get(name: string): string | null };
const filterNames = ["q", "scale", "manufacturer", "seller", "condition", "availability"] as const;

export function readMarketplaceFilters(params: SearchValues): MarketplaceFilters {
  const sort = params.get("sort");
  return {
    q: (params.get("q") || params.get("search") || "").trim().slice(0, 200),
    scale: params.get("scale") || "",
    manufacturer: params.get("manufacturer") || "",
    seller: params.get("seller") || "",
    condition: params.get("condition") || "",
    availability: params.get("availability") || "",
    sort: sort === "price_asc" || sort === "price_desc" ? sort : "newest",
    page: Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1),
  };
}

export function marketplaceHref(filters: Partial<MarketplaceFilters> = {}) {
  const params = new URLSearchParams();
  for (const key of filterNames) if (filters[key]) params.set(key, filters[key]!);
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return `/marketplace${params.size ? `?${params}` : ""}`;
}

export function modelHuntHref(filters: Partial<MarketplaceFilters> = {}) {
  return marketplaceHref(filters).replace("/marketplace", "/model-hunt");
}

// A missing facet must never replace the user's selection with "All".
export function selectedFilterOptions(options: Array<{ value: string; label: string }>, selected: string, label = selected) {
  return selected && !options.some(option => option.value === selected)
    ? [{ value: selected, label }, ...options]
    : options;
}

export function modelHuntPrefill(params: SearchValues) {
  const filters = readMarketplaceFilters(params);
  return {
    vehicleMake: params.get("make") || "",
    vehicleModel: params.get("model") || filters.q,
    preferredScale: filters.scale,
    modelManufacturer: filters.manufacturer,
    conditionPreference: filters.condition,
    notes: [
      filters.seller ? `Preferred seller: ${filters.seller}` : "",
      filters.availability === "in_stock" ? "Looking for an in-stock model." : "",
      filters.availability === "preorder" ? "Looking for an upcoming release." : "",
    ].filter(Boolean).join("\n"),
  };
}

export function stockCategories(featured: string[], counts: Record<string, number>) {
  return [...new Set([...featured, ...Object.keys(counts)])]
    .map(value => ({ value, count: counts[value] || 0 }))
    .sort((a, b) => b.count - a.count);
}

export function releaseWindowLabel(serialized: string | null | undefined) {
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    return parsed && typeof parsed === "object" && "label" in parsed && typeof parsed.label === "string" ? parsed.label : null;
  } catch { return null; }
}
