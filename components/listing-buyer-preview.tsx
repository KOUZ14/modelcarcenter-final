"use client";

import { useEffect, useRef } from "react";
import type { ProductDetail } from "@/lib/types";
import { ProductListingView } from "./product-listing-view";

export function ListingBuyerPreview({ product, onClose }: { product: ProductDetail; onClose(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  function close() { dialogRef.current?.close(); onClose(); }
  return <dialog ref={dialogRef} className="listing-preview-page product-detail-page" aria-label="Listing preview — not published" onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    // Policy links remain inspectable without navigating away from an unsaved draft.
    if (link && !link.getAttribute("href")?.startsWith("#")) { event.preventDefault(); window.open(link.href, "_blank", "noopener,noreferrer"); }
  }}>
    <header className="listing-preview-bar"><strong>Preview — not published</strong><button type="button" className="button outline small" onClick={close}>Back to editing</button></header>
    <div className="inner-page product-page shell"><ProductListingView product={product} preview /></div>
  </dialog>;
}
