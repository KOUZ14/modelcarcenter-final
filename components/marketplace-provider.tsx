"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CartItem, ProductSummary } from "@/lib/types";
import { cartSellerConflict } from "@/lib/business";
import { authClient } from "@/lib/auth-client";
import { CHECKOUT_ADDRESS_KEY, CHECKOUT_SESSION_KEY } from "@/lib/checkout-address";

type Collector = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  store: { id: string; name: string; status: string } | null;
};
type MarketplaceContextValue = {
  cart: CartItem[];
  wishlist: string[];
  collector: Collector | null;
  authReady: boolean;
  addToCart(product: ProductSummary, quantity?: number): boolean;
  removeFromCart(productId: string): void;
  setQuantity(productId: string, quantity: number): void;
  clearCart(): void;
  toggleWishlist(productId: string): void;
  wishlistHas(productId: string): boolean;
  signOut(): Promise<void>;
};

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);
const CART_KEY = "mcc-cart-v1";
const WISHLIST_KEY = "mcc-wishlist-v1";

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [collector, setCollector] = useState<Collector | null>(null);
  const [mode, setMode] = useState<"loading" | "guest" | "account">("loading");
  const [pendingProduct, setPendingProduct] = useState<{ product: ProductSummary; quantity: number } | null>(null);
  const [pendingMerge, setPendingMerge] = useState<{ saved: CartItem[]; guest: CartItem[] } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      // Close an abandoned payment page before refreshing inventory on back/reload.
      if (window.location.pathname === "/cart") {
        try {
          const reservationId = sessionStorage.getItem(CHECKOUT_SESSION_KEY);
          const response = await fetch("/api/checkout/return", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reservationId }),
          });
          const data = await response.json() as { completedSessionId?: string };
          if (data.completedSessionId) {
            window.location.assign(new URL(`/checkout/success?session_id=${encodeURIComponent(data.completedSessionId)}`, window.location.origin).href);
            return;
          }
          if (response.ok) sessionStorage.removeItem(CHECKOUT_SESSION_KEY);
        } catch { /* Checkout retries cancellation before accepting another payment. */ }
      }
      let guestCart: CartItem[] = [];
      let guestWishlist: string[] = [];
      try {
        const storedCart = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]") as CartItem[];
        const storedWishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? "[]") as string[];
        if (Array.isArray(storedCart)) guestCart = storedCart;
        if (Array.isArray(storedWishlist)) guestWishlist = storedWishlist.filter((item) => typeof item === "string");
      } catch {
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem(WISHLIST_KEY);
      }
      try {
        const response = await fetch("/api/account", { cache: "no-store" });
        const account = await response.json() as {
          authenticated?: boolean;
          user?: { id: string; email: string };
          profile?: { displayName: string; avatarUrl: string | null };
          store?: { id: string; name: string; status: string } | null;
        };
        if (!active) return;
        if (account.authenticated && account.user && account.profile) {
          setCollector({ id: account.user.id, email: account.user.email, displayName: account.profile.displayName, avatarUrl: account.profile.avatarUrl, store: account.store ?? null });
          const merge = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "merge", wishlist: guestWishlist, cart: guestCart.map((item) => ({ productId: item.productId, quantity: item.quantity })) }) });
          const merged = await merge.json() as { conflict?: boolean; wishlist?: string[]; cart?: CartItem[]; guestCart?: CartItem[] };
          if (!active) return;
          setWishlist(merged.wishlist ?? []);
          setCart(merged.cart ?? []);
          if (merged.conflict && merged.guestCart?.length) setPendingMerge({ saved: merged.cart ?? [], guest: merged.guestCart });
          else clearGuestStorage();
          setMode("account");
          return;
        }
      } catch {
        // Account service failures must not block guest browsing or checkout.
      }
      if (guestCart.length) {
        try {
          const response = await fetch("/api/products/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: guestCart.map((item) => item.productId) }),
          });
          const data = (await response.json()) as { products?: ProductSummary[] };
          const fresh = new Map((data.products ?? []).map((product) => [product.id, product]));
          guestCart = guestCart.flatMap((item) => {
            const product = fresh.get(item.productId);
            return product && product.availableQuantity > 0
              ? [cartItemFromProduct(product, Math.min(item.quantity, product.availableQuantity))]
              : [];
          });
        } catch {
          // Preserve the locally saved cart if catalog refresh is temporarily unavailable.
        }
      }
      if (!active) return;
      setCart(guestCart);
      setWishlist(guestWishlist);
      setMode("guest");
    }
    void bootstrap();
    return () => { active = false; };
  }, []);
  useEffect(() => { if (mode === "guest") localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart, mode]);
  useEffect(() => { if (mode === "guest") localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist)); }, [wishlist, mode]);
  useEffect(() => {
    if (!pendingProduct && !pendingMerge) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setPendingProduct(null); setPendingMerge(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingProduct, pendingMerge]);

  const toCartItem = useCallback(
    (product: ProductSummary, quantity: number) =>
      cartItemFromProduct(product, quantity),
    [],
  );
  const persistCart = useCallback((next: CartItem[]) => {
    if (mode !== "account") return;
    void fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cart", items: next.map((item) => ({ productId: item.productId, quantity: item.quantity })) }) });
  }, [mode]);
  const addDirect = useCallback((product: ProductSummary, quantity: number) => {
    const existing = cart.find((item) => item.productId === product.id);
    const next = existing ? cart.map((item) => item.productId === product.id
      ? { ...item, availableQuantity: product.availableQuantity, quantity: Math.min(product.availableQuantity, item.quantity + quantity) }
      : item) : [...cart, toCartItem(product, quantity)];
    setCart(next);
    persistCart(next);
  }, [cart, persistCart, toCartItem]);

  async function resolveMerge(choice: "keep" | "replace") {
    if (!pendingMerge) return;
    const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "merge_choice", choice, cart: pendingMerge.guest.map((item) => ({ productId: item.productId, quantity: item.quantity })) }) });
    const body = await response.json() as { cart?: CartItem[] };
    setCart(body.cart ?? (choice === "keep" ? pendingMerge.saved : pendingMerge.guest));
    setPendingMerge(null);
    clearGuestStorage();
  }

  const value = useMemo<MarketplaceContextValue>(() => ({
    cart, wishlist, collector, authReady: mode !== "loading",
    addToCart(product, quantity = 1) {
      if (cartSellerConflict(cart, product.sellerId)) { setPendingProduct({ product, quantity }); return false; }
      addDirect(product, quantity); return true;
    },
    removeFromCart(productId) { const next = cart.filter((item) => item.productId !== productId); setCart(next); persistCart(next); },
    setQuantity(productId, quantity) { const next = cart.map((item) => item.productId === productId ? { ...item, quantity: Math.min(item.availableQuantity, Math.max(1, Math.trunc(quantity))) } : item); setCart(next); persistCart(next); },
    clearCart() { setCart([]); persistCart([]); clearDeliveryDraft(); },
    toggleWishlist(productId) {
      const saved = !wishlist.includes(productId);
      setWishlist(saved ? [...wishlist, productId] : wishlist.filter((item) => item !== productId));
      if (mode === "account") void fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "wishlist", productId, saved }) });
    },
    wishlistHas(productId) { return wishlist.includes(productId); },
    async signOut() { await authClient.signOut(); clearGuestStorage(); clearDeliveryDraft(); router.push("/"); },
  }), [addDirect, cart, collector, mode, persistCart, router, wishlist]);

  return <MarketplaceContext.Provider value={value}>
    {children}
    {pendingProduct && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingProduct(null); }}><div className="cart-dialog" role="dialog" aria-modal="true" aria-labelledby="seller-conflict-title" tabIndex={-1} ref={dialogRef}><button className="dialog-close" type="button" aria-label="Close" onClick={() => setPendingProduct(null)}>×</button><p className="eyebrow">One seller per checkout</p><h2 id="seller-conflict-title">Your cart has another seller.</h2><p>Your current cart contains products from another seller. Model Car Center currently checks out one seller at a time.</p><div className="dialog-actions"><button className="button outline" type="button" onClick={() => setPendingProduct(null)}>Keep current cart</button><button className="button dark" type="button" onClick={() => { const next = [toCartItem(pendingProduct.product, pendingProduct.quantity)]; setCart(next); persistCart(next); setPendingProduct(null); }}>Clear cart &amp; add new model</button></div></div></div>}
    {pendingMerge && <div className="dialog-backdrop" role="presentation"><div className="cart-dialog" role="dialog" aria-modal="true" aria-labelledby="merge-conflict-title" tabIndex={-1} ref={dialogRef}><p className="eyebrow">Saved cart</p><h2 id="merge-conflict-title">You already have items from another seller in your saved cart.</h2><p>Choose which single-seller cart you want to keep. Neither cart will be changed until you decide.</p><div className="dialog-actions"><button className="button outline" type="button" onClick={() => void resolveMerge("keep")}>Keep saved cart</button><button className="button dark" type="button" onClick={() => void resolveMerge("replace")}>Replace saved cart with this cart</button></div></div></div>}
  </MarketplaceContext.Provider>;
}

