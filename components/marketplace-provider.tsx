"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CartItem, ProductSummary } from "@/lib/types";
import { removePurchasedItems } from "@/lib/cart-groups";
import { authClient } from "@/lib/auth-client";
import { CHECKOUT_ADDRESS_KEY, CHECKOUT_SESSION_KEY } from "@/lib/checkout-address";
import { trackEvent } from "@/lib/analytics-client";

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
  clearSellerCart(sellerId: string): void;
  completeCheckout(sessionId: string, items: Array<{ productId: string | null; quantity: number }>): void;
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
  const [cartError, setCartError] = useState("");
  const cartWrites = useRef(Promise.resolve());
  const completedSessions = useRef(new Set<string>());

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
          const merged = await merge.json() as { wishlist?: string[]; cart?: CartItem[]; error?: string };
          if (!active) return;
          if (!merge.ok || !merged.cart) throw new Error(merged.error || "Your saved cart could not be loaded.");
          setWishlist(merged.wishlist ?? []);
          setCart(merged.cart ?? []);
          clearGuestStorage();
          setMode("account");
          return;
        }
      } catch {
        // Account service failures must not block guest browsing or checkout.
        if (active) setCartError("Your saved cart could not be synced. Items on this device are kept, and your saved account cart is unchanged. Reload to retry.");
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
          if (response.ok && data.products) guestCart = guestCart.flatMap((item) => {
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
  useEffect(() => { if (mode === "guest") { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Keep the in-memory cart. */ } } }, [cart, mode]);
  useEffect(() => { if (mode === "guest") { try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist)); } catch { /* Keep the in-memory wishlist. */ } } }, [wishlist, mode]);
  const toCartItem = useCallback(
    (product: ProductSummary, quantity: number) =>
      cartItemFromProduct(product, quantity),
    [],
  );
  const persistCart = useCallback((next: CartItem[]) => {
    if (mode !== "account") return;
    const checkoutMarkers = [...completedSessions.current].map((sessionId) => `mcc-completed-checkout-${collector?.id ?? "guest"}-${sessionId}`);
    cartWrites.current = cartWrites.current.then(async () => {
      const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cart", items: next.map((item) => ({ productId: item.productId, quantity: item.quantity })) }) });
      if (!response.ok) throw new Error("Cart sync failed.");
      try { checkoutMarkers.forEach((key) => localStorage.setItem(key, "1")); } catch { /* Storage may be disabled. */ }
      setCartError("");
    }).catch(() => { setCartError("Your cart changes could not be saved to your account. Please retry before leaving this page."); });
  }, [collector?.id, mode]);
  const addDirect = useCallback((product: ProductSummary, quantity: number) => {
    const existing = cart.find((item) => item.productId === product.id);
    const next = existing ? cart.map((item) => item.productId === product.id
      ? toCartItem(product, item.quantity + quantity)
      : item) : [...cart, toCartItem(product, quantity)];
    setCart(next);
    persistCart(next);
  }, [cart, persistCart, toCartItem]);

  const value = useMemo<MarketplaceContextValue>(() => ({
    cart, wishlist, collector, authReady: mode !== "loading",
    addToCart(product, quantity = 1) {
      if (mode === "loading") return false;
      if (product.availabilityType === "preorder") { setCartError("Reserve this upcoming model on its seller offer. Pay through My Orders when stock is ready."); return false; }
      if (cart.length >= 25 && !cart.some((item) => item.productId === product.id)) {
        setCartError("Your cart can hold up to 25 products. Check out a seller before adding more; your existing items are kept.");
        return false;
      }
      addDirect(product, quantity); trackEvent("add_to_cart", { count: quantity }); return true;
    },
    removeFromCart(productId) { const next = cart.filter((item) => item.productId !== productId); setCart(next); persistCart(next); },
    setQuantity(productId, quantity) { const next = cart.map((item) => item.productId === productId ? { ...item, quantity: Math.min(10, item.availableQuantity, Math.max(1, Math.trunc(quantity))) } : item); setCart(next); persistCart(next); },
    clearCart() { setCart([]); persistCart([]); clearDeliveryDraft(); },
    clearSellerCart(sellerId) {
      const next = cart.filter((item) => item.sellerId !== sellerId);
      setCart(next); persistCart(next);
    },
    completeCheckout(sessionId, items) {
      if (mode === "loading" || completedSessions.current.has(sessionId)) return;
      const key = `mcc-completed-checkout-${collector?.id ?? "guest"}-${sessionId}`;
      try { if (localStorage.getItem(key)) return; } catch { /* In-memory guard still applies. */ }
      completedSessions.current.add(sessionId);
      clearDeliveryDraft();
      const next = removePurchasedItems(cart, items);
      setCart(next); persistCart(next);
      try {
        if (mode === "guest") {
          localStorage.setItem(CART_KEY, JSON.stringify(next));
          localStorage.setItem(key, "1");
        }
      } catch { /* Storage may be disabled. */ }
    },
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
    {cartError && <div className="cart-sync-notice" role="alert"><p>{cartError}</p>{mode === "account" && <button className="text-button" type="button" onClick={() => persistCart(cart)}>Retry saving cart</button>}</div>}
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
    modelCondition: product.modelCondition,
    packagingCondition: product.packagingCondition,
    originalBoxStatus: product.originalBoxStatus,
    handlingTimeBusinessDays: product.handlingTimeBusinessDays,
    imageUrl: product.primaryImageUrl,
    priceCents: product.priceCents,
    currency: product.currency,
    availableQuantity: product.availableQuantity,
    availabilityType: product.availabilityType,
    releaseDate: product.releaseDate,
    shippingCents: product.defaultShippingCents,
    shippingMode:
      product.sellerType === "collector" ? "calculated" : product.shippingMode,
    quantity: Math.min(10, Math.max(1, quantity), product.availableQuantity),
  };
}

function clearGuestStorage() {
  try { localStorage.removeItem(CART_KEY); localStorage.removeItem(WISHLIST_KEY); } catch { /* Storage may be disabled. */ }
}

function clearDeliveryDraft() {
  try { sessionStorage.removeItem(CHECKOUT_ADDRESS_KEY); sessionStorage.removeItem(CHECKOUT_SESSION_KEY); } catch { /* Storage may be disabled. */ }
}

export function useMarketplace() {
  const value = useContext(MarketplaceContext);
  if (!value) throw new Error("useMarketplace must be used inside MarketplaceProvider.");
  return value;
}
