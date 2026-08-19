"use client";

import { FormEvent, useMemo, useState } from "react";

type Product = { id: number; name: string; scale: string; maker: string; price: number; seller: string; image: string; badge?: string; keywords: string; };

const products: Product[] = [
  { id: 1, name: "Fairlady Z S30", scale: "1:18", maker: "AUTOart", price: 289.95, seller: "Apex Miniatures", image: "/images/product-red-coupe.png", badge: "Recently added", keywords: "nissan datsun fairlady z s30 jdm red autoart coupe" },
  { id: 2, name: "963 No. 6 · Le Mans", scale: "1:43", maker: "Spark", price: 119, seller: "Gridline Models", image: "/images/product-silver-racer.png", badge: "Collector pick", keywords: "porsche 963 le mans endurance silver spark racing" },
  { id: 3, name: "Countach LPI 800-4", scale: "1:18", maker: "Kyosho", price: 249, seller: "Scale Society", image: "/images/product-blue-supercar.png", keywords: "lamborghini countach blue kyosho supercar" },
  { id: 4, name: "850 R Touring Sedan", scale: "1:64", maker: "Tarmac Works", price: 29.95, seller: "Tiny Garage Co.", image: "/images/product-black-sedan.png", badge: "Low stock", keywords: "volvo 850 r black tarmac works touring sedan" },
];

const scales = ["1:18", "1:24", "1:43", "1:64", "1:87", "Other scales"];
const makers = ["AUTOart", "Minichamps", "Kyosho", "Spark", "Tarmac Works", "Bburago", "INNO64", "GT Spirit"];

