import { and, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { incomingBatches, products, sellers } from "@/db/schema";
import type { CatalogModel } from "./catalog-product-rules";
import { DEPOSIT_PREORDER_POLICY, DEPOSIT_PREORDER_TERMS, dateWindow, preorderDepositUnit, whole, type PreorderTerms } from "./preorder-rules";
import { ValidationError } from "./validation";

export async function listingPreorderWrites(store: typeof sellers.$inferSelect, payload: Record<string, unknown>, listing: { id: string; title: string; sellerSku: string; priceCents: number; description: string; primaryImageUrl: string | null; releaseDate: string | null }, existing?: typeof products.$inferSelect) {
  const [batch] = existing ? await getDb().select().from(incomingBatches).where(eq(incomingBatches.listingId,existing.id)).limit(1) : [];
  const commitments = batch ? await getD1().prepare("SELECT count(*) n FROM preorder_reservations WHERE batch_id=? AND (accepted_at IS NOT NULL OR (status='hold' AND hold_expires_at > ?))").bind(batch.id,new Date().toISOString()).first<{n:number}>() : null;
  if (commitments?.n) throw new ValidationError("This preorder has customer commitments. Use Manage preorder to record stock, update shipping dates or issue refunds; accepted prices stay locked.");
  if (batch && JSON.parse(batch.terms).paymentModel !== "deposit_10") throw new ValidationError("Manage this existing reservation offer in Preorders. Create a new listing to use 10% deposits.");
  const capacity = whole(payload.inventoryQuantity,"preorder quantity",1,100000);
  const buyerLimit = whole(payload.preorderBuyerLimit ?? 10,"limit per buyer",1,10);
  const dispatch = dateWindow({precision:"day",start:listing.releaseDate});
  if (!dispatch.end || dispatch.end <= new Date(Date.now()+86400000).toISOString()) throw new ValidationError("Choose an expected ship date after today.");
  const cutoffDate = String(payload.preorderCutoff ?? "").trim();
  const cutoffAt = cutoffDate ? dateWindow({precision:"day",start:cutoffDate}).end! : new Date(Date.parse(dispatch.start!)-1).toISOString();
  if (cutoffAt >= dispatch.end || Date.parse(cutoffAt) < Date.now()+35*60000) throw new ValidationError("Preorders must close before the expected ship date and at least 35 minutes from now.");
  const depositUnitCents = preorderDepositUnit(listing.priceCents);
  if (listing.priceCents < 500) throw new ValidationError("A preorder must cost at least $5.00 so its 10% deposit can be processed.");
  const batchId = batch?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  return (model: CatalogModel) => {
    const terms: PreorderTerms = {
      policyVersion:DEPOSIT_PREORDER_POLICY,policyText:DEPOSIT_PREORDER_TERMS,paymentModel:"deposit_10",depositUnitCents,
      sellerId:store.id,sellerName:store.storeName,listingId:listing.id,catalogProductId:model.id,title:listing.title,
      scale:model.scale,manufacturer:model.modelManufacturer,sellerSku:listing.sellerSku,imageUrl:listing.primaryImageUrl ?? model.primaryImageUrl ?? null,
      variant:[model.vehicleVariant,model.color,model.edition,model.packagingVariant].filter(Boolean).join(" · ") || "As described in this listing",
      saleUnit:"model",unitsPerPack:1,contents:listing.description || listing.title,priceCents:listing.priceCents,currency:"usd",
      shippingEstimateCents:store.shippingMode === "calculated" ? null : store.shippingMode === "free" ? 0 : store.defaultShippingCents,
      shippingBasis:store.shippingMode === "calculated" ? "Calculated for your address before balance payment" : store.shippingMode === "free" ? "Free shipping" : "Store flat shipping rate",
      dispatch,receipt:dispatch,handlingDays:store.handlingTimeBusinessDays,paymentDays:7,previewMedia:true,revision:batch?.revision ?? 1,buyerLimit,
      taxTreatment:"Applicable tax is shown at each payment. Your 10% merchandise deposit is deducted from the item balance; shipping is paid with the balance.",
    };
    const values = { listingId:listing.id,supplierReference:"Seller listing",requestedQuantity:capacity,confirmedAllocation:capacity,capacity,safetyBuffer:0,evidenceReference:"Seller supplied listing",evidenceState:"seller_declared",terms:JSON.stringify(terms),dispatchEnd:dispatch.end,opensAt:batch?.opensAt ?? now,cutoffAt,timezone:"UTC",status:"open",updatedAt:now };
    const write = batch ? getDb().update(incomingBatches).set(values).where(and(eq(incomingBatches.id,batchId),eq(incomingBatches.listingId,listing.id))).toSQL() : getDb().insert(incomingBatches).values({id:batchId,...values}).toSQL();
    return [write];
  };
}
