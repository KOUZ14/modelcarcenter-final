"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import type { CatalogResponse } from "@/lib/types";
import { storefrontHref, type StorefrontFilters } from "@/lib/storefront";
import { selectedFilterOptions } from "@/lib/discovery";
import { ProductCard } from "./product-card";
import { Icon } from "./icons";

export function StorefrontInventory({ slug, filters, catalog, scales }: {
  slug: string; filters: StorefrontFilters; catalog: CatalogResponse; scales: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState(filters.q);
  const [pending, startTransition] = useTransition();
  const { page, pages, total } = catalog.pagination;
  function change(patch: Partial<StorefrontFilters>) {
    startTransition(() => router.push(storefrontHref(slug, { ...filters, q: query.trim(), page: 1, ...patch }), { scroll: false }));
  }
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); change({}); }

  return <div className="storefront-inventory-content">
    <form className="storefront-controls" role="search" aria-label="Search this store" onSubmit={search}>
      <div className="storefront-search"><label htmlFor="store-query">Search this store</label>
        <span><input id="store-query" type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} placeholder="Model name or brand"/><button type="submit" aria-label="Search this store" disabled={pending}><Icon name="search"/></button></span>
      </div>
      <label htmlFor="store-scale">Scale<select id="store-scale" value={filters.scale} onChange={event => change({ scale: event.target.value })} disabled={pending}>
        <option value="">All scales</option>
        {selectedFilterOptions(scales.map(value => ({ value, label: value })), filters.scale).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
      <label htmlFor="store-sort">Sort by<select id="store-sort" value={filters.sort} onChange={event => change({ sort: event.target.value as StorefrontFilters["sort"] })} disabled={pending}>
        <option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
      </select></label>
    </form>
    <div className="storefront-results-bar">
      <p role="status">{pending ? "Updating this store’s models…" : `${total} ${total === 1 ? "listing" : "listings"}${filters.q ? ` matching “${filters.q}”` : ""}${filters.scale ? ` · ${filters.scale}` : ""}`}</p>
      {(filters.q || filters.scale) && <Link href={storefrontHref(slug, { sort: filters.sort })} scroll={false}>Clear filters</Link>}
    </div>
    <div className={pending ? "storefront-results is-pending" : "storefront-results"} aria-busy={pending} inert={pending}>
      {catalog.products.length ? <div className="product-grid storefront-grid">{catalog.products.map(product => <ProductCard key={product.id} product={product} storefront />)}</div> : <div className="storefront-empty">
        <h3>{filters.q || filters.scale ? "No matching models in this store" : page > 1 ? "No models on this page" : "No models available right now"}</h3>
        <p>{filters.q || filters.scale ? "Try another search or scale, or view all of this seller’s models." : "You can still message the seller about a model you’re looking for."}</p>
        {(filters.q || filters.scale || page > 1) && <Link className="button outline" href={storefrontHref(slug)}>View all store models</Link>}
      </div>}
    </div>
    {pages > 1 && <nav className="storefront-pagination" aria-label="Store inventory pages">
      {page > 1 && <Link href={storefrontHref(slug, { ...filters, page: Math.min(pages, page - 1) })}>Previous</Link>}
      <span>Page {page} of {pages}</span>
      {page < pages && <Link href={storefrontHref(slug, { ...filters, page: page + 1 })}>Next</Link>}
    </nav>}
  </div>;
}
