"use client";
import { useEffect, useRef, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { ProductCard } from "./product-card";
type Placement = { campaignId: string; product: ProductSummary; token: string; expiresAt: number };

function record(token: string, kind: string) {
  void fetch("/api/promotions/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, kind }), keepalive: true }).catch(() => {});
}

function SponsoredCard({ placement }: { placement: Placement }) {
  const ref = useRef<HTMLDivElement>(null), clicked = useRef(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !window.IntersectionObserver) return;
    let visible = false, counted = false, timer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      clearTimeout(timer);
      if (visible && document.visibilityState === "visible" && !counted) timer = setTimeout(() => { counted = true; record(placement.token, "impression"); }, 1000);
    }
    const observer = new IntersectionObserver(entries => { visible = entries[0].intersectionRatio >= 0.5; update(); }, { threshold: [0, 0.5, 1] });
    observer.observe(element); document.addEventListener("visibilitychange", update);
    return () => { clearTimeout(timer); observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, [placement.token]);
  return <div ref={ref}><ProductCard product={placement.product} sponsored onProductClick={() => { if (!clicked.current) { clicked.current = true; record(placement.token, "click"); } }}/></div>;
}

export function SponsoredListings({ queryString, organicIds }: { queryString: string; organicIds: string[] }) {
  const [placements, setPlacements] = useState<Placement[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/promotions/placements?${queryString}`, { signal: controller.signal, cache: "no-store" })
      .then(r => r.ok ? r.json() : { placements: [] }).then(b => { if (!controller.signal.aborted) setPlacements(b.placements ?? []); }).catch(() => {});
    return () => controller.abort();
  }, [queryString]);
  useEffect(() => {
    const timers = placements.map(p => setTimeout(() => setPlacements(current => current.filter(row => row.token !== p.token)), Math.max(0, p.expiresAt - Date.now())));
    return () => timers.forEach(clearTimeout);
  }, [placements]);
  const visible = placements.filter(p => !organicIds.includes(p.product.id));
  if (!visible.length) return null;
  return <section className="sponsored-section" aria-label="Sponsored listings"><h3>Sponsored listings</h3><p>Paid placements from stores matching your search.</p><div className="sponsored-grid">{visible.map(p => <SponsoredCard key={p.token} placement={p}/>)}</div></section>;
}
