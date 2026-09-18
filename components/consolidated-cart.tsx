"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AddressFields, type AddressFieldsHandle } from "./address-fields";
import { useMarketplace } from "./marketplace-provider";
import { formatMoney as money } from "@/lib/format";
import { POLICY_VERSION } from "@/lib/legal";
import { getShippingZip, setShippingZip } from "@/lib/shipping-destination";
import { CHECKOUT_ADDRESS_KEY, CHECKOUT_SESSION_KEY, checkoutAddressKey, readCheckoutAddressDraft } from "@/lib/checkout-address";
import type { NormalizedShippingAddress } from "@/lib/shipping-rules";
import type { CartItem } from "@/lib/types";
import type { CombinedShippingRequest } from "@/lib/combined-shipping";
import { combinedRequestMatches } from "@/lib/combined-shipping-display";
import { groupCartBySeller } from "@/lib/cart-groups";

type Rate = { id: string; provider: string; serviceLevel: string; amountCents: number; currency: string; estimatedDays: number | null };
type Quote = { cartKey: string; addressKey: string; quoteId: string | null; expiresAt: string | null; options: Rate[]; insuranceRequired?: boolean; signatureRequired?: boolean };
const itemKey = (items: CartItem[]) => JSON.stringify(items.map((item) => [item.productId, item.quantity, item.priceCents, item.currency, item.shippingMode, item.shippingCents]));
const requestedItems = (items: CartItem[]) => items.map(({ productId, quantity }) => ({ productId, quantity }));

