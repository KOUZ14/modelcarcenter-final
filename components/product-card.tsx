"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { formatCondition, formatMoney } from "@/lib/format";
import { useMarketplace } from "./marketplace-provider";
import { Icon } from "./icons";

export function ProductCard({ product, sponsored = false, onProductClick }: { product: ProductSummary; sponsored?: boolean; onProductClick?: () => void }) {
  const { addToCart, authReady, cart, toggleWishlist, wishlistHas } = useMarketplace();
  const [added, setAdded] = useState(false);
  const saved = wishlistHas(product.id);
  const inCart = cart.find((item) => item.productId === product.id)?.quantity ?? 0;
  const atLimit = inCart >= Math.min(10, product.availableQuantity);
  const canBuy = product.availabilityType !== "preorder" && product.availableQuantity > 0;
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1800);
    return () => clearTimeout(timer);
  }, [added]);
  return (
    <article className="product-card">
      {sponsored && <span className="sponsored-label">Sponsored</span>}
      <div className="product-image-wrap">
        <Link
          href={`/products/${product.slug}`}
          prefetch={sponsored ? false : undefined}
          onClick={onProductClick}
          onAuxClick={event => { if (event.button === 1) onProductClick?.(); }}
          aria-label={`View ${product.title}`}
        >
          {product.primaryImageUrl ? (
            <Image
              src={product.primaryImageUrl}
              alt={`${product.modelManufacturer} ${product.title} model car`}
              fill
              sizes="(max-width: 1100px) 50vw, 25vw"
              unoptimized
            />
          ) : (
            <div className="image-placeholder">Image coming soon</div>
          )}
        </Link>
        {product.availabilityType === "preorder" ? (
          <span className="product-badge preorder">Preorder</span>
        ) : product.availableQuantity < 1 ? (
          <span className="product-badge sold-out">Sold out</span>
        ) : product.availableQuantity <= 2 ? (
          <span className="product-badge">Low stock</span>
        ) : null}
        <button
          className={saved ? "favorite active" : "favorite"}
          type="button"
          aria-pressed={saved}
          aria-label={
            saved
              ? `Remove ${product.title} from wishlist`
              : `Save ${product.title} to wishlist`
          }
          onClick={() => toggleWishlist(product.id)}
        >
          <Icon name="heart" />
        </button>
      </div>
      <div className="product-meta">
        <span>{product.scale}</span>
        <span>{product.modelManufacturer}</span>
        <span>{formatCondition(product.modelCondition)}</span>
      </div>
      <h3>
        <Link href={`/products/${product.slug}`} prefetch={sponsored ? false : undefined} onClick={onProductClick} onAuxClick={event => { if (event.button === 1) onProductClick?.(); }}>{product.title}</Link>
      </h3>
      <p className="product-availability">{product.availabilityType === "preorder" ? "Upcoming release · Preorder" : product.availableQuantity > 0 ? `${product.availableQuantity} in stock` : "Currently unavailable"}</p>
      {product.catalogProductId && (product.availableOfferCount ?? 0) > 1 && <Link className="product-offers-link" href={`/models/${product.catalogProductId}`}>Compare {product.availableOfferCount} available offers</Link>}
      <div className="product-buy">
        <div>
          <b>{product.availabilityType === "preorder" && !product.priceCents ? "Price to be announced" : formatMoney(product.priceCents, product.currency)}</b>
          {product.saleUnit && <p>per {product.saleUnit}{(product.unitsPerPack??1)>1 ? ` · ${product.unitsPerPack} models` : ""}</p>}
          <Link href={`/sellers/${product.sellerSlug}`}>
            {product.sellerType === "collector"
              ? "Collector seller"
              : "Professional seller"}{" "}
            · {product.sellerName}
          </Link>
        </div>
      </div>
      {canBuy ? (
        <button
          className="product-quick-add"
          type="button"
          disabled={!authReady || atLimit || added}
          aria-label={added ? `${product.title} added to cart` : atLimit ? `${inCart} of ${product.title} in cart; quantity limit reached` : `Add ${product.title} to cart`}
          onClick={() => { if (authReady && !atLimit && !added && addToCart(product)) setAdded(true); }}
        >
          <Icon name={added ? "check" : "bag"} />
          {added ? "Added" : atLimit ? "In cart" : "Add to cart"}
        </button>
      ) : (
        <Link
          className="product-quick-add secondary"
          href={`/products/${product.slug}`}
          prefetch={sponsored ? false : undefined}
          onClick={onProductClick}
          onAuxClick={event => { if (event.button === 1) onProductClick?.(); }}
          aria-label={`${product.availabilityType === "preorder" ? "View preorder" : "View details"}: ${product.title}`}
        >
          {product.availabilityType === "preorder" ? "View preorder" : "View details"}
        </Link>
      )}
      <span className="sr-only" role="status">{added ? `${product.title} added to cart.` : ""}</span>
    </article>
  );
}
