"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "./icons";
import { formatMoney } from "@/lib/format";

const tools = [
  {
    id: "inventory", label: "Inventory", icon: "grid",
    title: "Keep your stock ready to sell.",
    description: "Bring your spreadsheet, update prices and quantities together, and see which listings need attention.",
    features: ["CSV imports with a preview before saving", "Bulk price and stock updates", "Low-stock and unfinished-listing queues"],
  },
  {
    id: "demand", label: "Buyer interest", icon: "heart",
    title: "See what collectors are looking for.",
    description: "Use saved listings and open Model Hunts to decide what to stock next and which models to reprice.",
    features: ["Wishlist interest in your listings", "Model Hunts matched to your inventory", "Restock requests for unavailable models"],
  },
  {
    id: "orders", label: "Orders", icon: "bag",
    title: "Know what to ship next.",
    description: "Keep paid orders, dispatch deadlines and tracking together, from the first sale through delivery.",
    features: ["A clear queue of orders to ship", "Shipping labels when carrier tools are available", "Add your own tracking and follow delivery"],
  },
  {
    id: "payments", label: "Payments", icon: "check",
    title: "Follow the money from each sale.",
    description: "See the proceeds from each order, understand any holds, and track releases to your payment account.",
    features: ["Held and released proceeds in one view", "Order-level fees and release status", "Secure bank connection through Stripe"],
  },
] as const;

const sampleStock = [
  { sku: "DEMO-101", title: "Red road coupe", scale: "1:18", image: "/images/product-red-coupe.png", price: 12900, available: 4, draft: false },
  { sku: "DEMO-102", title: "Silver race car", scale: "1:43", image: "/images/product-silver-racer.png", price: 8900, available: 1, draft: false },
  { sku: "DEMO-103", title: "Blue supercar", scale: "1:18", image: "/images/product-blue-supercar.png", price: 15900, available: 0, draft: true },
];

function InventoryPreview() {
  const [lowStock, setLowStock] = useState(false);
  const rows = lowStock ? sampleStock.filter(item => !item.draft && item.available <= 2) : sampleStock;
  return <>
    <div className="seller-preview-screen-heading"><h4>Inventory</h4><span>3 listings · 5 available units</span></div>
    <div className="seller-preview-filters" role="group" aria-label="Filter sample inventory">
      <button type="button" aria-pressed={!lowStock} onClick={() => setLowStock(false)}>All inventory <span>3</span></button>
      <button type="button" aria-pressed={lowStock} onClick={() => setLowStock(true)}>Low stock <span>1</span></button>
    </div>
    <ul className="seller-preview-stock" aria-label="Sample inventory">
      {rows.map(item => <li key={item.sku}>
        <Image src={item.image} alt="" width={80} height={64} unoptimized />
        <div className="seller-preview-model"><strong>{item.title}</strong><span>{item.scale} · {item.sku}</span><span className={`seller-preview-status ${item.draft ? "neutral" : item.available <= 2 ? "attention" : "ready"}`}>{item.draft ? "Draft · Add photos" : item.available <= 2 ? "Low stock" : "Active"}</span></div>
        <div className="seller-preview-stock-count"><strong>{formatMoney(item.price)}</strong><span>{item.draft ? "Not published" : `${item.available} available`}</span></div>
      </li>)}
    </ul>
    <details className="seller-preview-import">
      <summary>See a sample spreadsheet preview</summary>
      <p>Check each row before saving. Existing SKUs update your inventory; new SKUs create drafts.</p>
      <dl><div><dt>DEMO-101</dt><dd>Update stock &amp; price</dd></div><div><dt>DEMO-104</dt><dd>Create draft</dd></div></dl>
      <p className="seller-preview-note">New drafts need photos and a condition check before publishing.</p>
    </details>
    <p className="seller-preview-note">Sold elsewhere? Update your stock here. Other sales channels don’t sync automatically.</p>
  </>;
}

function DemandPreview() {
  return <>
    <div className="seller-preview-screen-heading"><h4>Buyer demand</h4><span>Interest in your inventory</span></div>
    <p className="seller-preview-caption">Collectors who saved these listings</p>
    <ul className="seller-preview-interest">
      {sampleStock.slice(0, 2).map((item, index) => <li key={item.sku}>
        <Image src={item.image} alt="" width={80} height={64} unoptimized />
        <div><strong>{item.title}</strong><span>{item.scale} · {index === 0 ? "5" : "2"} saves in the last 30 days</span></div>
        <span className="seller-preview-save-count"><Icon name="heart" /><strong>{index === 0 ? "12" : "4"}</strong></span>
      </li>)}
    </ul>
    <div className="seller-preview-hunt">
      <span className="seller-preview-caption">Model Hunt match</span>
      <strong>Silver race car · 1:43</strong>
      <p>3 collector requests match a model in your inventory.</p>
      <span className="seller-preview-status ready">1 matching listing in stock</span>
    </div>
    <p className="seller-preview-note">Wishlist saves and Model Hunts show interest. Review the model, condition and budget before responding.</p>
  </>;
}

