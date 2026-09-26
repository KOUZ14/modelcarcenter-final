"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AddressFields, type AddressFieldsHandle } from "./address-fields";
import { useMarketplace } from "./marketplace-provider";
import { formatCondition, formatMoney as money } from "@/lib/format";
import { POLICY_VERSION } from "@/lib/legal";
import { getShippingZip, setShippingZip } from "@/lib/shipping-destination";
import { CHECKOUT_ADDRESS_KEY, CHECKOUT_SESSION_KEY, checkoutAddressKey, readCheckoutAddressDraft } from "@/lib/checkout-address";
import type { NormalizedShippingAddress } from "@/lib/shipping-rules";
import type { CartItem } from "@/lib/types";
import type { CombinedShippingRequest } from "@/lib/combined-shipping";
import { combinedRequestMatches } from "@/lib/combined-shipping-display";
import { groupCartBySeller } from "@/lib/cart-groups";
import { parseCheckoutShippingAddress } from "@/lib/shipping-rules";
import { trackEvent } from "@/lib/analytics-client";
import { REFUND_REQUEST_DAYS_AFTER_DELIVERY } from "@/lib/protection";
import { useTaskMeasurement } from "./use-task-measurement";

type Rate = { id: string; provider: string; serviceLevel: string; amountCents: number; currency: string; estimatedDays: number | null };
type Quote = { cartKey: string; addressKey: string; quoteId: string | null; expiresAt: string | null; options: Rate[]; insuranceRequired?: boolean; signatureRequired?: boolean };
const itemKey = (items: CartItem[]) => JSON.stringify(items.map((item) => [item.productId, item.quantity, item.priceCents, item.currency, item.shippingMode, item.shippingCents]));
const requestedItems = (items: CartItem[]) => items.map(({ productId, quantity }) => ({ productId, quantity }));

