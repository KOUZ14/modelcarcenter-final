"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatCondition } from "@/lib/format";
import type { CatalogResponse } from "@/lib/types";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";
import { ModelHuntForm } from "./model-hunt-form";
import { CommunityForm } from "./community-form";

const scales = ["1:18", "1:24", "1:43", "1:64", "1:87", "Other scales"];
const makers = [
  "AUTOart",
  "Minichamps",
  "Kyosho",
  "Spark",
  "Tarmac Works",
  "Bburago",
  "INNO64",
  "GT Spirit",
];
const emptyCatalog: CatalogResponse = {
  products: [],
  pagination: { page: 1, pageSize: 12, total: 0, pages: 1 },
  filters: { scales: [], manufacturers: [], sellers: [], conditions: [] },
};

export function HomeMarketplace() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [scale, setScale] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [seller, setSeller] = useState("");
  const [condition, setCondition] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const params = new URLSearchParams({
      q: activeQuery,
      scale,
      manufacturer,
      seller,
      condition,
      sort,
      page: String(page),
      pageSize: "12",
    });
    try {
      const response = await fetch(`/api/catalog?${params}`);
      const data = (await response.json()) as CatalogResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Catalog unavailable.");
      setCatalog(data);
    } catch (reason) {
      setCatalog(emptyCatalog);
      setError(
        reason instanceof Error ? reason.message : "Catalog unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeQuery, condition, manufacturer, page, scale, seller, sort]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  function beginLoad() {
    setLoading(true);
    setError("");
  }
  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = query.trim();
    router.push(search ? `/marketplace?q=${encodeURIComponent(search)}` : "/marketplace");
  }
  function quickSearch(value: string) {
    router.push(`/marketplace?q=${encodeURIComponent(value)}`);
  }
  function clear() {
    beginLoad();
    setQuery("");
    setActiveQuery("");
    setScale("");
    setManufacturer("");
    setSeller("");
    setCondition("");
    setSort("newest");
    setPage(1);
  }
  return (
    <main>
      <SiteHeader overlay />
      <section className="hero" id="top">
        <Image
          src="/images/model-car-hero.png"
          alt="Detailed collectible sports car model in a dark studio"
          fill
          sizes="100vw"
          priority
          unoptimized
        />
        <div className="hero-shade" />
        <div className="hero-content shell">
          <p className="eyebrow light">Find. Buy. Sell. Hunt.</p>
          <h1>
            Every seller.
            <br />
            One search.
          </h1>
          <p className="hero-copy">
            Find model cars from independent sellers and fellow collectors in
            one place.
          </p>
          <form className="hero-search" onSubmit={runSearch}>
            <label className="sr-only" htmlFor="hero-query">
              Search model cars
            </label>
            <Icon name="search" />
            <input
              id="hero-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Make, model, scale, manufacturer, or keyword"
            />
            <button type="submit">Search inventory</button>
          </form>
          <div className="quick-links" aria-label="Popular searches">
            <span>Try:</span>
            {["1:18", "AUTOart", "Le Mans"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => quickSearch(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="section inventory-section" id="inventory">
        <div className="shell">
          <div className="section-heading inventory-heading">
            <div>
              <p className="eyebrow">Across independent sellers</p>
              <h2>
                {activeQuery || scale || manufacturer || seller || condition
                  ? "Your search"
                  : "Recently added"}
              </h2>
            </div>
            <div className="catalog-tools">
              <label>
                Scale
                <select
                  value={scale}
                  onChange={(e) => {
                    setScale(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All scales</option>
                  {catalog.filters.scales.map((item) => (
                    <option key={item} value={item}>
                      {formatCondition(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Manufacturer
                <select
                  value={manufacturer}
                  onChange={(e) => {
                    setManufacturer(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All makers</option>
                  {catalog.filters.manufacturers.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Seller
                <select
                  value={seller}
                  onChange={(e) => {
                    setSeller(e.target.value);
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
                  onChange={(e) => {
                    setCondition(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Any model condition</option>
                  {catalog.filters.conditions.map((item) => (
                    <option key={item} value={item}>{formatCondition(item)}</option>
                  ))}
                </select>
              </label>
              <label>
                Sort
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price low to high</option>
                  <option value="price_desc">Price high to low</option>
                </select>
              </label>
            </div>
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
                onClick={() => {
                  beginLoad();
                  void load();
                }}
              >
                Try again
              </button>
            </div>
          ) : catalog.products.length ? (
            <>
              <div className="product-grid">
                {catalog.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <div className="pagination" aria-label="Catalog pages">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    beginLoad();
                    setPage((value) => value - 1);
                  }}
                >
                  Previous
                </button>
                <span>
                  Page {catalog.pagination.page} of {catalog.pagination.pages}
                </span>
                <button
                  type="button"
                  disabled={page >= catalog.pagination.pages}
                  onClick={() => {
                    beginLoad();
                    setPage((value) => value + 1);
                  }}
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <div className="no-results">
              <p className="eyebrow">Not in current inventory</p>
              <h3>Can&apos;t find it? Start a Model Hunt.</h3>
              <p>
                Tell us exactly what you need. We&apos;ll email you if a
                matching product is added and confirmed by our team.
              </p>
              <a className="button dark" href="#model-hunt">
                Start a Model Hunt <Icon name="arrow" />
              </a>
            </div>
          )}
          {(activeQuery || scale || manufacturer || seller || condition) && (
            <div className="center-action">
              <button
                className="text-link clear-button"
                type="button"
                onClick={clear}
              >
                Clear search and filters
              </button>
            </div>
          )}
        </div>
      </section>
      <section className="section shell" id="scales">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">Start with the shelf</p>
            <h2>Browse by scale</h2>
          </div>
          <p>Jump straight to the size you collect most.</p>
        </div>
        <div className="scale-grid">
          {scales.map((item, index) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                const selectedScale = item === "Other scales" ? "" : item;
                router.push(
                  selectedScale
                    ? `/marketplace?scale=${encodeURIComponent(selectedScale)}`
                    : "/marketplace",
                );
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{item}</b>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      </section>
      <section className="section value-section">
        <div className="shell value-layout">
          <div className="value-title">
            <p className="eyebrow light">Why Model Car Center</p>
            <h2>
              Spend less time searching.
              <br />
              More time collecting.
            </h2>
          </div>
          <div className="benefit-grid">
            {[
              [
                "01",
                "Find models faster",
                "Search the details collectors actually use—from scale and vehicle to model manufacturer.",
              ],
              [
                "02",
                "Independent sellers, one place",
                "See available inventory from approved specialist sellers without opening a dozen tabs.",
              ],
              [
                "03",
                "Collector-specific filters",
                "Narrow results by scale, maker, seller, condition, and price.",
              ],
              [
                "04",
                "A real Model Hunt",
                "Tell us what is missing so future inventory can be matched to real collector demand.",
              ],
            ].map(([number, title, copy]) => (
              <article key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section shell brands-section">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">Browse the makers you know</p>
            <h2>Popular model brands</h2>
          </div>
          <p>From detailed 1:18 pieces to the newest 1:64 releases.</p>
        </div>
        <div className="brand-grid">
          {makers.map((maker) => (
            <button
              key={maker}
              type="button"
              onClick={() => quickSearch(maker)}
            >
              {maker}
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      </section>
      <section className="section wanted-section" id="model-hunt">
        <div className="shell wanted-layout">
          <div className="wanted-copy">
            <p className="eyebrow light">Model Hunt</p>
            <h2>
              Can&apos;t find it?
              <br />
              Start a Model Hunt.
            </h2>
            <p>
              Describe the model you want. We&apos;ll first check current
              inventory, then keep your request active so our team can confirm a
              future match.
            </p>
          </div>
          <ModelHuntForm />
        </div>
      </section>
      <section className="section shell seller-section">
        <div className="seller-image">
          <span>FOR SELLERS</span>
          <b>Another shelf for your inventory.</b>
        </div>
        <div className="seller-copy">
          <p className="eyebrow">Sell with Model Car Center</p>
          <h2>
            Reach more collectors.
            <br />
            Keep selling your way.
          </h2>
          <p>
            Keep your existing store. Model Car Center gives you another sales
            channel.
          </p>
          <ul>
            <li>
              <Icon name="check" />
              Keep your existing sales channels
            </li>
            <li>
              <Icon name="check" />
              Import your current inventory by CSV
            </li>
            <li>
              <Icon name="check" />
              Use Stripe-hosted payout onboarding
            </li>
          </ul>
          <Link className="button dark" href="/sell">
            Become a launch seller <Icon name="arrow" />
          </Link>
        </div>
      </section>
      <section className="community-section">
        <div className="shell community-inner">
          <div>
            <p className="eyebrow">The collection is just getting started</p>
            <h2>Join the center of model car collecting.</h2>
            <p>
              Get new inventory, seller announcements, and Model Hunt updates.
            </p>
          </div>
          <CommunityForm />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