function OrdersPreview() {
  return <>
    <div className="seller-preview-screen-heading"><h4>Orders to ship</h4><span>2 paid orders</span></div>
    <div className="seller-preview-order">
      <div><strong>MCC-1042</strong><span className="seller-preview-status attention">Awaiting shipment</span></div>
      <p>Red road coupe <span>1:18 · 1 model</span></p>
      <div className="seller-preview-deadline"><Icon name="bag" /><span>Ship by 24 Sep, 2pm</span></div>
    </div>
    <div className="seller-preview-order">
      <div><strong>MCC-1043</strong><span className="seller-preview-status ready">Packing</span></div>
      <p>Silver race car <span>1:43 · 1 model</span></p>
      <div className="seller-preview-deadline"><Icon name="bag" /><span>Ship by 25 Sep, 2pm</span></div>
    </div>
    <ol className="seller-preview-shipping" aria-label="Order fulfillment workflow">
      <li><span>1</span>Pack the model</li>
      <li><span>2</span>Buy a label or add tracking</li>
      <li><span>3</span>Follow delivery</li>
    </ol>
  </>;
}

function PaymentsPreview() {
  return <>
    <div className="seller-preview-screen-heading"><h4>Payments</h4><span className="seller-preview-status ready">Stripe connected</span></div>
    <dl className="seller-preview-balances">
      <div><dt>Held proceeds</dt><dd>{formatMoney(11850)}</dd></div>
      <div><dt>Released to Stripe</dt><dd>{formatMoney(42480)}</dd></div>
    </dl>
    <div className="seller-preview-payment"><div><strong>MCC-1042</strong><span>Awaiting delivery and release eligibility</span></div><strong>{formatMoney(11850)}</strong></div>
    <div className="seller-preview-payment"><div><strong>MCC-1038</strong><span>Released to payment account</span></div><strong>{formatMoney(42480)}</strong></div>
    <div className="seller-preview-payment-note"><Icon name="check" /><p>Check the proceeds, fee breakdown and release status for each order.</p></div>
    <p className="seller-preview-note">Release depends on delivery, protection terms and any holds. Bank arrival follows Stripe’s payout schedule.</p>
  </>;
}

const previews = [InventoryPreview, DemandPreview, OrdersPreview, PaymentsPreview];

export function SellerToolsPreview() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tools.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tools.length) % tools.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tools.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  }

  return <section id="listing-preview" className="sell-tools-preview" aria-labelledby="seller-preview-title">
    <div className="sell-section-heading">
      <p className="eyebrow">Your selling workspace</p>
      <h2 id="seller-preview-title">Tools to keep your models moving.</h2>
      <p>From finding buyer interest to getting an order out the door, see how Model Car Center helps you run your store.</p>
    </div>
    <div className="seller-tools-tour">
      <div className="seller-tool-tabs" role="tablist" aria-label="Explore the seller tools">
        {tools.map((tool, index) => <button type="button" role="tab" key={tool.id} id={`seller-tool-${tool.id}`} aria-controls={`seller-tool-panel-${tool.id}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} ref={element => { tabs.current[index] = element; }} onClick={() => setSelected(index)} onKeyDown={event => navigate(event, index)}><Icon name={tool.icon} />{tool.label}</button>)}
      </div>
      {tools.map((tool, index) => {
        const Preview = previews[index];
        return <div key={tool.id} id={`seller-tool-panel-${tool.id}`} className="seller-tool-panel" role="tabpanel" aria-labelledby={`seller-tool-${tool.id}`} tabIndex={0} hidden={selected !== index}>
          <div className="seller-tool-benefit">
            <span className="seller-tool-number">0{index + 1} / 04</span>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            <ul>{tool.features.map(feature => <li key={feature}><Icon name="check" />{feature}</li>)}</ul>
          </div>
          <div className="seller-preview-screen" aria-label={`${tool.label} example with sample data`}>
            <div className="seller-preview-topbar"><span><span className="seller-preview-brand" aria-hidden="true">MCC</span> Seller Hub</span><span>Sample data</span></div>
            <div className="seller-preview-screen-content"><Preview /></div>
          </div>
        </div>;
      })}
      <p className="seller-tools-scope">A walkthrough of the store workspace using example inventory and orders. Selling from your own collection? Manage your listings and sales in <Link href="/account?view=listings">My Garage</Link>.</p>
    </div>
    <div className="seller-tools-help"><div><h3>Help getting your first models listed.</h3><p>We can help with store setup, your first listings or an inventory spreadsheet.</p></div><Link href="/contact#seller-setup-help">Contact seller support <Icon name="arrow" /></Link></div>
  </section>;
}