export function CartPage({ automaticTax, taxBehavior }: { automaticTax: boolean; taxBehavior: "exclusive" | "inclusive" }) {
  const { cart, collector, authReady, setQuantity, removeFromCart, clearSellerCart } = useMarketplace();
  const [destination, setDestination] = useState<NormalizedShippingAddress | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [rates, setRates] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, string>>({});
  const [requests, setRequests] = useState<CombinedShippingRequest[]>([]);
  const [calculating, setCalculating] = useState<Record<string, boolean>>({});
  const [requesting, setRequesting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clock, setClock] = useState(0);
  const addressRef = useRef<AddressFieldsHandle>(null);
  const addressForm = useRef<HTMLFormElement>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const checkoutLock = useRef(false);
  const sourceStorageKey = `mcc-shipping-choices-${collector?.id ?? "guest"}`;
  function chooseSource(sellerId: string, source: string) {
    setSources((current) => {
      const next = { ...current, [sellerId]: source };
      try { sessionStorage.setItem(sourceStorageKey, JSON.stringify(next)); } catch { /* Optional storage. */ }
      return next;
    });
  }
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      let restored: Record<string, string> = {};
      try {
        const saved: unknown = JSON.parse(sessionStorage.getItem(sourceStorageKey) ?? "{}");
        if (saved && typeof saved === "object" && !Array.isArray(saved)) restored = Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === "string"));
      } catch { /* Optional storage. */ }
      if (active) setSources(restored);
    });
    return () => { active = false; };
  }, [sourceStorageKey]);
  useEffect(() => {
    mounted.current = true;
    const refresh = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", refresh);
    void Promise.resolve().then(() => {
      let saved: string | null = null;
      try { saved = sessionStorage.getItem(CHECKOUT_ADDRESS_KEY); } catch { /* Optional storage. */ }
      const address = readCheckoutAddressDraft(saved);
      if (!saved) address.zip = getShippingZip();
      if (mounted.current) { setDestination(address); setClock(Date.now()); }
    });
    return () => { mounted.current = false; revision.current += 1; window.removeEventListener("pageshow", refresh); };
  }, []);
  useEffect(() => {
    if (!collector) return;
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/shipping/combined", { cache: "no-store" });
        const data = await response.json() as { requests?: CombinedShippingRequest[] };
        if (!response.ok) throw new Error();
        if (active) { setRequests(data.requests ?? []); setRequestError(""); setClock(Date.now()); }
      } catch { if (active) setRequestError("Shipping requests could not be refreshed. Refresh this page to retry; your cart is kept."); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [collector]);
  useEffect(() => {
    const deadlines = [...Object.values(quotes).map((quote) => quote.expiresAt), ...requests.map((request) => request.expiresAt)].filter((value): value is string => Boolean(value)).map(Date.parse).filter((time) => time > Date.now());
    if (!deadlines.length) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.max(1, Math.min(...deadlines) - Date.now() + 1));
    return () => clearTimeout(timer);
  }, [quotes, requests, clock]);
  const groups = groupCartBySeller(cart);
  const selected = groups.filter((group) => !excluded.includes(group.sellerId));
  const addressKey = destination ? checkoutAddressKey(destination) : "";
  function shippingFor(group: typeof groups[number], at = clock) {
    const source = sources[group.sellerId] ?? "standard";
    const request = requests.find((request) => request.id === source);
    const saved = quotes[group.sellerId];
    const quote = saved && saved.cartKey === itemKey(group.items) && saved.addressKey === addressKey && (!saved.expiresAt || Date.parse(saved.expiresAt) > at) ? saved : null;
    if (source !== "standard") {
      const valid = request && request.status === "quoted" && Date.parse(request.expiresAt) > at && combinedRequestMatches(request, group.items, destination);
      return { amount: valid ? request.amountCents : null, selection: valid ? { combinedRequestId: request.id } : null, quote: null };
    }
    if (group.items[0].shippingMode !== "calculated") return { amount: group.items[0].shippingMode === "free" ? 0 : group.items[0].shippingCents, selection: { rateId: group.items[0].shippingMode }, quote: null };
    const rate = quote?.options.find((option) => option.id === rates[group.sellerId]);
    return { amount: rate?.amountCents ?? null, selection: rate ? { quoteId: quote!.quoteId, rateId: rate.id } : null, quote };
  }
  const subtotal = selected.reduce((sum, group) => sum + group.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0), 0);
  const sameCurrency = new Set(selected.flatMap((group) => group.items.map((item) => item.currency.toUpperCase()))).size <= 1;
  const ready = sameCurrency && selected.length > 0 && selected.every((group) => shippingFor(group).selection !== null);
  const shipping = ready ? selected.reduce((sum, group) => sum + shippingFor(group).amount!, 0) : null;
  const working = selected.some((group) => calculating[group.sellerId]);
  const currency = selected[0]?.items[0].currency ?? cart[0]?.currency ?? "usd";
  async function calculate(group: typeof groups[number]) {
    if (loading || calculating[group.sellerId] || !destination || !addressForm.current?.reportValidity()) return;
    const currentRevision = revision.current, cartKey = itemKey(group.items);
    setCalculating((state) => ({ ...state, [group.sellerId]: true })); setError("");
    try {
      const response = await fetch("/api/shipping/options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: requestedItems(group.items), destination }) });
      const data = await response.json() as Quote & { error?: string; fields?: Record<string, string> };
      if (!mounted.current || currentRevision !== revision.current) return;
      if (data.fields) addressRef.current?.setErrors(data.fields);
      if (!response.ok || !data.options?.length) throw new Error(data.error || `Shipping for ${group.sellerName} could not be calculated.`);
      setQuotes((state) => ({ ...state, [group.sellerId]: { ...data, cartKey, addressKey } }));
      // eslint-disable-next-line react-hooks/purity -- This runs after a carrier request in the calculate event handler.
      setClock(Date.now());
      setRates((state) => ({ ...state, [group.sellerId]: data.options[0].id }));
    } catch (reason) { if (mounted.current && currentRevision === revision.current) setError(reason instanceof Error ? reason.message : "Shipping could not be calculated."); }
    finally { if (mounted.current && currentRevision === revision.current) setCalculating((state) => ({ ...state, [group.sellerId]: false })); }
  }
  async function calculateSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await Promise.all(selected.filter((group) => group.items[0].shippingMode === "calculated" && (sources[group.sellerId] ?? "standard") === "standard").map(calculate));
  }
  async function requestShipping(group: typeof groups[number]) {
    if (requesting || loading || !collector || !destination || !addressForm.current?.reportValidity()) return;
    setRequesting(group.sellerId); setRequestError("");
    const currentRevision = revision.current;
    try {
      const response = await fetch("/api/shipping/combined", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", items: requestedItems(group.items), destination }) });
      const data = await response.json() as { id?: string; requests?: CombinedShippingRequest[]; error?: string; fields?: Record<string, string> };
      if (data.fields) addressRef.current?.setErrors(data.fields);
      if (!response.ok || !data.id) throw new Error(data.error || "The shipping request could not be sent.");
      setRequests(data.requests ?? []);
      if (currentRevision === revision.current) chooseSource(group.sellerId, data.id);
    } catch (reason) { setRequestError(reason instanceof Error ? reason.message : "The shipping request could not be sent."); }
    finally { setRequesting(null); }
  }
  async function checkout() {
    if (checkoutLock.current || loading || working || requesting || !ready || !authReady || !acceptedPolicies || !destination || !addressForm.current?.reportValidity()) return;
    // eslint-disable-next-line react-hooks/purity -- Recheck the deadline at the buyer's payment click, even if a background tab delayed its timer.
    if (selected.some((group) => !shippingFor(group, Date.now()).selection)) { setClock(Date.now()); setError("A shipping quote expired. Refresh carrier options or choose standard shipping before paying."); return; }
    checkoutLock.current = true; setLoading(true); setError("");
    try {
      let previousReservationId: string | null = null;
      try { previousReservationId = sessionStorage.getItem(CHECKOUT_SESSION_KEY); sessionStorage.setItem(CHECKOUT_ADDRESS_KEY, JSON.stringify(destination)); } catch { /* Optional storage. */ }
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policyVersion: POLICY_VERSION, adultConsent: acceptedPolicies, destination, previousReservationId, items: selected.flatMap((group) => requestedItems(group.items)), sellerSelections: selected.map((group) => ({ sellerId: group.sellerId, shippingSelection: shippingFor(group).selection })) }) });
      const data = await response.json() as { url?: string; reservationId?: string; error?: string; fields?: Record<string, string> };
      if (data.fields) addressRef.current?.setErrors(data.fields);
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout could not be started. Your cart is kept.");
      if (data.reservationId) { try { sessionStorage.setItem(CHECKOUT_SESSION_KEY, data.reservationId); } catch { /* Return cookie also tracks this checkout. */ } }
      window.location.assign(data.url);
    } catch (reason) { setQuotes({}); setRates({}); setError(reason instanceof Error ? reason.message : "Checkout could not be started."); checkoutLock.current = false; setLoading(false); }
  }
  if (!authReady) return <p role="status">Loading your cart…</p>;
  if (!cart.length) return <div className="empty-state cart-empty"><h1>Your cart is empty.</h1><p>Browse current inventory and add a model when you find the right one.</p><Link className="button dark" href="/marketplace">Browse model cars</Link></div>;
  return <div>
    <header className="cart-header"><div><h1>Your cart</h1><p>One payment for all selected sellers. Shipping, tracking, and returns stay separate for each seller.</p></div>{!collector && <p>Guest checkout — no account needed. <Link className="text-link" href="/sign-in?returnTo=/cart">Sign in (optional)</Link></p>}</header>
    <div className="cart-layout"><div className="cart-details">
      {destination && <form ref={addressForm} className="checkout-shipping-form" onSubmit={calculateSelected} aria-labelledby="delivery-address-heading"><h2 id="delivery-address-heading">Delivery address</h2><p>Use one address for this checkout. We’ll carry it into secure payment.</p>
        <AddressFields ref={addressRef} includeName disabled={loading} initialValues={destination} values={destination} onChange={(address) => { revision.current += 1; setDestination(address); setShippingZip(address.zip); setQuotes({}); setRates({}); setCalculating({}); setError(""); try { sessionStorage.setItem(CHECKOUT_ADDRESS_KEY, JSON.stringify(address)); } catch { /* Optional storage. */ } }}/>
        {selected.some((group) => group.items[0].shippingMode === "calculated") && <button className="button outline small" disabled={loading || working}>{working ? "Calculating…" : "Calculate shipping for selected sellers"}</button>}
      </form>}
      <div className="seller-cart-groups">{groups.map((group) => {
        const isSelected = !excluded.includes(group.sellerId), details = shippingFor(group);
        const matching = requests.filter((request) => combinedRequestMatches(request, group.items, destination) && Date.parse(request.expiresAt) > clock && ["pending", "quoted", "declined"].includes(request.status));
        return <section className="seller-cart-group" key={group.sellerId} aria-labelledby={`seller-${group.sellerId}`}>
          <header className="seller-cart-heading"><label className="seller-cart-selection"><input type="checkbox" checked={isSelected} disabled={loading} onChange={() => setExcluded((state) => isSelected ? [...state, group.sellerId] : state.filter((id) => id !== group.sellerId))}/><span id={`seller-${group.sellerId}`}>{group.sellerName}</span></label><p>{isSelected ? "Included in this payment" : "Saved in your cart for later"}</p></header>
          <div className="cart-items">{group.items.map((item) => <article className="cart-item" key={item.productId}>
            {item.imageUrl ? <Image src={item.imageUrl} alt="" width={150} height={150} unoptimized/> : <div className="cart-image-placeholder"/>}
            <div><p className="product-meta">{item.scale} · {item.modelManufacturer}</p><h3><Link href={`/products/${item.slug}`}>{item.title}</Link></h3>{item.availabilityType === "preorder" && item.releaseDate && <p className="cart-preorder-note">Preorder · Expected release {item.releaseDate}</p>}
              <label>Quantity<select value={item.quantity} disabled={loading} onChange={(event) => setQuantity(item.productId, Number(event.target.value))}>{Array.from({ length: Math.min(10, item.availableQuantity) }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label><button className="text-button" type="button" disabled={loading} onClick={() => removeFromCart(item.productId)}>Remove</button>
            </div><b>{money(item.priceCents * item.quantity, item.currency)}</b></article>)}</div>
          <div className="seller-shipping-options"><h3>Shipping from {group.sellerName}</h3>
            <label className="shipping-source"><input type="radio" name={`shipping-source-${group.sellerId}`} checked={(sources[group.sellerId] ?? "standard") === "standard"} disabled={loading} onChange={() => chooseSource(group.sellerId, "standard")}/>Use standard shipping</label>
            {(sources[group.sellerId] ?? "standard") === "standard" && group.items[0].shippingMode === "calculated" && <button className="button outline small" type="button" disabled={loading || calculating[group.sellerId]} onClick={() => void calculate(group)}>{calculating[group.sellerId] ? "Calculating…" : details.quote ? "Refresh carrier options" : "Calculate carrier options"}</button>}
            {details.quote && <fieldset className="shipping-options"><legend>Carrier service</legend>{details.quote.options.map((option) => <label className="shipping-option" key={option.id}><input type="radio" name={`shippingRate-${group.sellerId}`} checked={rates[group.sellerId] === option.id} disabled={loading} onChange={() => setRates((state) => ({ ...state, [group.sellerId]: option.id }))}/><span><b>{option.provider} {option.serviceLevel}</b><small>{option.estimatedDays ? `${option.estimatedDays} business days` : "Carrier estimate unavailable"}</small></span><b>{money(option.amountCents, option.currency)}</b></label>)}</fieldset>}
            {group.items.reduce((sum, item) => sum + item.quantity, 0) >= 2 && <div className="combined-shipping-choice"><p>Ask this seller for one combined shipping price. Your items and delivery address are shared with the seller. Inventory is reserved only when checkout starts.</p>
              {collector ? <button className="button outline small" type="button" disabled={loading || requesting !== null} onClick={() => void requestShipping(group)}>{requesting === group.sellerId ? "Sending request…" : "Request combined shipping quote"}</button> : <Link className="text-link" href="/sign-in?returnTo=/cart">Sign in to request a shipping quote</Link>}
              {matching.map((request) => <label className="shipping-source" key={request.id}><input type="radio" name={`shipping-source-${group.sellerId}`} checked={sources[group.sellerId] === request.id} disabled={loading || request.status === "declined"} onChange={() => chooseSource(group.sellerId, request.id)}/><span>{request.status === "quoted" ? <>Seller quote: <b>{money(request.amountCents!, request.currency)}</b> — {request.carrier} {request.service}, about {request.estimatedDays} business days. Expires {new Date(request.expiresAt).toLocaleString()}.</> : request.status === "pending" ? "Waiting for the seller’s quote" : "The seller could not offer combined shipping."}{request.sellerNote && <small>{request.sellerNote}</small>}</span></label>)}

              {matching.length > 0 && <Link className="text-link" href="/messages#shipping-requests">Manage shipping requests</Link>}
            </div>}
              {(sources[group.sellerId] ?? "standard") !== "standard" && !details.selection && <p className="form-note">This quote is pending, expired, or no longer matches your items and address. Wait for a valid quote, choose standard shipping, or uncheck this seller to buy the other items now.</p>}
            {(details.quote?.insuranceRequired || details.quote?.signatureRequired) && <p className="form-note">Required insurance and signature protection are included.</p>}
            <dl className="seller-shipping-totals"><div><dt>Items</dt><dd>{money(group.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0), group.items[0].currency)}</dd></div><div><dt>Shipping</dt><dd>{details.amount === null ? "Not confirmed" : details.amount === 0 ? "Free" : money(details.amount, group.items[0].currency)}</dd></div></dl><button className="text-button" type="button" disabled={loading} onClick={() => clearSellerCart(group.sellerId)}>Remove items from {group.sellerName}</button>
          </div></section>;
      })}</div>
    </div><aside className="cart-summary" aria-labelledby="order-summary-heading"><h2 id="order-summary-heading">Checkout summary</h2><p>{selected.length} seller{selected.length === 1 ? "" : "s"} · One payment</p>
      <dl><div><dt>Item subtotal</dt><dd>{sameCurrency ? money(subtotal, currency) : "Select sellers using the same currency"}</dd></div><div><dt>Shipping</dt><dd>{shipping === null ? "Confirm each seller’s shipping" : shipping === 0 ? "Free" : money(shipping, currency)}</dd></div>{shipping !== null && <div className="total"><dt>{automaticTax && taxBehavior === "exclusive" ? "Total before tax" : "Total"}</dt><dd>{money(subtotal + shipping, currency)}</dd></div>}</dl>
      <p>{automaticTax ? taxBehavior === "inclusive" ? "Prices include applicable tax. You’ll see the tax breakdown before payment." : "Applicable tax is calculated at checkout and added before payment." : "Tax is not collected at checkout."}</p><p>Each seller ships separately with their own order number, tracking, and returns. Unselected sellers stay in your cart.</p>
      {selected.some((group) => group.items.some((item) => item.availabilityType === "preorder")) && <p className="checkout-preorder-notice">Upcoming releases must be reserved separately on their seller offer. Remove them from this cart; pay through My Preorders once stock is inspected and allocated.</p>}
      <label className="consent-check checkout-consent"><input type="checkbox" checked={acceptedPolicies} disabled={loading} onChange={(event) => setAcceptedPolicies(event.target.checked)}/><span>I am at least 18 years old and agree to the <Link href="/terms">Marketplace Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>, <Link href="/shipping">Shipping Policy</Link>, and <Link href="/returns">Returns &amp; Refunds Policy</Link>.</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}{requestError && <p className="form-error" role="alert">{requestError}</p>}<button className="button dark checkout-button" type="button" disabled={loading || working || requesting !== null || !destination || !acceptedPolicies || !ready} onClick={checkout}>{loading ? "Starting secure checkout…" : excluded.length ? "Checkout selected sellers" : "Checkout all"}</button>
      <p className="checkout-payment-note">Payments are securely processed by Stripe.</p><p className="checkout-guest-note">Use an email you can access at payment. Confirmation and tracking go there. No account is needed for checkout, tracking, or <Link className="text-link" href="/contact">support</Link>.</p>
    </aside></div>
  </div>;
}
