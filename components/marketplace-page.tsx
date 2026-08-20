"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatCondition } from "@/lib/format";
import type { CatalogResponse } from "@/lib/types";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export type MarketplaceInitialState = {
  q: string;
  scale: string;
  manufacturer: string;
  seller: string;
  condition: string;
  sort: "newest" | "price_asc" | "price_desc";
  page: number;
};

const emptyCatalog: CatalogResponse = {
  products: [],
  pagination: { page: 1, pageSize: 24, total: 0, pages: 1 },
  filters: { scales: [], manufacturers: [], sellers: [], conditions: [] },
};

export function MarketplacePage({
  initial,
}: {
  initial: MarketplaceInitialState;
}) {
  const [query, setQuery] = useState(initial.q);
  const [activeQuery, setActiveQuery] = useState(initial.q);
  const [scale, setScale] = useState(initial.scale);
  const [manufacturer, setManufacturer] = useState(initial.manufacturer);
  const [seller, setSeller] = useState(initial.seller);
  const [condition, setCondition] = useState(initial.condition);
  const [sort, setSort] = useState(initial.sort);
  const [page, setPage] = useState(initial.page);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        q: activeQuery,
        scale,
        manufacturer,
        seller,
        condition,
        sort,
        page: String(page),
        pageSize: "24",
      });
      try {
        const response = await fetch(`/api/catalog?${params}`, { signal });
        const data = (await response.json()) as CatalogResponse & {
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Catalog unavailable.");
        setCatalog(data);
      } catch (reason) {
        if (signal.aborted) return;
        setCatalog(emptyCatalog);
        setError(
          reason instanceof Error ? reason.message : "Catalog unavailable.",
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [activeQuery, condition, manufacturer, page, scale, seller, sort],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeQuery) params.set("q", activeQuery);
    if (scale) params.set("scale", scale);
    if (manufacturer) params.set("manufacturer", manufacturer);
    if (seller) params.set("seller", seller);
    if (condition) params.set("condition", condition);
    if (sort !== "newest") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      `/marketplace${search ? `?${search}` : ""}`,
    );
  }, [activeQuery, condition, manufacturer, page, scale, seller, sort]);

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setActiveQuery(query.trim());
  }

  function clearFilters() {
    setQuery("");
    setActiveQuery("");
    setScale("");
    setManufacturer("");
    setSeller("");
    setCondition("");
    setSort("newest");
    setPage(1);
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    document
      .getElementById("marketplace-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const filtered = Boolean(
    activeQuery || scale || manufacturer || seller || condition,
  );

  return (
    <main className="marketplace-page">
      <SiteHeader />
      <section className="marketplace-hero">
        <div className="shell marketplace-hero-layout">
          <div>
            <p className="eyebrow light">The collector marketplace</p>
            <h1>Every live listing. One place.</h1>
            <p>
              Browse model cars from specialist stores and individual
              collectors, then narrow the shelf by the details that matter.
            </p>
          </div>
          <form className="marketplace-search" onSubmit={runSearch}>
            <label className="sr-only" htmlFor="marketplace-query">
              Search all marketplace listings
            </label>
            <Icon name="search" />
            <input
              id="marketplace-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Make, model, scale, manufacturer, or keyword"
            />
            <button type="submit">Search all listings</button>
          </form>
        </div>
      </section>

      <section className="marketplace-browser" id="marketplace-results">
        <div className="shell marketplace-layout">
          <aside className="marketplace-filters" id="filters">
            <div className="marketplace-filter-heading">
              <div>
                <p className="eyebrow">Refine the shelf</p>
                <h2>Filters</h2>
              </div>
              {filtered && (
                <button type="button" onClick={clearFilters}>
                  Clear all
                </button>
              )}
            </div>
            <label>
              Scale
              <select
                value={scale}
                onChange={(event) => {
                  setScale(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All scales</option>
                {catalog.filters.scales.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Manufacturer
              <select
                value={manufacturer}
                onChange={(event) => {
                  setManufacturer(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All makers</option>
                {catalog.filters.manufacturers.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seller
              <select
                value={seller}
                onChange={(event) => {
                  setSeller(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All sellers</option>
                {catalog.filters.sellers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model condition
              <select
                value={condition}
                onChange={(event) => {
                  setCondition(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any model condition</option>
                {catalog.filters.conditions.map((item) => (
                  <option key={item} value={item}>
                    {formatCondition(item)}
                  </option>
                ))}
              </select>
            </label>
          </aside>

          <div className="marketplace-results">
            <div className="marketplace-results-heading">
              <div>
                <p className="eyebrow">
                  {filtered ? "Your search" : "Available now"}
                </p>
                <h2>{filtered ? "Matching models" : "All listings"}</h2>
                {!loading && !error && (
                  <p className="marketplace-result-count" aria-live="polite">
                    {catalog.pagination.total} live listing
                    {catalog.pagination.total === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <label className="marketplace-sort">
                Sort by
                <select
                  value={sort}
                  onChange={(event) => {
                    setSort(
                      event.target.value as MarketplaceInitialState["sort"],
                    );
                    setPage(1);
                  }}
                >
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price low to high</option>
                  <option value="price_desc">Price high to low</option>
                </select>
              </label>
            </div>

            {loading ? (
              <div className="catalog-status" role="status">
                Searching current inventory…
              </div>
            ) : error ? (
              <div className="catalog-status error-state" role="alert">
                <h3>Inventory is unavailable</h3>
                <p>{error}</p>
                <button
                  className="button outline"
                  type="button"
                  onClick={() => {
                    const controller = new AbortController();
                    void load(controller.signal);
                  }}
                >
                  Try again
                </button>
              </div>
            ) : catalog.products.length ? (
              <>
                <div className="product-grid marketplace-product-grid">
                  {catalog.products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
                <div className="pagination" aria-label="Marketplace pages">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => changePage(page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {catalog.pagination.page} of {catalog.pagination.pages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= catalog.pagination.pages}
                    onClick={() => changePage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <div className="no-results marketplace-no-results">
                <p className="eyebrow">Nothing on the shelf yet</p>
                <h3>Try a broader search or start a Model Hunt.</h3>
                <p>
                  Clear a filter to see more listings, or tell us exactly what
                  you want and we&apos;ll watch for a match.
                </p>
                <div className="marketplace-empty-actions">
                  {filtered && (
                    <button
                      className="button outline"
                      type="button"
                      onClick={clearFilters}
                    >
                      Clear all filters
                    </button>
                  )}
                  <Link className="button dark" href="/#model-hunt">
                    Start a Model Hunt <Icon name="arrow" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
