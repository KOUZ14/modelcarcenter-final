import { PhotoImage } from "./product-image-fields";
import { formatCondition } from "@/lib/format";

export function ListingBuyerPreview({ values, title, coverUrl, coverFile, seller }: { values: Record<string, unknown>; title: string; coverUrl?: string | null; coverFile?: File; seller: Record<string, unknown> | null }) {
  const text = (key: string) => String(values[key] ?? "").trim();
  const show = (key: string) => text(key) ? formatCondition(text(key)) : "Not entered";
  const price = text("price").replace(/^\$/, "");
  return <article className="listing-buyer-preview" aria-label="Buyer-facing listing preview">
    <div className="listing-preview-photo">{coverFile || coverUrl ? <PhotoImage url={coverUrl ?? undefined} file={coverFile} alt={title} /> : <span>Add a cover photo</span>}</div>
    <div><p className="eyebrow">Buyer preview · not published</p><h3>{title || "Your catalog model"}</h3><p className="listing-preview-price">{price && /^\d+(\.\d{1,2})?$/.test(price) ? `$${Number(price).toFixed(2)}` : "Price not entered"}</p>
      <p>Quantity: {text("quantity") || "Not entered"}</p>
      <dl><div><dt>Model</dt><dd>{show("modelCondition")}</dd></div><div><dt>Packaging</dt><dd>{show("packagingCondition")}</dd></div><div><dt>Original box</dt><dd>{show("originalBoxStatus")}</dd></div><div><dt>COA</dt><dd>{show("coaStatus")}</dd></div>
      {[ ["Missing parts", "missingParts"], ["Defects and wear", "defects"], ["Restoration / customization", "restorationCustomization"], ["Included accessories", "accessories"] ].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{text(key) || "Not specified"}</dd></div>)}</dl>
      {text("conditionNotes") && <p>{text("conditionNotes")}</p>}{text("description") && <p>{text("description")}</p>}{text("provenance") && <p>Ownership history: {text("provenance")}</p>}
      <div className="listing-preview-seller"><h4>Sold by {text("sellerDisplayName") || "Your seller name"}</h4><p>{text("sellerDescription") || "Seller introduction not entered"}</p>{text("sellerSpecialty") && <p>Specialty: {text("sellerSpecialty")}</p>}{text("sellerPackingApproach") && <p>{text("sellerPackingApproach")}</p>}
      <p>Ships from {[text("shippingOriginRegion"), text("shippingOriginCountry")].filter(Boolean).join(", ") || "Location not entered"}. Shipping calculated at checkout.</p>
      <p>{seller?.handlingTimeBusinessDays ? `Handling: ${String(seller.handlingTimeBusinessDays)} business days. ` : ""}{String(seller?.shippingPolicySummary || "Ships directly from this collector seller.")}</p><p>{String(seller?.returnPolicySummary || "Contact Model Car Center before returning an order.")}</p></div>
    </div>
  </article>;
}
