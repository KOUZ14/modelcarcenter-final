"use client";

import Link from "next/link";
import Image from "next/image";
import type { ProductSummary } from "@/lib/types";
import { formatCondition, formatMoney } from "@/lib/format";
import { useMarketplace } from "./marketplace-provider";
import { Icon } from "./icons";

export function ProductCard({ product, sponsored = false, onProductClick }: { product: ProductSummary; sponsored?: boolean; onProductClick?: () => void }) {
  const { toggleWishlist, wishlistHas } = useMarketplace();
  const saved = wishlistHas(product.id);
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
              sizes="(max-width: 540px) 100vw, (max-width: 1100px) 50vw, 25vw"
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
        <Link
          className="product-arrow"
          href={`/products/${product.slug}`}
          prefetch={sponsored ? false : undefined}
          onClick={onProductClick}
          onAuxClick={event => { if (event.button === 1) onProductClick?.(); }}
          aria-label={`View ${product.title}`}
        >
          <Icon name="arrow" />
        </Link>
      </div>
    </article>
  );
}
