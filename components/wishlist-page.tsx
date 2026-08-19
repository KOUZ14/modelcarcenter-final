"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { useMarketplace } from "./marketplace-provider";
import { ProductCard } from "./product-card";

export function WishlistPage() {
  const { wishlist, collector } = useMarketplace();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!wishlist.length) {
      queueMicrotask(() => {
        setProducts([]);
        setLoading(false);
      });
      return;
    }
    queueMicrotask(() => {
      setLoading(true);
      setError("");
    });
    fetch("/api/products/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: wishlist }),
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          products?: ProductSummary[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error);
        setProducts(data.products ?? []);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Saved items unavailable.",
        ),
      )
      .finally(() => setLoading(false));
  }, [wishlist]);
  if (loading)
    return <div className="catalog-status">Loading saved items…</div>;
  if (error)
    return (
      <div className="catalog-status error-state" role="alert">
        {error}
      </div>
    );
  if (!wishlist.length)
    return (
      <div className="empty-state">
        <p className="eyebrow">
          {collector ? "Saved to My Garage" : "Saved on this device"}
        </p>
        <h1>No saved models yet.</h1>
        <p>
          {collector
            ? "Models you save will be available on every device."
            : "Save freely now. Sign in whenever you want to keep your wishlist across devices."}
        </p>
        <Link className="button dark" href="/#inventory">
          Browse Models
        </Link>
      </div>
    );
  return (
    <div>
      <div className="page-title">
        <p className="eyebrow">
          {collector ? "Saved to My Garage" : "Saved on this device"}
        </p>
        <h1>Your wishlist</h1>
        <p>
          {collector
            ? "Your wishlist follows your collector account across devices."
            : "Sign in to keep your wishlist across devices."}
        </p>
        {!collector && (
          <Link className="text-link" href="/sign-in?returnTo=/wishlist">
            Sign in to sync this wishlist
          </Link>
        )}
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="catalog-status">
          Your saved models are no longer available.
        </div>
      )}
    </div>
  );
}
