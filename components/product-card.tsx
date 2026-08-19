"use client";

import Link from "next/link";
import Image from "next/image";
import type { ProductSummary } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { useMarketplace } from "./marketplace-provider";
import { Icon } from "./icons";

export function ProductCard({ product }: { product: ProductSummary }) {
  const { toggleWishlist, wishlistHas } = useMarketplace();
  const saved = wishlistHas(product.id);
  return <article className="product-card"><div className="product-image-wrap"><Link href={`/products/${product.slug}`} aria-label={`View ${product.title}`}>{product.primaryImageUrl ? <Image src={product.primaryImageUrl} alt={`${product.modelManufacturer} ${product.title} model car`} fill sizes="(max-width: 540px) 100vw, (max-width: 1100px) 50vw, 25vw" unoptimized/> : <div className="image-placeholder">Image coming soon</div>}</Link>{product.availableQuantity <= 2 && <span className="product-badge">Low stock</span>}<button className={saved ? "favorite active" : "favorite"} type="button" aria-pressed={saved} aria-label={saved ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`} onClick={() => toggleWishlist(product.id)}><Icon name="heart"/></button></div><div className="product-meta"><span>{product.scale}</span><span>{product.modelManufacturer}</span></div><h3><Link href={`/products/${product.slug}`}>{product.title}</Link></h3><div className="product-buy"><div><b>{formatMoney(product.priceCents, product.currency)}</b><Link href={`/sellers/${product.sellerSlug}`}>Sold by {product.sellerName}</Link></div><Link className="product-arrow" href={`/products/${product.slug}`} aria-label={`View ${product.title}`}><Icon name="arrow"/></Link></div></article>;
}
