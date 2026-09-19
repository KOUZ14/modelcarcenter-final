"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { formatCondition } from "@/lib/format";
import { marketplaceHref, modelHuntHref, readMarketplaceFilters, selectedFilterOptions, type MarketplaceFilters } from "@/lib/discovery";
import { trackEvent } from "@/lib/analytics-client";
import type { CatalogResponse } from "@/lib/types";
import { Icon } from "./icons";
import { MarketplaceListings } from "./sponsored-listings";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { MobileSheet } from "./mobile-sheet";
import { SearchTabs } from "./search-tabs";
import "./discovery.css";

export type MarketplaceInitialState = MarketplaceFilters;

const emptyCatalog: CatalogResponse = {
  products: [],
  pagination: { page: 1, pageSize: 24, total: 0, pages: 1 },
  filters: { scales: [], manufacturers: [], sellers: [], conditions: [] },
};

export function MarketplacePage({
  initial,
  huntEmailEnabled = false,
}: {
  initial: MarketplaceInitialState;
  huntEmailEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The URL is the source of truth, including navigation to this page from the
  // header, refresh, and browser Back/Forward. Filter changes create history entries.
  const current = searchParams ? readMarketplaceFilters(searchParams) : initial;
  const { q: activeQuery, scale, manufacturer, seller, condition, availability, sort, page } = current;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState(activeQuery);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resultKey, setResultKey] = useState("");
  const requestKey = JSON.stringify([activeQuery, scale, manufacturer, seller, condition, availability, sort, page]);
  const lastMeasured = useRef("");
  function changeFilters(patch: Partial<MarketplaceFilters>) {
    router.push(marketplaceHref({ ...current, page: 1, ...patch }), { scroll: false });
  }

  useEffect(() => { queueMicrotask(() => setQuery(activeQuery)); }, [activeQuery]);

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
        availability,
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
        if (signal.aborted) return;
        setCatalog(data);
        setResultKey(requestKey);
        const measurementKey = params.toString();
        if (lastMeasured.current !== measurementKey) {
          lastMeasured.current = measurementKey;
          trackEvent("buyer_search", { count: data.pagination.total });
          if (data.pagination.total === 0) trackEvent("buyer_empty_results", { count: 0 });
        }
      } catch (reason) {
        if (signal.aborted) return;
        setCatalog(emptyCatalog);
        setResultKey(requestKey);
        setError(
          reason instanceof Error ? reason.message : "Catalog unavailable.",
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [activeQuery, condition, availability, manufacturer, page, scale, seller, sort, requestKey],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load]);

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    changeFilters({ q: query.trim() });
  }

  function clearFilters() {
    setQuery("");
    router.push("/marketplace", { scroll: false });
  }

  function changePage(nextPage: number) {
    changeFilters({ page: nextPage });
    document
      .getElementById("marketplace-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const filtered = Boolean(
    activeQuery || scale || manufacturer || seller || condition || availability,
  );
  const filterControls = [
    { key: "availability", label: "Availability", value: availability, placeholder: "All offers", options: [{ value: "in_stock", label: "In stock only" }, { value: "preorder", label: "Upcoming releases" }] },
    { key: "scale", label: "Scale", value: scale, placeholder: "All scales", options: catalog.filters.scales.map(value => ({ value, label: value })) },
    { key: "manufacturer", label: "Manufacturer", value: manufacturer, placeholder: "All makers", options: catalog.filters.manufacturers.map(value => ({ value, label: value })) },
    { key: "seller", label: "Seller", value: seller, placeholder: "All sellers", options: catalog.filters.sellers.map(item => ({ value: item.id, label: item.name })) },
    { key: "condition", label: "Model condition", value: condition, placeholder: "Any model condition", options: catalog.filters.conditions.map(value => ({ value, label: formatCondition(value) })) },
  ];
  const activeFilters = filterControls.filter(control => control.value);
  const filterFields = <div className="marketplace-filter-fields">{filterControls.map(control => <label key={control.label}>
    {control.label}<select value={control.value} onChange={event => changeFilters({ [control.key]: event.target.value })}>
      <option value="">{control.placeholder}</option>
      {selectedFilterOptions(control.options, control.value, formatCondition(control.value)).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>)}</div>;
  const promotionQuery = new URLSearchParams({ q: activeQuery, scale, manufacturer, seller, condition, availability, sort, page: String(page) }).toString();
  const pending = loading || resultKey !== requestKey;

  return (
    <main className="marketplace-page">
      <SiteHeader />
      <section id="main-content" tabIndex={-1} className="marketplace-hero" aria-labelledby="marketplace-title">
        <div className="shell marketplace-hero-layout">
          <div>
            <h1 id="marketplace-title">Shop</h1>
            <p>Browse model cars from stores and collectors.</p>
            <Link className="text-link" href="/sell">Sell on MCC →</Link>
          </div>
          <form
            className="marketplace-search"
            role="search"
            aria-label="Marketplace"
            onSubmit={runSearch}
          >
            <label htmlFor="marketplace-query">
              Search by make, model, scale, or manufacturer
            </label>
            <div className="marketplace-search-controls">
              <div className="marketplace-search-field">
                <Icon name="search" />
                <input
                  id="marketplace-query"
                  name="q"
                  type="search"
                  enterKeyHint="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. Porsche 911"
                />
              </div>
              <button type="submit">Search</button>
            </div>
          </form>
        </div>
      </section>

      <section className="marketplace-browser" id="marketplace-results">
        <div className="shell"><SearchTabs query={activeQuery} active="models" /></div>
        <div className="shell marketplace-layout">
          <aside className="marketplace-filters" id="filters" aria-label="Filter listings">
            <div className="marketplace-filter-heading"><h2>Filters</h2>{filtered && <button type="button" onClick={clearFilters}>Clear all</button>}</div>
            {filterFields}
          </aside>

          <div className="marketplace-results">
            <div className="marketplace-results-heading">
              <div>
                <h2>{filtered ? "Search results" : "All listings"}</h2>
                {!pending && !error && (
                  <p className="marketplace-result-count" aria-live="polite">
                    {catalog.pagination.total} live listing
                    {catalog.pagination.total === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <div className="marketplace-result-tools">
              <button className="mobile-filter-button" type="button" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-expanded={filtersOpen} aria-controls="mobile-filters">
                <Icon name="filters" /> Filters{activeFilters.length > 0 && <span className="filter-count">{activeFilters.length}</span>}
              </button>
              <label className="marketplace-sort">
                Sort by
                <select
                  value={sort}
                  onChange={(event) => changeFilters({ sort: event.target.value as MarketplaceInitialState["sort"] })}
                >
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price low to high</option>
                  <option value="price_desc">Price high to low</option>
                </select>
              </label>
              </div>
            </div>

            {filtered && <div className="active-filter-chips" aria-label="Active filters">
              {activeQuery && <button type="button" onClick={() => { setQuery(""); changeFilters({ q: "" }); }} aria-label={`Remove search: ${activeQuery}`}><span>Search: {activeQuery}</span><Icon name="close" /></button>}
              {activeFilters.map(control => <button key={control.label} type="button" onClick={() => changeFilters({ [control.key]: "" })} aria-label={`Remove ${control.label} filter`}><span>{control.label}: {control.options.find(option => option.value === control.value)?.label || formatCondition(control.value)}</span><Icon name="close" /></button>)}
              <button className="clear-filters" type="button" onClick={clearFilters}>Clear all</button>
            </div>}

            {pending ? (
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
                <MarketplaceListings key={promotionQuery} queryString={promotionQuery} products={catalog.products} sponsored={page === 1 && !seller} />
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
            ) : catalog.pagination.total > 0 ? <div className="no-results"><h3>This results page is no longer available.</h3><p>The number of matching listings has changed. Your filters are kept.</p><button className="button dark" type="button" onClick={() => changePage(1)}>Go to first results page</button></div> : (
              <div className="no-results marketplace-no-results">
                <p className="eyebrow">Nothing on the shelf yet</p>
                <h3>{activeQuery ? `No listings for “${activeQuery}”` : "No listings match these filters."}</h3>
                <p>
                  {activeFilters.length ? `Active filters: ${activeFilters.map(control => `${control.label}: ${control.options.find(option => option.value === control.value)?.label || formatCondition(control.value)}`).join(" · ")}. ` : ""}
                  Remove a filter or browse all models to broaden your search.
                </p>
                <p>{huntEmailEnabled ? "Tell us what you want, and we will contact you if we find a matching listing." : "Save a Model Hunt for our team to review. Email alerts are not currently available."}</p>
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
                  <Link className="button dark" href={modelHuntHref(current)}>
                    Can&apos;t find it? Start a Model Hunt <Icon name="arrow" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      <MobileSheet id="mobile-filters" title="Filter listings" open={filtersOpen} onClose={() => setFiltersOpen(false)} actions={<>
        <button className="button outline" type="button" onClick={clearFilters} disabled={!filtered}>Clear all</button>
        <button className="button dark" type="button" onClick={() => setFiltersOpen(false)}>{pending || error ? "View listings" : `Show ${catalog.pagination.total} listing${catalog.pagination.total === 1 ? "" : "s"}`}</button>
      </>}>
        {filterFields}
        <p className="mobile-filter-status" role="status">{pending ? "Updating results…" : error ? "Unable to load results. Close filters to try again." : `${catalog.pagination.total} matching listing${catalog.pagination.total === 1 ? "" : "s"}`}</p>
      </MobileSheet>
      <SiteFooter />
    </main>
  );
}
