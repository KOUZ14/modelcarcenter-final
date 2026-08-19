"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, ProductSummary } from "@/lib/types";
import { cartSellerConflict } from "@/lib/business";

type MarketplaceContextValue = {
  cart: CartItem[];
  wishlist: string[];
  addToCart(product: ProductSummary, quantity?: number): boolean;
  removeFromCart(productId: string): void;
  setQuantity(productId: string, quantity: number): void;
  clearCart(): void;
  toggleWishlist(productId: string): void;
  wishlistHas(productId: string): boolean;
};

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);
const CART_KEY = "mcc-cart-v1";
const WISHLIST_KEY = "mcc-wishlist-v1";

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<{ product: ProductSummary; quantity: number } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const storedCart = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]") as CartItem[];
        const storedWishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? "[]") as string[];
        if (Array.isArray(storedCart)) setCart(storedCart);
        if (Array.isArray(storedWishlist)) setWishlist(storedWishlist.filter((item) => typeof item === "string"));
      } catch {
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem(WISHLIST_KEY);
      }
      setReady(true);
    });
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart, ready]);
  useEffect(() => { if (ready) localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist)); }, [wishlist, ready]);
  useEffect(() => {
    if (!pendingProduct) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPendingProduct(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingProduct]);

  const toCartItem = useCallback((product: ProductSummary, quantity: number): CartItem => ({
    productId: product.id, slug: product.slug, sellerId: product.sellerId, sellerName: product.sellerName,
    title: product.title, scale: product.scale, modelManufacturer: product.modelManufacturer,
    imageUrl: product.primaryImageUrl, priceCents: product.priceCents, currency: product.currency,
    availableQuantity: product.availableQuantity, shippingCents: product.defaultShippingCents,
    quantity: Math.min(Math.max(1, quantity), product.availableQuantity),
  }), []);
  const addDirect = useCallback((product: ProductSummary, quantity: number) => {
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) return current.map((item) => item.productId === product.id
        ? { ...item, availableQuantity: product.availableQuantity, quantity: Math.min(product.availableQuantity, item.quantity + quantity) }
        : item);
      return [...current, toCartItem(product, quantity)];
    });
  }, [toCartItem]);

  const value = useMemo<MarketplaceContextValue>(() => ({
    cart, wishlist,
    addToCart(product, quantity = 1) {
      if (cartSellerConflict(cart, product.sellerId)) { setPendingProduct({ product, quantity }); return false; }
      addDirect(product, quantity); return true;
    },
    removeFromCart(productId) { setCart((current) => current.filter((item) => item.productId !== productId)); },
    setQuantity(productId, quantity) { setCart((current) => current.map((item) => item.productId === productId ? { ...item, quantity: Math.min(item.availableQuantity, Math.max(1, Math.trunc(quantity))) } : item)); },
    clearCart() { setCart([]); },
    toggleWishlist(productId) { setWishlist((current) => current.includes(productId) ? current.filter((item) => item !== productId) : [...current, productId]); },
    wishlistHas(productId) { return wishlist.includes(productId); },
  }), [addDirect, cart, wishlist]);

  return <MarketplaceContext.Provider value={value}>
    {children}
    {pendingProduct && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingProduct(null); }}>
      <div className="cart-dialog" role="dialog" aria-modal="true" aria-labelledby="seller-conflict-title" tabIndex={-1} ref={dialogRef}>
        <button className="dialog-close" type="button" aria-label="Close" onClick={() => setPendingProduct(null)}>×</button>
        <p className="eyebrow">One seller per checkout</p><h2 id="seller-conflict-title">Your cart has another seller.</h2>
        <p>Your current cart contains products from another seller. Model Car Center currently checks out one seller at a time.</p>
        <div className="dialog-actions"><button className="button outline" type="button" onClick={() => setPendingProduct(null)}>Keep current cart</button><button className="button dark" type="button" onClick={() => { setCart([toCartItem(pendingProduct.product, pendingProduct.quantity)]); setPendingProduct(null); }}>Clear cart &amp; add new model</button></div>
      </div>
    </div>}
  </MarketplaceContext.Provider>;
}

export function useMarketplace() {
  const value = useContext(MarketplaceContext);
  if (!value) throw new Error("useMarketplace must be used inside MarketplaceProvider.");
  return value;
}
