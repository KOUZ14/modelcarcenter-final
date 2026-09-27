"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { formatCondition, formatMoney } from "@/lib/format";
import { useMarketplace } from "./marketplace-provider";
import { Icon } from "./icons";

export function SavedListingCard({ product }: { product: ProductSummary }) {
  const { addToCart, authReady, cart, toggleWishlist } = useMarketplace();
  const [added, setAdded] = useState(false);
  const inCart = cart.find(item => item.productId === product.id)?.quantity ?? 0;
  const atLimit = inCart >= Math.min(10, product.availableQuantity);
  const canBuy = product.availabilityType !== "preorder" && product.availableQuantity > 0;
  const shippingMode = product.sellerType === "collector" ? "calculated" : product.shippingMode;
  const href = `/products/${product.slug}`;

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1800);
    return () => clearTimeout(timer);
  }, [added]);

  return <article className="saved-listing-card" aria-label={`${product.title} from ${product.sellerName}`}>
    <Link className="saved-listing-photo" href={href} aria-label={`View ${product.title}`}>
      {product.primaryImageUrl ? <Image src={product.primaryImageUrl} alt={`${product.modelManufacturer} ${product.title}`} fill style={{ objectFit: "contain" }} sizes="(max-width: 820px) 96px, 160px" unoptimized /> : <span>No photo</span>}
    </Link>
    <div className="saved-listing-details">
      <h3><Link href={href}>{product.title}</Link></h3>
      <p className="saved-listing-specs">{product.scale} · {product.modelManufacturer} · {formatCondition(product.modelCondition)}</p>
      <p className="saved-listing-price">{product.availabilityType === "preorder" && !product.priceCents ? "Price to be announced" : formatMoney(product.priceCents, product.currency)}</p>
    </div>
    <div className="saved-listing-delivery">
      <p>Sold by <Link href={`/sellers/${product.sellerSlug}`}>{product.sellerName}</Link></p>
      <p>{product.availabilityType === "preorder" ? "Preorder · See release and shipping terms" : product.availableQuantity < 1 ? "Currently unavailable" : <>{shippingMode === "calculated" ? "Shipping calculated at checkout" : shippingMode === "free" || product.defaultShippingCents === 0 ? "Free shipping" : `${formatMoney(product.defaultShippingCents, product.currency)} shipping per seller order`} · In stock</>}</p>
    </div>
    <div className="saved-listing-actions">
      {canBuy ? atLimit && !added ? <Link className="button dark saved-listing-buy" href="/cart">View cart</Link> : <button className="button dark saved-listing-buy" type="button" disabled={!authReady || added} onClick={() => {
        if (authReady && !atLimit && !added && addToCart(product)) setAdded(true);
      }}><Icon name={added ? "check" : "bag"}/>{added ? "Added to cart" : "Add to cart"}</button>
        : <Link className="button outline saved-listing-buy" href={href}>{product.availabilityType === "preorder" ? "View preorder" : "View listing"}</Link>}
      <button className="saved-listing-remove" type="button" disabled={!authReady} onClick={() => toggleWishlist(product.id)} aria-label={`Remove ${product.title} from saved listings`}>Remove</button>
    </div>
    <span className="sr-only" role="status">{added ? `${product.title} added to cart.` : ""}</span>
  </article>;
}