function Icon({ name }: { name: "search" | "user" | "heart" | "bag" | "arrow" | "check" | "menu" }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>,
    bag: <><path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedScale, setSelectedScale] = useState("All scales");
  const [favorites, setFavorites] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wantedSent, setWantedSent] = useState(false);
  const [joined, setJoined] = useState(false);

  const visibleProducts = useMemo(() => {
    const q = activeQuery.trim().toLowerCase();
    return products.filter((product) => {
      const inScale = selectedScale === "All scales" || product.scale === selectedScale;
      const inSearch = !q || `${product.name} ${product.scale} ${product.maker} ${product.seller} ${product.keywords}`.toLowerCase().includes(q);
      return inScale && inSearch;
    });
  }, [activeQuery, selectedScale]);

  function runSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setActiveQuery(query); document.getElementById("inventory")?.scrollIntoView({ behavior: "smooth" }); }
  function browseScale(scale: string) { setSelectedScale(scale); setActiveQuery(""); setQuery(""); document.getElementById("inventory")?.scrollIntoView({ behavior: "smooth" }); }
  function toggleFavorite(id: number) { setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function quickSearch(value: string) { setQuery(value); setActiveQuery(value); document.getElementById("inventory")?.scrollIntoView({ behavior: "smooth" }); }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Model Car Center home"><span className="brand-mark">MCC</span><span className="brand-name">MODEL CAR <b>CENTER</b></span></a>
        <nav className={menuOpen ? "main-nav open" : "main-nav"} aria-label="Main navigation">
          <a href="#inventory" onClick={() => setMenuOpen(false)}>Shop</a><a href="#scales" onClick={() => setMenuOpen(false)}>Browse by scale</a><a href="#wanted" onClick={() => setMenuOpen(false)}>Wanted models</a><a href="#sell" onClick={() => setMenuOpen(false)}>Sell with us</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button account-label" type="button" aria-label="Sign in"><Icon name="user"/><span>Sign in</span></button>
          <a className="icon-button" href="#inventory" aria-label={`Wishlist with ${favorites.length} items`}><Icon name="heart"/>{favorites.length > 0 && <span className="count">{favorites.length}</span>}</a>
          <button className="icon-button" type="button" aria-label="Shopping cart"><Icon name="bag"/></button>
          <button className="icon-button menu-toggle" type="button" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu"/></button>
        </div>
      </header>

      <section className="hero" id="top">
        <img src="/images/model-car-hero.png" alt="Detailed collectible sports car model in a dark studio"/><div className="hero-shade"/>
        <div className="hero-content shell">
          <p className="eyebrow light">Built for model-car collectors</p><h1>Every seller.<br/>One search.</h1>
          <p className="hero-copy">Find the exact model car you want across trusted stores—without searching the same make, model, and scale on ten different websites.</p>
          <form className="hero-search" onSubmit={runSearch}><label className="sr-only" htmlFor="hero-query">Search model cars</label><Icon name="search"/><input id="hero-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Make, model, scale, manufacturer, or keyword"/><button type="submit">Search inventory</button></form>
          <div className="quick-links" aria-label="Popular searches"><span>Try:</span><button type="button" onClick={() => quickSearch("1:18")}>1:18</button><button type="button" onClick={() => quickSearch("AUTOart")}>AUTOart</button><button type="button" onClick={() => quickSearch("Le Mans")}>Le Mans</button></div>
        </div>
      </section>

      <section className="journey-strip" aria-label="How Model Car Center works"><div className="shell journey-inner">{["Search", "Discover", "View model", "Buy"].map((step, index) => <div key={step}><span>0{index + 1}</span><b>{step}</b>{index < 3 && <Icon name="arrow"/>}</div>)}</div></section>

      <section className="section shell" id="scales">
        <div className="section-heading split-heading"><div><p className="eyebrow">Start with the shelf</p><h2>Browse by scale</h2></div><p>Jump straight to the size you collect most.</p></div>
        <div className="scale-grid">{scales.map((scale, index) => <button key={scale} type="button" onClick={() => browseScale(scale === "Other scales" ? "All scales" : scale)}><span>{String(index + 1).padStart(2, "0")}</span><b>{scale}</b><Icon name="arrow"/></button>)}</div>
      </section>

      <section className="section inventory-section" id="inventory"><div className="shell">
        <div className="section-heading inventory-heading"><div><p className="eyebrow">Across independent sellers</p><h2>{activeQuery || selectedScale !== "All scales" ? "Your search" : "Recently added"}</h2></div><div className="catalog-tools"><label>Scale<select value={selectedScale} onChange={(e) => setSelectedScale(e.target.value)}><option>All scales</option>{scales.slice(0, 5).map((scale) => <option key={scale}>{scale}</option>)}</select></label>{(activeQuery || selectedScale !== "All scales") && <button type="button" onClick={() => { setActiveQuery(""); setQuery(""); setSelectedScale("All scales"); }}>Clear filters</button>}</div></div>
        {visibleProducts.length > 0 ? <div className="product-grid">{visibleProducts.map((product) => <article className="product-card" key={product.id}>
          <div className="product-image-wrap"><img src={product.image} alt={`${product.maker} ${product.name} model car`}/>{product.badge && <span className="product-badge">{product.badge}</span>}<button className={favorites.includes(product.id) ? "favorite active" : "favorite"} type="button" aria-label={favorites.includes(product.id) ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`} onClick={() => toggleFavorite(product.id)}><Icon name="heart"/></button></div>
          <div className="product-meta"><span>{product.scale}</span><span>{product.maker}</span></div><h3>{product.name}</h3><div className="product-buy"><div><b>${product.price.toFixed(2)}</b><span>Sold by {product.seller}</span></div><button type="button" aria-label={`View ${product.name}`}><Icon name="arrow"/></button></div>
        </article>)}</div> : <div className="no-results"><p className="eyebrow">Not in current inventory</p><h3>Still looking for that exact model?</h3><p>Tell us what you need and we’ll alert you when a seller lists it.</p><a className="button dark" href="#wanted">Submit a wanted model</a></div>}
        <div className="center-action"><a className="text-link" href="#inventory">Browse all model cars <Icon name="arrow"/></a></div>
      </div></section>

      <section className="section value-section"><div className="shell value-layout"><div className="value-title"><p className="eyebrow light">Why Model Car Center</p><h2>Spend less time searching.<br/>More time collecting.</h2></div><div className="benefit-grid">
        {[ ["01", "Find models faster", "Search the details collectors actually use—from chassis and scale to model manufacturer."], ["02", "Multiple sellers, one place", "See inventory from independent stores without opening a dozen tabs."], ["03", "Collector-specific filters", "Narrow results by scale, make, model, manufacturer, condition, and more."], ["04", "Trusted sellers", "Shop listings from established model-car stores and verified marketplace sellers."] ].map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
      </div></div></section>

      <section className="section shell brands-section"><div className="section-heading split-heading"><div><p className="eyebrow">Browse the makers you know</p><h2>Popular model brands</h2></div><p>From museum-grade 1:18 pieces to the newest 1:64 releases.</p></div><div className="brand-grid">{makers.map((maker) => <button key={maker} type="button" onClick={() => quickSearch(maker)}>{maker}<Icon name="arrow"/></button>)}</div></section>

      <section className="section wanted-section" id="wanted"><div className="shell wanted-layout"><div className="wanted-copy"><p className="eyebrow light">Wanted models</p><h2>Can’t find it?<br/>Put us on the hunt.</h2><p>Submit the model you’re looking for. We’ll use requests to help sellers list what collectors actually want—and alert you when there’s a match.</p></div>
        <form className="wanted-form" onSubmit={(e) => { e.preventDefault(); setWantedSent(true); }}>{wantedSent ? <div className="success-message"><Icon name="check"/><h3>Your request is on the list.</h3><p>We’ll email you when a matching model becomes available.</p><button type="button" onClick={() => setWantedSent(false)}>Submit another</button></div> : <><div className="form-row"><label>Car make<input required placeholder="e.g. BMW"/></label><label>Model<input required placeholder="e.g. M3 E30"/></label></div><div className="form-row"><label>Preferred scale<select required defaultValue=""><option value="" disabled>Select scale</option>{scales.slice(0, 5).map((scale) => <option key={scale}>{scale}</option>)}</select></label><label>Model manufacturer<input placeholder="Optional"/></label></div><label>Email address<input required type="email" placeholder="you@example.com"/></label><button className="button light" type="submit">Submit wanted model <Icon name="arrow"/></button></>}</form>
      </div></section>

      <section className="section shell seller-section" id="sell"><div className="seller-image"><span>FOR SELLERS</span><b>Another shelf for your inventory.</b></div><div className="seller-copy"><p className="eyebrow">Sell with Model Car Center</p><h2>Reach more collectors.<br/>Keep selling your way.</h2><p>Model Car Center works as an additional sales channel—not a replacement for your website, store, or current marketplaces. List your inventory where dedicated collectors are already searching.</p><ul><li><Icon name="check"/>Keep your existing sales channels</li><li><Icon name="check"/>Reach collectors searching across stores</li><li><Icon name="check"/>Start with the inventory you choose</li></ul><a className="button dark" href="mailto:sellers@modelcarcenter.com">Become a launch seller <Icon name="arrow"/></a></div></section>

      <section className="community-section"><div className="shell community-inner"><div><p className="eyebrow">The collection is just getting started</p><h2>Join the center of model-car collecting.</h2><p>Get new inventory, new seller announcements, wanted-model alerts, and early access to future collector features.</p></div>{joined ? <div className="joined"><Icon name="check"/><span>You’re on the list.</span></div> : <form onSubmit={(e) => { e.preventDefault(); setJoined(true); }}><label className="sr-only" htmlFor="join-email">Email address</label><input id="join-email" type="email" required placeholder="Email address"/><button type="submit">Join the community <Icon name="arrow"/></button></form>}</div></section>

      <footer><div className="shell footer-top"><a className="brand footer-brand" href="#top"><span className="brand-mark">MCC</span><span className="brand-name">MODEL CAR <b>CENTER</b></span></a><p>One search for the models worth collecting.</p></div><div className="shell footer-links">
        <div><h3>Marketplace</h3><a href="#inventory">Browse all</a><a href="#scales">Browse by scale</a><a href="#wanted">Wanted models</a><a href="#inventory">Recently added</a></div><div><h3>Sell</h3><a href="#sell">Sell with us</a><a href="mailto:sellers@modelcarcenter.com">Seller interest</a><a href="#sell">Seller FAQ</a></div><div><h3>Support</h3><a href="mailto:help@modelcarcenter.com">Help center</a><a href="mailto:help@modelcarcenter.com">Contact</a><a href="#">Buyer protection</a></div><div><h3>Model Car Center</h3><a href="#">About</a><a href="#">Terms</a><a href="#">Privacy</a><a href="#">Instagram</a></div>
      </div><div className="shell footer-bottom"><span>© 2026 Model Car Center</span><span>Made for collectors.</span></div></footer>
    </main>
  );
}
