"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { CatalogResponse } from "@/lib/types";
import { modelHuntHref, stockCategories } from "@/lib/discovery";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Icon } from "./icons";
import { ProductCard } from "./product-card";
import { ModelHuntForm } from "./model-hunt-form";
import { CommunityForm } from "./community-form";
import "./discovery.css";

const scales = ["1:18", "1:24", "1:43", "1:64", "1:87"];
const makers = ["AUTOart", "Minichamps", "Kyosho", "Spark", "Tarmac Works", "Bburago", "INNO64", "GT Spirit"];

export function HomeMarketplace({ emailAlertsEnabled = false }: { emailAlertsEnabled?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const hunt = useRef<HTMLDetailsElement>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/catalog?sort=newest&page=1&pageSize=8", { signal });
      const data = await response.json() as CatalogResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Catalog unavailable.");
      if (!signal.aborted) setCatalog(data);
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Catalog unavailable.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void load(controller.signal));
    return () => controller.abort();
  }, [load, retry]);

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
    }
    function onHuntLink(event: MouseEvent) {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.hash === "#model-hunt") revealHunt();
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

  return <main className="home-marketplace">
    <SiteHeader overlay />
    <section className="hero" id="top">
      <Image src="/images/model-car-hero.png" alt="Detailed collectible sports car model in a dark studio" fill sizes="100vw" priority unoptimized />
      <div className="hero-shade" />
      <div id="main-content" tabIndex={-1} className="hero-content shell">
        <h1>Find your next model car</h1>
        <p className="hero-copy">Find and buy model cars from stores and collectors in one place.</p>
        <form className="hero-search" role="search" onSubmit={runSearch}>
          <label className="sr-only" htmlFor="hero-query">Search model cars</label>
          <Icon name="search" />
          <input id="hero-query" type="search" enterKeyHint="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try Porsche 911 or MINI GT" />
          <button type="submit">Search</button>
        </form>
        <nav className="home-shortcuts" aria-label="Quick discovery">
          <Link href="/marketplace">Shop all</Link>
          <Link href="/marketplace?availability=preorder">Upcoming releases</Link>
          <Link href="/wishlist">Wishlist</Link>
          <Link href="/sell">Start selling</Link>
        </nav>
      </div>
    </section>

    <section className="home-discovery shell" id="scales" aria-label="Browse scales and manufacturers">
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
        <div className="section-heading inventory-heading"><h2>Recently added</h2><Link className="text-link" href="/marketplace">Shop all <Icon name="arrow" /></Link></div>
        {loading ? <div className="catalog-status" role="status">Loading the latest models…</div> : error ? <div className="catalog-status error-state" role="alert">
          <h3>Inventory is unavailable</h3><p>{error}</p><button className="button outline" type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>
        </div> : catalog?.products.length ? <>
          <div className="product-grid home-product-preview">{catalog.products.map(product => <ProductCard key={product.id} product={product} />)}</div>
          <div className="home-view-all"><Link className="button outline" href="/marketplace">View all {catalog.pagination.total} listings <Icon name="arrow" /></Link></div>
        </> : <div className="no-results"><h3>No listings yet</h3><p>Looking for a specific model? Save what you want in a Model Hunt.</p><a className="button dark" href="#model-hunt">Start a Model Hunt <Icon name="arrow" /></a></div>}
      </div>
    </section>

    <section className="home-help shell" aria-label="More from Model Car Center">
      <details ref={hunt} className="home-disclosure" id="model-hunt">
        <summary><span><strong>Looking for a specific model?</strong><span>Start a Model Hunt</span></span><Icon name="arrow" /></summary>
        <div className="home-disclosure-content"><ModelHuntForm emailAlertsEnabled={emailAlertsEnabled} /></div>
      </details>
      <div className="home-seller-link"><div><h2>Make room for your next model</h2><p>List a model or bring your store to MCC.</p></div><Link className="button dark" href="/sell">Start selling <Icon name="arrow" /></Link></div>
      <details className="home-disclosure">
        <summary><span><strong>How Model Car Center works</strong><span>Shopping, sellers and Model Hunts</span></span><Icon name="arrow" /></summary>
        <div className="home-disclosure-content home-features">
          <article><h3>Find models faster</h3><p>Search by vehicle, scale and manufacturer, then filter by seller and condition.</p></article>
          <article><h3>Independent sellers, one place</h3><p>Browse stores and collectors, with each seller’s shipping and condition details shown before purchase.</p></article>
          <article><h3>A real Model Hunt</h3><p>Tell us what you want and we’ll check for matching inventory.</p></article>
        </div>
      </details>
      <details className="home-disclosure">
        <summary><span><strong>Get marketplace updates</strong><span>New inventory and seller announcements</span></span><Icon name="arrow" /></summary>
        <div className="home-disclosure-content community-section"><div className="community-inner"><CommunityForm /></div></div>
      </details>
    </section>
    <SiteFooter />
  </main>;
}