export function CartPage({ automaticTax, taxBehavior }: { automaticTax: boolean; taxBehavior: "exclusive" | "inclusive" }) {
  const task = useTaskMeasurement("checkout");
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
  const automaticAttempt = useRef("");
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
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const selected = groups.filter((group) => groups.length === 1 || !excluded.includes(group.sellerId));
  const addressKey = destination ? checkoutAddressKey(destination) : "";
  let addressComplete = false;
  try { parseCheckoutShippingAddress(destination); addressComplete = true; } catch { /* Explain incomplete fields below. */ }
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
  const fixedShipping = selected.length > 0 && selected.every((group) => (sources[group.sellerId] ?? "standard") === "standard" && group.items[0].shippingMode !== "calculated");
  const totalLabel = automaticTax && taxBehavior === "inclusive" ? "Total (tax included)" : "Total before tax";
  function goToSection(id: string) {
    const element = document.getElementById(id);
    element?.focus();
    element?.scrollIntoView({ block: "start" });
  }
  function enterDelivery() { addressRef.current?.focusFirstInvalid(); }
  function nextStep() {
    if (!selected.length || !sameCurrency) goToSection("seller-selection");
    else if (!addressComplete) enterDelivery();
    else if (!ready) goToSection("shipping-step");
    else if (!acceptedPolicies) goToSection("order-summary-heading");
    else void checkout();
  }
  async function calculate(group: typeof groups[number], automatic = false) {
    if (loading || calculating[group.sellerId] || !destination || !addressComplete || (!automatic && !addressForm.current?.reportValidity())) return;
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
    await Promise.all(selected.filter((group) => group.items[0].shippingMode === "calculated" && (sources[group.sellerId] ?? "standard") === "standard").map(group => calculate(group)));
  }
  const automaticKey = JSON.stringify([addressKey, selected.map(group => [group.sellerId, itemKey(group.items), sources[group.sellerId] ?? "standard", quotes[group.sellerId]?.expiresAt ?? ""])]);
  useEffect(() => {
    if (!addressComplete || loading || automaticAttempt.current === automaticKey) return;
    const timer = setTimeout(() => {
      automaticAttempt.current = automaticKey;
      void Promise.all(selected.filter(group => group.items[0].shippingMode === "calculated" && (sources[group.sellerId] ?? "standard") === "standard" && !shippingFor(group).selection).map(group => calculate(group, true)));
    }, 650);
    return () => clearTimeout(timer);
    // The serialized key covers address, cart, selected sellers and quote changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automaticKey, addressComplete, loading]);
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
    // Recheck the deadline at payment even if a background tab delayed its timer.
    // eslint-disable-next-line react-hooks/purity -- Payment click handlers must check the current quote expiry, not the last rendered clock.
    const checkoutTime = Date.now();
    if (selected.some((group) => !shippingFor(group, checkoutTime).selection)) { setClock(checkoutTime); setError("A shipping quote expired. Refresh carrier options or choose standard shipping before paying."); return; }
    checkoutLock.current = true; setLoading(true); setError("");
    trackEvent("shipping_completed", { result: "success", count: selected.length });
    trackEvent("checkout_started", { count: selected.length });
    try {
      let previousReservationId: string | null = null;
      try { previousReservationId = sessionStorage.getItem(CHECKOUT_SESSION_KEY); sessionStorage.setItem(CHECKOUT_ADDRESS_KEY, JSON.stringify(destination)); } catch { /* Optional storage. */ }
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policyVersion: POLICY_VERSION, adultConsent: acceptedPolicies, destination, previousReservationId, items: selected.flatMap((group) => requestedItems(group.items)), sellerSelections: selected.map((group) => ({ sellerId: group.sellerId, shippingSelection: shippingFor(group).selection })) }) });
      const data = await response.json() as { url?: string; reservationId?: string; error?: string; fields?: Record<string, string> };
      if (data.fields) addressRef.current?.setErrors(data.fields);
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout could not be started. Your cart is kept.");
      if (data.reservationId) { try { sessionStorage.setItem(CHECKOUT_SESSION_KEY, data.reservationId); } catch { /* Return cookie also tracks this checkout. */ } }
      task.complete(); window.location.assign(data.url);
    } catch (reason) { setQuotes({}); setRates({}); setError(reason instanceof Error ? reason.message : "Checkout could not be started."); checkoutLock.current = false; setLoading(false); }
  }
  function shippingControls(group: typeof groups[number]) {
    const details = shippingFor(group);
    const itemCount = group.items.reduce((sum, item) => sum + item.quantity, 0);
        const matching = requests.filter((request) => combinedRequestMatches(request, group.items, destination) && Date.parse(request.expiresAt) > clock && ["pending", "quoted", "declined"].includes(request.status));
        const source = sources[group.sellerId] ?? "standard";
        const selectedRequest = matching.find((request) => request.id === source);
        const fixed = source === "standard" && group.items[0].shippingMode !== "calculated";
        const dispatchDays = group.items[0].handlingTimeBusinessDays;
        const shippingLabel = details.amount !== null
          ? details.amount === 0 ? "Free" : money(details.amount, group.items[0].currency)
          : source === "standard" ? "Calculate rates" : selectedRequest?.status === "pending" ? "Awaiting quote" : "Review quote";
    return <details className="cart-shipping-disclosure" open={addressComplete} key={group.sellerId}>
            <summary><span>{group.sellerName}<small>{fixed ? "Fixed rate per order" : source === "standard" ? "Carrier quote" : "Seller quote"}</small></span><strong>{shippingLabel}</strong></summary>
            <div className="seller-shipping-options">
              <label className="shipping-source"><input type="radio" name={`shipping-source-${group.sellerId}`} checked={source === "standard"} disabled={loading} onChange={() => chooseSource(group.sellerId, "standard")}/>{group.items[0].shippingMode === "calculated" ? "Use carrier rates" : group.items[0].shippingMode === "free" ? "Use free shipping" : "Use flat-rate shipping"}</label>
              <p className="cart-dispatch-note">{dispatchDays != null ? `Dispatch within ${dispatchDays} business day${dispatchDays === 1 ? "" : "s"}.` : "Dispatch time not specified."}{fixed && " Carrier and delivery time not specified."}</p>
              {source === "standard" && group.items[0].shippingMode === "calculated" && <button className="button outline small" type="button" disabled={loading || calculating[group.sellerId]} onClick={() => addressComplete ? void calculate(group) : enterDelivery()}>{calculating[group.sellerId] ? "Calculating…" : !addressComplete ? "Enter delivery details for rates" : details.quote ? "Refresh carrier options" : "Calculate carrier options"}</button>}
              {details.quote && <fieldset className="shipping-options"><legend>Carrier service</legend>{details.quote.options.map((option) => <label className="shipping-option" key={option.id}><input type="radio" name={`shippingRate-${group.sellerId}`} checked={rates[group.sellerId] === option.id} disabled={loading} onChange={() => setRates((state) => ({ ...state, [group.sellerId]: option.id }))}/><span><b>{option.provider} {option.serviceLevel}</b><small>{option.estimatedDays ? `Estimated ${option.estimatedDays} business days in transit after dispatch` : "Carrier estimate unavailable"}</small></span><b>{money(option.amountCents, option.currency)}</b></label>)}</fieldset>}
              {itemCount >= 2 && <details className="combined-shipping-disclosure">
                <summary>Request combined shipping</summary>
                <div className="combined-shipping-choice">
                  <p>Shares these items and your delivery address with this seller. Stock is reserved at checkout.</p>
                  {collector ? <button className="button outline small" type="button" disabled={loading || requesting !== null} onClick={() => void requestShipping(group)}>{requesting === group.sellerId ? "Sending request…" : "Request combined shipping quote"}</button> : <Link className="text-link" href="/sign-in?returnTo=/cart">Sign in to request a shipping quote</Link>}
                </div>
              </details>}
              {matching.map((request) => <label className="shipping-source" key={request.id}><input type="radio" name={`shipping-source-${group.sellerId}`} checked={source === request.id} disabled={loading || request.status === "declined"} onChange={() => chooseSource(group.sellerId, request.id)}/><span>{request.status === "quoted" ? <>Seller quote: <b>{money(request.amountCents!, request.currency)}</b> - {request.carrier} {request.service}{request.estimatedDays != null && <>, estimated {request.estimatedDays} business days in transit after dispatch</>}. Expires {new Date(request.expiresAt).toLocaleString()}.</> : request.status === "pending" ? "Waiting for the seller’s quote" : "The seller could not offer combined shipping."}{request.sellerNote && <small>{request.sellerNote}</small>}</span></label>)}
              {matching.length > 0 && <Link className="text-link" href="/messages#shipping-requests">Manage shipping requests</Link>}
              {source !== "standard" && !details.selection && <p className="form-note">No valid quote for these items and address. Choose standard shipping, wait for a new quote, or uncheck this seller.</p>}
              {(details.quote?.insuranceRequired || details.quote?.signatureRequired) && <p className="form-note">Required insurance and signature protection are included.</p>}
            </div>
          </details>;
  }
  if (!authReady) return <p role="status">Loading your cart…</p>;
  if (!cart.length) return <div className="empty-state cart-empty"><h1>Your cart is empty.</h1><p>Browse current inventory and add a model when you find the right one.</p><Link className="button dark" href="/marketplace">Browse model cars</Link></div>;
  const blockedReason = !selected.length ? "Select at least one seller to continue." : !sameCurrency ? "Select sellers using the same currency." : !addressComplete ? "Complete your delivery name and address to continue." : working ? "Calculating shipping…" : !ready ? "Choose shipping for each selected seller." : !acceptedPolicies ? "Confirm the age and policy agreement to continue to payment." : requesting ? "Wait for your shipping request to finish." : "";
  const blockerTarget = !selected.length || !sameCurrency ? "seller-selection" : !addressComplete ? "delivery-address-heading" : !ready ? "shipping-step" : !acceptedPolicies ? "checkout-agreement" : null;
  const nextLabel = loading ? "Starting checkout…" : !selected.length || !sameCurrency ? "Select sellers" : !addressComplete ? "Enter delivery details" : working ? "Calculating…" : requesting ? "Sending request…" : !ready ? "Choose shipping" : !acceptedPolicies ? "Review order" : "Continue to payment";
  return <div>
    <header className="cart-header">
      <div><h1>Your cart</h1><p>{totalItems} item{totalItems === 1 ? "" : "s"} from {groups.length} seller{groups.length === 1 ? "" : "s"}</p></div>
      <Link className="text-link cart-browse-link" href="/marketplace">Browse models</Link>
    </header>
    <nav className="cart-progress" aria-label="Cart sections"><ol><li><a href="#delivery-address-heading" aria-current={!addressComplete ? "step" : undefined}><span>1</span>Delivery</a></li><li><a href="#shipping-step" aria-current={addressComplete && !ready ? "step" : undefined}><span>2</span>Shipping</a></li><li><a href="#order-summary-heading" aria-current={addressComplete && ready ? "step" : undefined}><span>3</span>Order summary</a></li></ol></nav>
    <div className="cart-layout"><div className="cart-details">
      <section aria-label="Items by seller"><p className="cart-selection-help" id="seller-selection" tabIndex={-1}>{groups.length > 1 ? "Select sellers to check out now. Other items stay in your cart." : "Review your items before checkout."}</p>
      <div className="seller-cart-groups">{groups.map((group) => {
        const isSelected = groups.length === 1 || !excluded.includes(group.sellerId);
        const itemCount = group.items.reduce((sum, item) => sum + item.quantity, 0);
        return <section className="seller-cart-group" key={group.sellerId} aria-labelledby={`seller-${group.sellerId}`}>
          <header className="seller-cart-heading">
            <label className="seller-cart-selection">{groups.length > 1 && <input type="checkbox" checked={isSelected} disabled={loading} onChange={() => setExcluded((state) => isSelected ? [...state, group.sellerId] : state.filter((id) => id !== group.sellerId))}/>}<span id={`seller-${group.sellerId}`}>{group.sellerName}</span></label>
            <p>{itemCount} item{itemCount === 1 ? "" : "s"} · {money(group.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0), group.items[0].currency)}{!isSelected && " · Saved for later"}</p>
          </header>
          <div className="cart-items">{group.items.map((item) => <article className="cart-item" key={item.productId}>
            <Link className="cart-item-image" href={`/products/${item.slug}`} aria-label={`View ${item.title}`}>
              {item.imageUrl ? <Image src={item.imageUrl} alt="" width={88} height={88} style={{ objectFit: "contain" }} unoptimized/> : <div className="cart-image-placeholder"/>}
            </Link>
            <div className="cart-item-content">
              <h3><Link href={`/products/${item.slug}`}>{item.title}</Link></h3>
              <p className="product-meta">{item.scale} · {item.modelManufacturer}</p>
              <p className="cart-item-condition">Condition: {formatCondition(item.modelCondition || "not_specified")}</p>
              <p className="cart-item-packaging">Packaging: {formatCondition(item.packagingCondition || "not_specified")} · Original box: {formatCondition(item.originalBoxStatus || "not_specified")}</p>
              {item.availabilityType === "preorder" && item.releaseDate && <p className="cart-preorder-note">Preorder · Expected release {item.releaseDate}</p>}
              <div className="cart-item-controls">
                <label>Qty<select aria-label={`Quantity for ${item.title}`} value={item.quantity} disabled={loading} onChange={(event) => setQuantity(item.productId, Number(event.target.value))}>{Array.from({ length: Math.min(10, item.availableQuantity) }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
                <button className="text-button" type="button" aria-label={`Remove ${item.title} from cart`} disabled={loading} onClick={() => removeFromCart(item.productId)}>Remove</button>
                <b>{money(item.priceCents * item.quantity, item.currency)}</b>
              </div>
            </div>
          </article>)}</div>
          {group.items.length > 1 && <button className="text-button cart-remove-seller" type="button" disabled={loading} onClick={() => clearSellerCart(group.sellerId)}>Remove all from {group.sellerName}</button>}
        </section>;
      })}</div></section>
      {destination && <form ref={addressForm} className="checkout-shipping-form" onSubmit={calculateSelected} aria-labelledby="delivery-address-heading">
        <h2 id="delivery-address-heading" tabIndex={-1}>Delivery details</h2><p>Saved in this tab for secure checkout.</p>
        <AddressFields ref={addressRef} includeName compactHelp disabled={loading} initialValues={destination} values={destination} onChange={(address) => { task.start(); automaticAttempt.current = ""; revision.current += 1; setDestination(address); setShippingZip(address.zip); setQuotes({}); setRates({}); setCalculating({}); setError(""); try { sessionStorage.setItem(CHECKOUT_ADDRESS_KEY, JSON.stringify(address)); } catch { /* Optional storage. */ } }}/>
      </form>}
      <section className="checkout-carrier-groups" aria-labelledby="shipping-step"><h2 id="shipping-step" tabIndex={-1}>Shipping</h2><p className="cart-shipping-help">{fixedShipping ? "Fixed seller rates per order, confirmed before payment." : "Carrier rates calculate after delivery details are complete. Quotes can expire; final charges are confirmed before payment."}{groups.length > 1 && " Each seller ships separately."}</p>{!selected.length && <p>Select a seller to review shipping.</p>}{selected.map(shippingControls)}</section>
    </div><aside className="cart-summary" aria-labelledby="order-summary-heading"><h2 id="order-summary-heading" tabIndex={-1}>Order summary</h2><p>{selected.length} seller{selected.length === 1 ? "" : "s"} selected · Payment is next</p>
      <dl><div><dt>Item subtotal</dt><dd>{sameCurrency ? money(subtotal, currency) : "Select one currency"}</dd></div><div><dt>Shipping{fixedShipping && <small>Fixed seller rates</small>}</dt><dd>{shipping === null ? "Not yet confirmed" : shipping === 0 ? "Free" : money(shipping, currency)}</dd></div>{shipping !== null && <div className="total"><dt>{totalLabel}</dt><dd>{money(subtotal + shipping, currency)}</dd></div>}</dl>
      <p>{automaticTax ? taxBehavior === "inclusive" ? "Tax is included. Review the breakdown at secure payment." : "Tax and the final total appear at secure payment, before you pay." : "Tax is not collected at checkout."}</p>
      <p>Damage or inaccurate listing? Submit a platform request within {REFUND_REQUEST_DAYS_AFTER_DELIVERY} calendar days after recorded delivery. Change-of-mind returns follow the seller’s policy. <Link href="/protection">Protection deadlines</Link> · <Link href="/returns">Returns &amp; postage</Link></p>
      {selected.some((group) => group.items.some((item) => item.availabilityType === "preorder")) && <p className="checkout-preorder-notice">Upcoming releases must be reserved separately on their seller offer. Remove them from this cart; pay through My Orders once stock is inspected and allocated.</p>}
      <label className="consent-check checkout-consent"><input id="checkout-agreement" type="checkbox" checked={acceptedPolicies} disabled={loading} onChange={(event) => setAcceptedPolicies(event.target.checked)}/><span>I am at least 18 years old and agree to the <Link href="/terms">Marketplace Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>, <Link href="/shipping">Shipping Policy</Link>, and <Link href="/returns">Returns &amp; Refunds Policy</Link>.</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}{requestError && <p className="form-error" role="alert">{requestError}</p>}{blockedReason && <p id="checkout-blocker" className="checkout-blocker" role="status">{blockerTarget && !working && !requesting ? <a href={`#${blockerTarget}`} onClick={(event) => { event.preventDefault(); if (blockerTarget === "delivery-address-heading") enterDelivery(); else goToSection(blockerTarget); }}>{blockedReason}</a> : blockedReason}</p>}<button className="button dark checkout-button" type="button" aria-describedby={blockedReason ? "checkout-blocker" : undefined} disabled={loading || working || requesting !== null || !addressComplete || !acceptedPolicies || !ready} onClick={checkout}>{loading ? "Starting secure checkout…" : "Continue to secure payment"}</button>
      <p className="checkout-payment-note">Secure payment by Stripe.{!collector && <> No account needed. <Link className="text-link" href="/sign-in?returnTo=/cart">Sign in</Link></>}</p>
    </aside></div>
    <div className="cart-mobile-summary" role="region" aria-label="Cart total and next step"><div aria-live="polite" aria-atomic="true"><span>{!selected.length || !sameCurrency ? "Order total" : shipping === null ? "Item subtotal" : totalLabel}</span><strong>{selected.length && sameCurrency ? money(subtotal + (shipping ?? 0), currency) : "-"}</strong>{selected.length > 0 && sameCurrency && shipping === null && <small>+ shipping{automaticTax && taxBehavior === "exclusive" ? " & tax" : ""}</small>}</div><button type="button" className="button dark" disabled={loading || working || requesting !== null} onClick={nextStep}>{nextLabel}</button></div>
  </div>;
}