function cartItemFromProduct(product: ProductSummary, quantity: number): CartItem {
  return {
    productId: product.id,
    slug: product.slug,
    sellerId: product.sellerId,
    sellerName: product.sellerName,
    title: product.title,
    scale: product.scale,
    modelManufacturer: product.modelManufacturer,
    imageUrl: product.primaryImageUrl,
    priceCents: product.priceCents,
    currency: product.currency,
    availableQuantity: product.availableQuantity,
    availabilityType: product.availabilityType,
    releaseDate: product.releaseDate,
    shippingCents: product.defaultShippingCents,
    shippingMode:
      product.sellerType === "collector" ? "calculated" : product.shippingMode,
    quantity: Math.min(Math.max(1, quantity), product.availableQuantity),
  };
}

function clearGuestStorage() {
  localStorage.removeItem(CART_KEY);
  localStorage.removeItem(WISHLIST_KEY);
}

function clearDeliveryDraft() {
  try { sessionStorage.removeItem(CHECKOUT_ADDRESS_KEY); sessionStorage.removeItem(CHECKOUT_SESSION_KEY); } catch { /* Storage may be disabled. */ }
}

export function useMarketplace() {
  const value = useContext(MarketplaceContext);
  if (!value) throw new Error("useMarketplace must be used inside MarketplaceProvider.");
  return value;
}
