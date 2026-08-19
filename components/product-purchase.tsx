"use client";

import { useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { useMarketplace } from "./marketplace-provider";
import { Icon } from "./icons";

export function ProductPurchase({ product }: { product: ProductSummary }) {
  const { addToCart, toggleWishlist, wishlistHas } = useMarketplace();
  const [added, setAdded] = useState(false);
  const saved = wishlistHas(product.id);
  return <div className="purchase-actions"><button className="button dark buy-button" type="button" disabled={product.availableQuantity < 1} onClick={() => { if (addToCart(product)) { setAdded(true); setTimeout(() => setAdded(false), 1800); } }}>{added ? <><Icon name="check"/> Added to cart</> : "Add to cart"}</button><button className="button outline" type="button" aria-pressed={saved} onClick={() => toggleWishlist(product.id)}><Icon name="heart"/>{saved ? "Saved" : "Save model"}</button></div>;
}
