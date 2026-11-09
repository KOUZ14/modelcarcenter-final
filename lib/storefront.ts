export type StorefrontFilters = {
  q: string;
  scale: string;
  sort: "newest" | "price_asc" | "price_desc";
  page: number;
};

export function readStorefrontFilters(params: { get(name: string): string | null }): StorefrontFilters {
  const sort = params.get("sort");
  return {
    q: (params.get("q") || "").trim().slice(0, 200),
    scale: (params.get("scale") || "").trim().slice(0, 40),
    sort: sort === "price_asc" || sort === "price_desc" ? sort : "newest",
    page: Math.min(100000, Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1)),
  };
}

export function storefrontHref(slug: string, filters: Partial<StorefrontFilters> = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.scale) params.set("scale", filters.scale);
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return `/sellers/${encodeURIComponent(slug)}${params.size ? `?${params}` : ""}#seller-inventory`;
}

// Match whole placeholder values only; never remove words from a real profile.
export function publicProfileText(value: string | null | undefined, field: string) {
  const text = value?.trim() || "";
  const normalized = text.toLowerCase().replace(/[_\s-]+/g, " ");
  const label = field.toLowerCase().replace(/[_\s-]+/g, " ");
  return !text || normalized === label || ["n/a", "not provided", "not yet provided", "not specified", "placeholder", "todo"].includes(normalized) ? "" : text;
}

export function sellerBioExcerpt(value: string, limit = 150) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const end = cut.lastIndexOf(" ");
  return `${cut.slice(0, end > limit / 2 ? end : cut.length)}…`;
}

export function sellerSinceLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `Selling here since ${new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)}`;
}
