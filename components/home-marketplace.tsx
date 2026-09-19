"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { CatalogResponse } from "@/lib/types";
import { marketplaceHref, modelHuntHref, readMarketplaceFilters, selectedFilterOptions, stockCategories, type MarketplaceFilters } from "@/lib/discovery";
import { formatCondition } from "@/lib/format";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";
import { ModelHuntForm } from "./model-hunt-form";
import { CommunityForm } from "./community-form";
import "./discovery.css";
import "./home-desktop.css";

const scales = ["1:18", "1:24", "1:43", "1:64", "1:87"];
const makers = ["AUTOart", "Minichamps", "Kyosho", "Spark", "Tarmac Works", "Bburago", "INNO64", "GT Spirit"];

export function HomeMarketplace({ emailAlertsEnabled = false }: { emailAlertsEnabled?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = readMarketplaceFilters(searchParams);
  const filterQuery = marketplaceHref(filters).slice("/marketplace".length);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const hunt = useRef<HTMLDetailsElement>(null);
  const newsletter = useRef<HTMLDetailsElement>(null);
  const desktopScales = useRef<HTMLElement>(null);
  const [resultQuery, setResultQuery] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      if (signal.aborted) return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/catalog${filterQuery ? `${filterQuery}&` : "?"}pageSize=12`, { signal });
        const data = await response.json() as CatalogResponse & { error?: string };
        if (!response.ok) throw new Error(data.error || "Catalog unavailable.");
        if (!signal.aborted) { setCatalog(data); setResultQuery(filterQuery); }
      } catch (reason) {
        if (!signal.aborted) { setError(reason instanceof Error ? reason.message : "Catalog unavailable."); setResultQuery(filterQuery); }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }
    queueMicrotask(() => void load());
    return () => controller.abort();
  }, [filterQuery, retry]);

  // Desktop keeps the original expanded sections; phones keep the compact disclosures.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 821px)");
    const update = () => {
      if (hunt.current) hunt.current.open = desktop.matches || window.location.hash === "#model-hunt";
      if (newsletter.current) newsletter.current.open = desktop.matches;
    };
    update();
    desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, []);

  // Preserve existing /#model-hunt links while keeping the form out of the browsing path.
  useEffect(() => {
    let frame = 0;
    function revealHunt() {
      if (!hunt.current) return;
      hunt.current.open = true;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => hunt.current?.scrollIntoView({ block: "start" }));
    }
    function openLinkedHunt() {
      if (window.location.hash === "#model-hunt") revealHunt();
      if (window.location.hash === "#scales" && window.matchMedia("(min-width: 821px)").matches) desktopScales.current?.scrollIntoView({ block: "start" });
    }
    function onHuntLink(event: MouseEvent) {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.hash === "#model-hunt") revealHunt();
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.hash === "#scales" && window.matchMedia("(min-width: 821px)").matches) {
        event.preventDefault();
        window.history.pushState(null, "", target.hash);
        desktopScales.current?.scrollIntoView({ block: "start" });
      }
    }
    openLinkedHunt();
    window.addEventListener("hashchange", openLinkedHunt);
    document.addEventListener("click", onHuntLink);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", openLinkedHunt); document.removeEventListener("click", onHuntLink); };
  }, []);

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = query.trim();
    router.push(search ? `/marketplace?q=${encodeURIComponent(search)}` : "/marketplace");
  }

  const availableScales = stockCategories(scales, catalog?.stockCounts?.scales ?? {});
  const availableMakers = stockCategories(makers, catalog?.stockCounts?.manufacturers ?? {});
  const pending = loading || resultQuery !== filterQuery;
  const filtered = Boolean(filters.q || filters.scale || filters.manufacturer || filters.seller || filters.condition || filters.availability);
  function changeFilter(patch: Partial<MarketplaceFilters>) {
    router.push(`/${marketplaceHref({ ...filters, page: 1, ...patch }).slice("/marketplace".length)}`, { scroll: false });
  }
  const desktopFilters = [
    { key: "scale", label: "Scale", placeholder: "All scales", options: (catalog?.filters.scales ?? []).map(value => ({ value, label: value })) },
    { key: "manufacturer", label: "Manufacturer", placeholder: "All makers", options: (catalog?.filters.manufacturers ?? []).map(value => ({ value, label: value })) },
    { key: "seller", label: "Seller", placeholder: "All sellers", options: (catalog?.filters.sellers ?? []).map(item => ({ value: item.id, label: item.name })) },
    { key: "condition", label: "Model condition", placeholder: "Any model condition", options: (catalog?.filters.conditions ?? []).map(value => ({ value, label: formatCondition(value) })) },
  ] as const;

  return <main className="home-marketplace">
    <SiteHeader overlay desktopHome />
    <section className="hero" id="top">
      <Image src="/images/model-car-hero.png" alt="Detailed collectible sports car model in a dark studio" fill sizes="100vw" priority unoptimized />
      <div className="hero-shade" />
      <div id="main-content" tabIndex={-1} className="hero-content shell">
        <p className="eyebrow light home-desktop-only">Model Car Center</p>
        <h1><span className="home-mobile-only">Find your next model car</span><span className="home-desktop-only">Buy and sell<br />model cars</span></h1>
        <p className="hero-copy"><span className="home-mobile-only">Find and buy model cars from stores and collectors in one place.</span><span className="home-desktop-only">Find model cars from independent sellers and fellow collectors in one place.</span></p>
        <form className="hero-search" role="search" onSubmit={runSearch}>
          <label className="sr-only" htmlFor="hero-query">Search model cars</label>
          <Icon name="search" />
          <input id="hero-query" type="search" enterKeyHint="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try Porsche 911 or MINI GT" />
          <button type="submit"><span className="home-mobile-only">Search</span><span className="home-desktop-only">Search inventory</span></button>
        </form>
        <div className="quick-links home-desktop-only" aria-label="Popular searches"><span>Try:</span>{["1:18", "AUTOart", "Le Mans"].map(value => <button key={value} type="button" onClick={() => router.push(marketplaceHref({ q: value }))}>{value}</button>)}</div>
        <nav className="home-shortcuts home-mobile-only" aria-label="Quick discovery">
          <Link href="/marketplace">Shop all</Link>
          <Link href="/marketplace?availability=preorder">Upcoming releases</Link>
          <Link href="/wishlist">Wishlist</Link>
          <Link href="/sell">Start selling</Link>
        </nav>
      </div>
    </section>

    <section className="home-discovery shell home-mobile-only" id="scales" aria-label="Browse scales and manufacturers">
      <div className="home-browse-row"><h2>Shop by scale</h2><nav className="home-browse-links" aria-label="Model scales">
        {availableScales.map(({ value: scale, count }) => <Link key={scale} className={!loading && !error && !count ? "category-empty" : undefined} href={`/marketplace?scale=${encodeURIComponent(scale)}&availability=in_stock`}>{scale}<span className="category-count">{loading ? "…" : error ? "Check stock" : `${count} in stock`}</span></Link>)}
        <Link href="/marketplace">All scales</Link>
      </nav></div>
      {!loading && !error && <p className="stock-count-note">Counts show in-stock listings. Nothing in your scale? <Link className="text-link" href={modelHuntHref()}>Start a Model Hunt</Link>.</p>}
      <details className="home-makers">
        <summary>Browse by manufacturer</summary>
        <nav className="home-browse-links" aria-label="Model manufacturers">{availableMakers.map(({ value: maker, count }) => <Link key={maker} className={!loading && !error && !count ? "category-empty" : undefined} href={`/marketplace?manufacturer=${encodeURIComponent(maker)}&availability=in_stock`}>{maker}<span className="category-count">{loading ? "…" : error ? "Check stock" : `${count} in stock`}</span></Link>)}</nav>
      </details>
    </section>

    <section className="section inventory-section" id="inventory">
      <div className="shell">
        <div className="section-heading inventory-heading"><div><p className="eyebrow home-desktop-only">Across independent sellers</p><h2>{filtered ? "Your search" : "Recently added"}</h2></div><Link className="text-link home-mobile-only" href="/marketplace">Shop all <Icon name="arrow" /></Link>
          <div className="catalog-tools home-desktop-only">{desktopFilters.map(control => <label key={control.key}>{control.label}<select value={filters[control.key]} onChange={event => changeFilter({ [control.key]: event.target.value })}><option value="">{control.placeholder}</option>{selectedFilterOptions(control.options, filters[control.key], formatCondition(filters[control.key])).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}<label>Sort<select value={filters.sort} onChange={event => changeFilter({ sort: event.target.value as MarketplaceFilters["sort"] })}><option value="newest">Newest</option><option value="price_asc">Price low to high</option><option value="price_desc">Price high to low</option></select></label></div>
        </div>
        {filtered && <div className="active-filter-chips home-desktop-only" aria-label="Active filters">{filters.q && <button type="button" onClick={() => changeFilter({q:""})}>Search: {filters.q} <Icon name="close" /></button>}{desktopFilters.filter(control => filters[control.key]).map(control => <button key={control.key} type="button" aria-label={`Remove ${control.label} filter`} onClick={() => changeFilter({[control.key]:""})}>{control.label}: {control.options.find(option => option.value === filters[control.key])?.label || formatCondition(filters[control.key])} <Icon name="close" /></button>)}<button type="button" onClick={() => router.push("/", {scroll:false})}>Clear all</button></div>}
        {pending ? <div className="catalog-status" role="status">Loading the latest models…</div> : error ? <div className="catalog-status error-state" role="alert">
          <h3>Inventory is unavailable</h3><p>{error}</p><button className="button outline" type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>
        </div> : catalog?.products.length ? <>
          <div className="product-grid home-product-preview">{catalog.products.map(product => <ProductCard key={product.id} product={product} />)}</div>
          <div className="home-view-all home-mobile-only"><Link className="button outline" href="/marketplace">View all {catalog.pagination.total} listings <Icon name="arrow" /></Link></div>
          <div className="pagination home-desktop-only" aria-label="Catalog pages"><button type="button" disabled={filters.page <= 1} onClick={() => changeFilter({page:filters.page-1})}>Previous</button><span>Page {catalog.pagination.page} of {catalog.pagination.pages}</span><button type="button" disabled={filters.page >= catalog.pagination.pages} onClick={() => changeFilter({page:filters.page+1})}>Next</button></div>
        </> : <div className="no-results"><h3>{filtered ? "No matching models" : "No listings yet"}</h3><p>Looking for a specific model? Save what you want in a Model Hunt.</p><Link className="button dark" href={filtered ? modelHuntHref(filters) : "#model-hunt"}>Start a Model Hunt <Icon name="arrow" /></Link></div>}
      </div>
    </section>

    <section ref={desktopScales} className="section shell home-desktop-only" id="desktop-scales"><div className="section-heading split-heading"><div><p className="eyebrow">Start with the shelf</p><h2>Browse by scale</h2></div><p>Jump straight to the size you collect most.</p></div><div className="scale-grid">{[...scales, "Other scales"].map((value, index) => <button key={value} type="button" onClick={() => router.push(marketplaceHref({scale:value === "Other scales" ? "" : value}))}><span>{String(index+1).padStart(2,"0")}</span><b>{value}</b><Icon name="arrow" /></button>)}</div></section>
    <section className="section value-section home-desktop-only"><div className="shell value-layout"><div className="value-title"><p className="eyebrow light">Why Model Car Center</p><h2>Marketplace features</h2></div><div className="benefit-grid">{[["01","Find models faster","Search the details collectors actually use—from scale and vehicle to model manufacturer."],["02","Independent sellers, one place","See available inventory from approved specialist sellers without opening a dozen tabs."],["03","Collector-specific filters","Narrow results by scale, maker, seller, condition, and price."],["04","A real Model Hunt","Tell us what is missing so future inventory can be matched to real collector demand."]].map(([number,title,copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>
    <section className="section shell brands-section home-desktop-only"><div className="section-heading split-heading"><div><p className="eyebrow">Browse the makers you know</p><h2>Popular model brands</h2></div><p>From detailed 1:18 pieces to the newest 1:64 releases.</p></div><div className="brand-grid">{makers.map(maker => <button key={maker} type="button" onClick={() => router.push(marketplaceHref({manufacturer:maker}))}>{maker}<Icon name="arrow" /></button>)}</div></section>

    <section className="home-help shell" aria-label="More from Model Car Center">
      <details ref={hunt} className="home-disclosure home-hunt-section" id="model-hunt">
        <summary><span><strong>Looking for a specific model?</strong><span>Start a Model Hunt</span></span><Icon name="arrow" /></summary>
        <div className="home-disclosure-content"><div className="wanted-copy home-desktop-only"><p className="eyebrow light">Model Hunt</p><h2>Find a specific model</h2><p>Describe the model you want. We&apos;ll first check current inventory, then keep your request active so our team can confirm a future match.</p></div><ModelHuntForm emailAlertsEnabled={emailAlertsEnabled} /></div>
      </details>
      <div className="home-seller-link"><div className="seller-image home-desktop-only"><span>FOR SELLERS</span><b>Another shelf for your inventory.</b></div><div className="home-seller-copy"><p className="eyebrow home-desktop-only">Sell with Model Car Center</p><h2><span className="home-mobile-only">Make room for your next model</span><span className="home-desktop-only">Sell model cars</span></h2><p className="home-mobile-only">List a model or bring your store to MCC.</p><p className="home-desktop-only">Keep your existing store. Model Car Center gives you another sales channel.</p><ul className="home-desktop-only"><li><Icon name="check" />Keep your existing sales channels</li><li><Icon name="check" />Upload inventory from a spreadsheet</li><li><Icon name="check" />Connect your bank account to receive payments</li></ul></div><Link className="button dark" href="/sell"><span className="home-mobile-only">Start selling</span><span className="home-desktop-only">Become a launch seller</span><Icon name="arrow" /></Link></div>
      <details className="home-disclosure home-mobile-only">
        <summary><span><strong>How Model Car Center works</strong><span>Shopping, sellers and Model Hunts</span></span><Icon name="arrow" /></summary>
        <div className="home-disclosure-content home-features">
          <article><h3>Find models faster</h3><p>Search by vehicle, scale and manufacturer, then filter by seller and condition.</p></article>
          <article><h3>Independent sellers, one place</h3><p>Browse stores and collectors, with each seller’s shipping and condition details shown before purchase.</p></article>
          <article><h3>A real Model Hunt</h3><p>Tell us what you want and we’ll check for matching inventory.</p></article>
        </div>
      </details>
      <details ref={newsletter} className="home-disclosure home-newsletter-section">
        <summary><span><strong>Get marketplace updates</strong><span>New inventory and seller announcements</span></span><Icon name="arrow" /></summary>
        <div className="home-disclosure-content community-section"><div className="community-inner"><div className="home-desktop-only"><p className="eyebrow">Email updates</p><h2>Marketplace news</h2><p>Get new inventory, seller announcements, and Model Hunt updates.</p></div><CommunityForm /></div></div>
      </details>
    </section>
    <SiteFooter />
  </main>;
}
