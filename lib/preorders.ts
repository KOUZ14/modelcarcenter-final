import { and, asc, desc, eq } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { incomingBatches, preorderEvents, preorderPolicies, preorderReservations, preorderSellerAccess, products, sellers } from "@/db/schema";
import { prepareListingCatalog, persistCatalogListing } from "./catalog-products";
import { PREORDER_POLICY, PREORDER_TERMS, capacitySummary, dateWindow, instant, required, whole, type PreorderTerms } from "./preorder-rules";
import { isEmail, moneyToCents, ValidationError } from "./validation";
import { POLICY_VERSION, sellerAcceptedCurrentTerms } from "./legal";
import { parseCheckoutShippingAddress } from "./shipping-rules";

export type Batch = typeof incomingBatches.$inferSelect;
export type Reservation = typeof preorderReservations.$inferSelect;
export function termsOf(row: { terms: string }): PreorderTerms { return JSON.parse(row.terms); }
const now = () => new Date().toISOString();
export const commitmentSql = "status IN ('reserved','allocated','awaiting_payment','converted')";
export function eventStatement(input: { id?: string; batchId?: string; reservationId?: string; actor: string; kind: string; detail: unknown; recipient?: string }) {
  return getD1().prepare("INSERT OR IGNORE INTO preorder_events (id,batch_id,reservation_id,actor,kind,detail,recipient) VALUES (?,?,?,?,?,?,?)")
    .bind(input.id ?? crypto.randomUUID(), input.batchId ?? null, input.reservationId ?? null, input.actor, input.kind, JSON.stringify(input.detail), input.recipient ?? null);
}
export async function ownedBatch(userId: string, batchId: string) {
  const [row] = await getDb().select({ batch: incomingBatches, listing: products, seller: sellers }).from(incomingBatches)
    .innerJoin(products, eq(products.id, incomingBatches.listingId)).innerJoin(sellers, eq(sellers.id, products.sellerId))
    .where(and(eq(incomingBatches.id, batchId), eq(sellers.ownerUserId, userId))).limit(1);
  if (!row) throw new ValidationError("This incoming batch does not belong to your store.");
  return row;
}
export async function buyerReservation(userId: string, id: string) {
  const [r] = await getDb().select().from(preorderReservations).where(and(eq(preorderReservations.id,id), eq(preorderReservations.buyerUserId,userId))).limit(1);
  if (!r) throw new ValidationError("Reservation not found for this account.");
  return r;
}
export async function createIncomingBatch(userId: string, input: Record<string, unknown>) {
  const [seller] = await getDb().select().from(sellers).where(eq(sellers.ownerUserId, userId)).limit(1);
  const [access] = seller ? await getDb().select().from(preorderSellerAccess).where(eq(preorderSellerAccess.sellerId, seller.id)).limit(1) : [];
  if (!seller || seller.sellerType !== "professional" || seller.status !== "active" || !access?.approved || !seller.stripeAccountId || !seller.stripeChargesEnabled || !seller.stripePayoutsEnabled || !sellerAcceptedCurrentTerms(seller)) throw new ValidationError("Preorders require an approved store, reviewed supply source, current seller terms and completed payment onboarding.");
  const prepared = await prepareListingCatalog(input, userId);
  const batchId = crypto.randomUUID(), listingId = crypto.randomUUID();
  const saleUnit = String(input.saleUnit ?? "model") as PreorderTerms["saleUnit"];
  if (!["model","set","case","assortment"].includes(saleUnit)) throw new ValidationError("Choose a selling unit.");
  const unitsPerPack = whole(input.unitsPerPack, "units per pack", 1, 1000);
  if (saleUnit === "model" && unitsPerPack !== 1) throw new ValidationError("An individual model must have one unit per pack.");
  const variant = required(input.variant, "exact variant and packaging");
  const contents = required(input.contents, "pack contents and assortment disclosure");
  if (input.guaranteedChase === true && !input.chaseEvidence) throw new ValidationError("Guaranteed chase inclusion requires supplier evidence.");
  const priceCents = input.price === "" || input.price == null ? 0 : moneyToCents(input.price);
  const currency = String(input.currency ?? "usd").toLowerCase();
  if (currency !== "usd") throw new ValidationError("MCC preorder checkout currently supports USD.");
  const requestedQuantity = whole(input.requestedQuantity, "requested quantity");
  const confirmedAllocation = whole(input.confirmedAllocation, "confirmed allocation");
  const capacity = whole(input.capacity, "quantity dedicated to MCC"), safetyBuffer = whole(input.safetyBuffer, "safety buffer");
  if (capacity > confirmedAllocation || confirmedAllocation > requestedQuantity || safetyBuffer > capacity) throw new ValidationError("MCC capacity must fit within confirmed allocation and requested quantity; the buffer must fit within capacity.");
  const dispatch = dateWindow(input.dispatch), receipt = dateWindow(input.receipt);
  const opensAt = instant(input.opensAt, "reservation opening time"), cutoffAt = instant(input.cutoffAt, "cutoff time");
  const timezone = required(input.timezone, "timezone", 100);
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); } catch { throw new ValidationError("Choose a valid IANA timezone, such as America/Los_Angeles."); }
  if (cutoffAt <= opensAt || (dispatch.end && cutoffAt >= dispatch.end)) throw new ValidationError("Cutoff must follow opening and precede the end of dispatch.");
  const supplierReference = required(input.supplierReference, "supplier reference");
  const evidenceReference = typeof input.evidenceReference === "string" ? input.evidenceReference.trim().slice(0,2000) : "";
  const estimateSource = required(input.estimateSource, "source of the receipt and dispatch estimates");
  const shippingBasis = required(input.shippingBasis, "shipping method and rate basis");
  const shippingEstimateCents = input.shippingEstimate === "" || input.shippingEstimate == null ? null : moneyToCents(input.shippingEstimate);
  const terms: PreorderTerms = {
    policyVersion: PREORDER_POLICY, policyText: PREORDER_TERMS, paymentModel: "pay_when_ready",
    sellerId: seller.id, sellerName: seller.storeName, listingId, catalogProductId: prepared.model.id,
    title: prepared.model.title, scale: prepared.model.scale, manufacturer: prepared.model.modelManufacturer,
    sellerSku: `PRE-${batchId.slice(0,8)}`, imageUrl: prepared.model.primaryImageUrl ?? null,
    variant, saleUnit, unitsPerPack, contents, priceCents, currency, shippingEstimateCents, shippingBasis,
    dispatch, receipt, handlingDays: whole(input.handlingDays ?? seller.handlingTimeBusinessDays, "handling business days", 1, 10), paymentDays: 7,
    previewMedia: input.previewMedia !== false, revision: 1, buyerLimit: whole(input.buyerLimit, "buyer limit", 1, 10),
    taxTreatment: "Applicable tax is calculated at final payment. Shipping is an estimate until the final quote is accepted.",
  };
  // Reuse the catalog creation/correction flow; never edit a shared identity here.
  const model = await persistCatalogListing(prepared, m => ({
    sql: `INSERT INTO products (id,catalog_product_id,seller_id,slug,seller_sku,title,description,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,currency,inventory_quantity,availability_type,status,primary_image_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,'preorder','active',?)`,
    params: [listingId,m.id,seller.id,`preorder-${listingId}`,terms.sellerSku,m.title,`${variant}. ${contents}`,m.scale,m.modelManufacturer,m.vehicleMake,m.vehicleModel,priceCents,currency,m.primaryImageUrl ?? null],
  }));
  terms.catalogProductId = model.id;
  const insert = getDb().insert(incomingBatches).values({ id: batchId, listingId, supplierReference, requestedQuantity, confirmedAllocation, capacity, safetyBuffer, evidenceReference,
    evidenceState: evidenceReference ? "supplied" : "missing", terms: JSON.stringify(terms), dispatchEnd: dispatch.end, opensAt, cutoffAt, timezone }).toSQL();
  await getD1().batch([getD1().prepare(insert.sql).bind(...insert.params), eventStatement({ batchId, actor: userId, kind: "batch_created", detail: { estimateSource, chaseEvidence: input.chaseEvidence ?? null, terms } })]);
  return { batchId, listingId };
}

export async function batchCapacity(batch: Batch) {
  const row = await getD1().prepare(`SELECT COALESCE(SUM(CASE WHEN ${commitmentSql} THEN quantity ELSE 0 END),0) committed,
    COALESCE(SUM(CASE WHEN status = 'hold' AND hold_expires_at > ? THEN quantity ELSE 0 END),0) holds
    FROM preorder_reservations WHERE batch_id = ?`).bind(now(),batch.id).first<{ committed: number; holds: number }>();
  return { committed: row!.committed, holds: row!.holds, ...capacitySummary(batch.capacity,batch.safetyBuffer,row!.committed,row!.holds) };
}
export async function publicPreorderOffers(listingId: string) {
  const rows = await getDb().select({ batch: incomingBatches, seller: sellers, listing: products }).from(incomingBatches)
    .innerJoin(products,eq(products.id,incomingBatches.listingId)).innerJoin(sellers,eq(sellers.id,products.sellerId))
    .where(and(eq(incomingBatches.listingId,listingId),eq(sellers.status,"active"),eq(products.status,"active")));
  return Promise.all(rows.map(async ({ batch, seller }) => {
    const totals = await batchCapacity(batch), terms = termsOf(batch);
    const [access] = await getDb().select().from(preorderSellerAccess).where(eq(preorderSellerAccess.sellerId,seller.id)).limit(1);
    const [policy] = await getDb().select().from(preorderPolicies).where(eq(preorderPolicies.version,terms.policyVersion)).limit(1);
    const canReserve = Boolean(access?.approved && policy?.enabled && sellerAcceptedCurrentTerms(seller) && seller.stripeChargesEnabled && seller.stripePayoutsEnabled && batch.status === "open" && batch.evidenceState === "reviewed" && batch.shortage === 0 && totals.remaining > 0 && terms.priceCents > 0 && batch.dispatchEnd && batch.dispatchEnd > now() && batch.opensAt <= now() && batch.cutoffAt > now() && ["expected","in_transit"].includes(batch.supplyState));
    return { id: batch.id, terms, remaining: canReserve ? totals.remaining : 0, canReserve, supplyState: batch.supplyState, cutoffAt: batch.cutoffAt, timezone: batch.timezone, evidenceReviewed: batch.evidenceState === "reviewed" };
  }));
}
export async function holdPreorder(user: { id: string; email: string }, input: Record<string, unknown>, holdMinutes=10) {
  const key = required(input.idempotencyKey,"idempotency key",100), batchId = required(input.batchId,"batch",100), quantity = whole(input.quantity,"quantity",1,10);
  const [existing] = await getDb().select().from(preorderReservations).where(and(eq(preorderReservations.buyerUserId,user.id),eq(preorderReservations.idempotencyKey,key))).limit(1);
  if (existing) {
    if (existing.batchId !== batchId || existing.quantity !== quantity) throw new ValidationError("This request key was already used for a different reservation.");
    return existing;
  }
  const [batch] = await getDb().select().from(incomingBatches).where(eq(incomingBatches.id,batchId)).limit(1);
  if (!batch) throw new ValidationError("Incoming batch not found.");
  const [offer] = (await publicPreorderOffers(batch.listingId)).filter(o=>o.id===batch.id);
  if (!offer?.canReserve) throw new ValidationError("This offer currently accepts interest only.");
  if (Number(input.revision) !== batch.revision) throw new ValidationError("The offer changed. Refresh and review its current terms.");
  const id = crypto.randomUUID();
  try { await getDb().insert(preorderReservations).values({ id,batchId,buyerUserId:user.id,idempotencyKey:key,quantity,terms:batch.terms,holdExpiresAt:new Date(Math.min(Date.now()+holdMinutes*60000,Date.parse(batch.cutoffAt))).toISOString(),acceptedRevision:batch.revision,contactEmail:user.email,actor:user.id }); }
  catch (error) {
    const [retry] = await getDb().select().from(preorderReservations).where(and(eq(preorderReservations.buyerUserId,user.id),eq(preorderReservations.idempotencyKey,key))).limit(1);
    if (retry && retry.batchId===batchId && retry.quantity===quantity) return retry;
    throw error;
  }
  return buyerReservation(user.id,id);
}
export async function confirmPreorder(userId: string, id: string, accepted: unknown) {
  const r = await buyerReservation(userId,id);
  if (r.acceptedAt) return r;
  if (accepted !== true) throw new ValidationError("Accept the displayed reservation terms before confirming.");
  const result = await getD1().prepare(`UPDATE preorder_reservations SET status='reserved',accepted_at=?,actor=?,
    accepted_sequence=(SELECT COALESCE(MAX(accepted_sequence),0)+1 FROM preorder_reservations),updated_at=? WHERE id=? AND status='hold'
    AND EXISTS (SELECT 1 FROM incoming_batches b JOIN products p ON p.id=b.listing_id JOIN sellers s ON s.id=p.seller_id
      WHERE b.id=batch_id AND s.seller_type='professional' AND s.seller_terms_version=? AND s.seller_terms_accepted_at IS NOT NULL)`)
    .bind(now(),userId,now(),id,POLICY_VERSION).run();
  if (!result.meta.changes) throw new ValidationError("This hold is no longer available. Start a new reservation.");
  await getD1().prepare("UPDATE preorder_waitlist SET status='reserved' WHERE reservation_id=? AND status='invited'").bind(id).run();
  return buyerReservation(userId,id);
}

export async function cancelPreorder(id: string, actor: string, reason: string, expired = false) {
  // Releasing the allocation invokes the stock trigger once. Checkout sessions
  // can finish late; their webhook refunds instead of resurrecting this promise.
  await getD1().prepare(`UPDATE preorder_reservations SET status=?,allocated_quantity=0,
    reason=CASE WHEN ?=1 THEN CASE WHEN status='hold' THEN 'review_hold_expired'
      WHEN consent_state='required' AND consent_deadline <= strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'delay_consent_expired'
      ELSE 'payment_deadline_expired' END ELSE ? END,actor=?,updated_at=?
    WHERE id=? AND status IN ('hold','reserved','allocated','awaiting_payment') ${expired?`AND (
      (status='hold' AND hold_expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')) OR
      (consent_state='required' AND consent_deadline <= strftime('%Y-%m-%dT%H:%M:%fZ','now')) OR
      (status IN ('allocated','awaiting_payment') AND payment_deadline <= strftime('%Y-%m-%dT%H:%M:%fZ','now')))` : ""}`).bind(expired?"expired":"cancelled",expired?1:0,reason,actor,now(),id).run();
}
export async function updateBuyerPreorder(userId: string, id: string, input: Record<string,unknown>) {
  const r = await buyerReservation(userId,id);
  if (input.action === "cancel") { await cancelPreorder(id,userId,"buyer_change_of_mind"); return; }
  if (!["reserved","allocated","awaiting_payment"].includes(r.status)) throw new ValidationError("This reservation can no longer be changed.");
  if (input.action === "contact") {
    const email = required(input.email,"contact email",254).toLowerCase();
    if (!isEmail(email)) throw new ValidationError("Enter a valid email address.");
    const address = input.address ? JSON.stringify(parseCheckoutShippingAddress(input.address)) : r.address;
    await getD1().prepare("UPDATE preorder_reservations SET contact_email=?,address=?,actor=?,updated_at=? WHERE id=? AND status IN ('reserved','allocated','awaiting_payment')").bind(email,address,userId,now(),id).run(); return;
  }
  if (r.checkoutReservationId) throw new ValidationError("Close the current payment checkout before changing quantities or consent.");
  if (input.action === "reduce") {
    const quantity = whole(input.quantity,"reduced quantity",1,r.quantity);
    await getD1().prepare("UPDATE preorder_reservations SET quantity=?,allocated_quantity=MIN(allocated_quantity,?),actor=?,updated_at=? WHERE id=? AND checkout_reservation_id IS NULL AND status IN ('reserved','allocated','awaiting_payment')").bind(quantity,quantity,userId,now(),id).run(); return;
  }
  const [batch] = await getDb().select().from(incomingBatches).where(eq(incomingBatches.id,r.batchId)).limit(1);
  if (input.action === "keep") {
    if (r.consentState !== "required" || !r.consentDeadline || r.consentDeadline <= now() || Number(input.revision) !== batch.revision || !batch.dispatchEnd || batch.dispatchEnd <= now() || (r.reason === "supplier_shortage" && batch.shortage > 0 && batch.revision <= r.acceptedRevision)) throw new ValidationError("Review a current supported revised estimate before keeping this reservation.");
    await getD1().prepare(`UPDATE preorder_reservations SET consent_state='accepted',consent_deadline=NULL,accepted_revision=?,actor=?,updated_at=?
      WHERE id=? AND consent_state='required' AND consent_deadline > ? AND EXISTS(SELECT 1 FROM incoming_batches WHERE id=batch_id AND revision=? )`).bind(batch.revision,userId,now(),id,now(),batch.revision).run();
  } else if (input.action === "accept_partial") {
    if (r.status !== "allocated" || r.allocatedQuantity < 1) throw new ValidationError("There is no partial allocation to accept.");
    await getD1().prepare("UPDATE preorder_reservations SET quantity=allocated_quantity,status='awaiting_payment',actor=?,reason='partial_accepted',updated_at=? WHERE id=? AND status='allocated'").bind(userId,now(),id).run();
  } else if (input.action === "wait") {
    await getD1().prepare("UPDATE preorder_reservations SET status='reserved',allocated_quantity=0,consent_state='waiting',payment_deadline=NULL,actor=?,reason='buyer_waiting_for_revised_estimate',updated_at=? WHERE id=? AND status='allocated'").bind(userId,now(),id).run();
  } else throw new ValidationError("Unknown reservation action.");
}

export async function allocateBatch(batchId: string, actor: string) {
  // Each conditional update and its stock trigger form one atomic write.
  for (let n=0;n<100;n++) {
    const [batch] = await getDb().select().from(incomingBatches).where(eq(incomingBatches.id,batchId)).limit(1);
    if (!batch || batch.supplyState === "cancelled" || !batch.inspectedAt || !batch.dispatchEnd || batch.dispatchEnd <= now()) return;
    const used = await getD1().prepare("SELECT COALESCE(SUM(allocated_quantity),0) n FROM preorder_reservations WHERE batch_id=? AND status IN ('allocated','awaiting_payment','converted')").bind(batchId).first<{n:number}>();
    const available = batch.sellableQuantity-used!.n;
    if (available < 1) return;
    const [r] = await getDb().select().from(preorderReservations).where(and(eq(preorderReservations.batchId,batchId),eq(preorderReservations.status,"reserved"),eq(preorderReservations.consentState,"accepted"),eq(preorderReservations.acceptedRevision,batch.revision))).orderBy(asc(preorderReservations.acceptedSequence)).limit(1);
    if (!r) return;
    const qty = Math.min(available,r.quantity), deadline = new Date(Date.now()+7*86400000).toISOString();
    await getD1().prepare(`UPDATE preorder_reservations SET allocated_quantity=?,status=?,payment_deadline=?,actor=?,reason='inspected_stock_allocated',updated_at=?
      WHERE id=? AND status='reserved' AND consent_state='accepted'`).bind(qty,qty<r.quantity?"allocated":"awaiting_payment",deadline,actor,now(),r.id).run();
  }
}

export async function changeBatch(userId: string, batchId: string, input: Record<string,unknown>, admin = false) {
  let batch: Batch;
  if (admin) { [batch] = await getDb().select().from(incomingBatches).where(eq(incomingBatches.id,batchId)).limit(1); if (!batch) throw new ValidationError("Batch not found."); }
  else ({ batch } = await ownedBatch(userId,batchId));
  const reason = required(input.reason,"reason for this update");
  const action = String(input.action), db = getD1();
  if (batch.supplyState === "cancelled" && action !== "cancel_batch") throw new ValidationError("Cancelled batches cannot accept receipts or new promises.");
  const guard = () => db.prepare(`UPDATE incoming_batches SET revision=CASE WHEN revision=? AND received_quantity=? AND sellable_quantity=? THEN revision ELSE NULL END WHERE id=?`)
    .bind(batch.revision,batch.receivedQuantity,batch.sellableQuantity,batchId);
  const audit = eventStatement({ batchId,actor:userId,kind:action,detail:{ reason, previous: { capacity:batch.capacity, revision:batch.revision,terms:termsOf(batch) }, proposed: input } });
  if (action === "receipt") {
    const received = whole(input.receivedQuantity,"cumulative received quantity",batch.receivedQuantity), sellable = whole(input.sellableQuantity,"cumulative inspected sellable quantity",batch.sellableQuantity), damaged = whole(input.damagedQuantity,"cumulative damaged quantity",batch.damagedQuantity);
    if (sellable+damaged>received) throw new ValidationError("Inspected sellable and damaged units cannot exceed received units.");
    await db.batch([
      guard(),
      db.prepare("UPDATE products SET inventory_quantity=inventory_quantity+?- (SELECT sellable_quantity FROM incoming_batches WHERE id=?),updated_at=? WHERE id=?").bind(sellable,batchId,now(),batch.listingId),
      db.prepare(`UPDATE incoming_batches SET received_quantity=?,sellable_quantity=?,damaged_quantity=?,received_at=COALESCE(received_at,?),inspected_at=?,status='closed',supply_state=?,updated_at=? WHERE id=? AND sellable_quantity <= ? AND received_quantity <= ?`).bind(received,sellable,damaged,now(),now(),input.complete===true?"received":"partially_received",now(),batchId,sellable,received),audit,
    ]);
    await allocateBatch(batchId,userId);
  } else if (action === "allocate") { await audit.run(); await allocateBatch(batchId,userId); }
  else if (action === "close" || action === "open") {
    if (action === "open" && (batch.evidenceState !== "reviewed" || !termsOf(batch).priceCents || !batch.dispatchEnd || batch.dispatchEnd <= now() || batch.shortage || !["expected","in_transit"].includes(batch.supplyState))) throw new ValidationError("Review allocation evidence and provide a supported price and dispatch window before opening.");
    await db.batch([db.prepare("UPDATE incoming_batches SET status=?,updated_at=? WHERE id=?").bind(action === "open"?"open":"closed",now(),batchId),audit]);
  } else if (action === "review_evidence" && admin) {
    if (!batch.evidenceReference) throw new ValidationError("The seller has not supplied allocation evidence.");
    await db.batch([db.prepare("UPDATE incoming_batches SET evidence_state='reviewed',evidence_reviewed_by=?,updated_at=? WHERE id=?").bind(userId,now(),batchId),audit]);
  } else if (action === "capacity") {
    const capacity = whole(input.capacity,"MCC capacity"), allocation = whole(input.confirmedAllocation,"confirmed allocation");
    if (capacity>allocation || allocation>batch.requestedQuantity) throw new ValidationError("Capacity must fit within the supplier allocation.");
    const buffer = Math.min(batch.safetyBuffer,capacity);
    const queue = await getDb().select().from(preorderReservations).where(eq(preorderReservations.batchId,batchId)).orderBy(asc(preorderReservations.acceptedSequence));
    const statements = [guard(), db.prepare(`UPDATE incoming_batches SET capacity=?,confirmed_allocation=?,safety_buffer=?,shortage=MAX(0,(SELECT COALESCE(SUM(quantity),0) FROM preorder_reservations WHERE batch_id=? AND ${commitmentSql})-?+?),status='closed',updated_at=? WHERE id=?`).bind(capacity,allocation,buffer,batchId,capacity,buffer,now(),batchId),audit];
    let used=0;
    for (const r of queue.filter(r=>["reserved","allocated","awaiting_payment","converted"].includes(r.status))) {
      const affected = Math.min(r.quantity,Math.max(0,used+r.quantity-Math.max(0,capacity-buffer))); used+=r.quantity;
      if (affected && r.status !== "converted") statements.push(...await batchConsentStatements(batch,r,userId,"supplier_shortage",{affectedUnits:affected,reason}));
    }
    // New confirmations between the preview and transaction are also marked by
    // a database trigger in the migration; no later buyer can outrank this queue.
    await db.batch(statements);
  } else if (action === "delay") {
    const dispatch = dateWindow(input.dispatch), receipt = input.receipt ? dateWindow(input.receipt) : termsOf(batch).receipt;
    const terms = {...termsOf(batch),dispatch,receipt,revision:batch.revision+1};
    const reservations = await getDb().select().from(preorderReservations).where(eq(preorderReservations.batchId,batchId));
    const statements=[guard(),db.prepare("UPDATE incoming_batches SET terms=?,dispatch_end=?,revision=revision+1,status='closed',updated_at=? WHERE id=? AND revision=?").bind(JSON.stringify(terms),dispatch.end,now(),batchId,batch.revision),audit];
    for (const r of reservations.filter(r=>["reserved","allocated","awaiting_payment"].includes(r.status))) statements.push(...await batchConsentStatements(batch,r,userId,"material_delay",{reason,previousDispatch:termsOf(batch).dispatch,dispatch}));
    await db.batch(statements);
  } else if (action === "cancel_batch") {
    if (!["manufacturer_cancelled","seller_failure","material_product_change"].includes(String(input.reasonCode))) throw new ValidationError("Choose a manufacturer cancellation, seller failure, or material product change reason.");
    await db.batch([db.prepare("UPDATE incoming_batches SET status='closed',supply_state='cancelled',updated_at=? WHERE id=?").bind(now(),batchId),audit,
      db.prepare("UPDATE preorder_reservations SET status='cancelled',allocated_quantity=0,reason=?,actor=?,updated_at=? WHERE batch_id=? AND status IN ('hold','reserved','allocated','awaiting_payment')").bind(String(input.reasonCode),userId,now(),batchId)]);
    // Converted orders use the marketplace's existing refund/transfer workflow.
    const { cancelPaidPreorders } = await import("./preorder-payments");
    await cancelPaidPreorders(batchId,userId,String(input.reasonCode));
  } else throw new ValidationError("Unknown batch action.");
}

async function batchConsentStatements(batch: Batch, r: Reservation, actor: string, reason: string, detail: unknown) {
  const [policy] = await getDb().select().from(preorderPolicies).where(eq(preorderPolicies.version,termsOf(r).policyVersion)).limit(1);
  if (!policy) throw new ValidationError("The accepted notice policy is missing; contact an administrator.");
  const deadline = new Date(Date.now()+policy.delayResponseDays*86400000).toISOString();
  return [
    getD1().prepare("UPDATE preorder_reservations SET consent_state='required',consent_deadline=?,reason=?,actor=?,updated_at=? WHERE id=? AND status IN ('reserved','allocated','awaiting_payment')").bind(deadline,reason,actor,now(),r.id),
    eventStatement({ batchId:batch.id,reservationId:r.id,actor,kind:"consent_required",recipient:r.contactEmail,detail:{reason,detail,responseDeadline:deadline,action:"Keep reservation or cancel. No response cancels without a fee. Payment is disabled until you respond."} }),
  ];
}

export async function buyerPreorders(userId: string) {
  const rows = await getDb().select({ reservation:preorderReservations,batch:incomingBatches }).from(preorderReservations).innerJoin(incomingBatches,eq(incomingBatches.id,preorderReservations.batchId)).where(eq(preorderReservations.buyerUserId,userId)).orderBy(desc(preorderReservations.createdAt));
  return Promise.all(rows.map(async ({reservation:r,batch})=>({ ...r, terms:termsOf(r), currentTerms:termsOf(batch), supplyState:batch.supplyState,
    events:await getDb().select({id:preorderEvents.id,kind:preorderEvents.kind,detail:preorderEvents.detail,createdAt:preorderEvents.createdAt}).from(preorderEvents).where(eq(preorderEvents.reservationId,r.id)).orderBy(desc(preorderEvents.createdAt)).limit(100),
    payment: await getD1().prepare("SELECT status,refund_status AS refundStatus,amount_cents AS amountCents,currency FROM preorder_payment_ledger WHERE reservation_id=? ORDER BY created_at DESC").bind(r.id).all(),
  })));
}
export async function sellerPreorders(userId: string) {
  const [seller] = await getDb().select().from(sellers).where(eq(sellers.ownerUserId,userId)).limit(1);
  if (!seller || seller.sellerType !== "professional") throw new ValidationError("A professional store is required.");
  const [access] = await getDb().select().from(preorderSellerAccess).where(eq(preorderSellerAccess.sellerId,seller.id)).limit(1);
  const batches = await getDb().select({batch:incomingBatches}).from(incomingBatches).innerJoin(products,eq(products.id,incomingBatches.listingId)).where(eq(products.sellerId,seller.id)).orderBy(desc(incomingBatches.createdAt));
  return { sellerId:seller.id,eligible:Boolean(access?.approved && seller.status === "active"),batches:await Promise.all(batches.map(async ({batch})=>({
    ...batch,terms:termsOf(batch),...await batchCapacity(batch),
    reservations:await getDb().select().from(preorderReservations).where(eq(preorderReservations.batchId,batch.id)).orderBy(asc(preorderReservations.acceptedSequence)),
    metrics:await getD1().prepare(`SELECT
      (SELECT count(*) FROM availability_alerts WHERE product_id=? AND status='active') AS watchers,
      (SELECT count(*) FROM preorder_waitlist WHERE batch_id=? AND status IN ('waiting','invited')) AS waitlisted,
      count(CASE WHEN o.fulfillment_status IN ('shipped','delivered') THEN 1 END) AS shipped,
      avg(CASE WHEN o.shipped_at IS NOT NULL AND b.received_at IS NOT NULL THEN julianday(o.shipped_at)-julianday(b.received_at) END) AS receiptToDispatchDays
      FROM preorder_reservations r JOIN incoming_batches b ON b.id=r.batch_id LEFT JOIN orders o ON o.id=r.order_id WHERE r.batch_id=?`)
      .bind(batch.listingId,batch.id,batch.id).first<{watchers:number;waitlisted:number;shipped:number;receiptToDispatchDays:number|null}>(),
  }))) };
}
export async function preorderOperations() {
  const [consent, cancellations] = await Promise.all([
    getD1().prepare(`SELECT r.id,r.reason,r.consent_deadline AS deadline,p.title,s.store_name AS seller
      FROM preorder_reservations r JOIN incoming_batches b ON b.id=r.batch_id
      JOIN products p ON p.id=b.listing_id JOIN sellers s ON s.id=p.seller_id
      WHERE r.consent_state='required' AND r.status IN ('reserved','allocated','awaiting_payment') ORDER BY r.consent_deadline LIMIT 100`).all(),
    getD1().prepare(`SELECT reason,count(*) AS reservations,sum(quantity) AS units,
      round(100.0*count(*)/max(1,(SELECT count(*) FROM preorder_reservations WHERE accepted_at IS NOT NULL)),1) AS percent
      FROM preorder_reservations WHERE status IN ('cancelled','expired') AND accepted_at IS NOT NULL GROUP BY reason`).all(),
  ]);
  return {consent:consent.results??[],cancellations:cancellations.results??[]};
}
export async function adminPreorderAction(actor: string, input: Record<string,unknown>) {
  const reason = required(input.reason,"review or override reason");
  if (input.action === "policy") {
    if (input.reviewed !== true) throw new ValidationError("Confirm the policy and notice deadline have been reviewed for MCC's order-acceptance model.");
    const days = whole(input.delayResponseDays,"reviewed delay response days",1,30);
    const old = await getDb().select().from(preorderPolicies).where(eq(preorderPolicies.version,PREORDER_POLICY));
    if (old[0] && old[0].delayResponseDays !== days) throw new ValidationError("A published policy version cannot be edited. Publish a new version in code for new terms.");
    await getD1().batch([getD1().prepare("INSERT INTO preorder_policies (version,terms,delay_response_days,reviewed_by,reviewed_at,enabled) VALUES (?,?,?,?,?,?) ON CONFLICT(version) DO UPDATE SET enabled=excluded.enabled").bind(PREORDER_POLICY,PREORDER_TERMS,days,actor,now(),input.enabled===true?1:0),eventStatement({actor,kind:"policy_review",detail:{reason,days,enabled:input.enabled}})]);
  } else if (input.action === "eligibility") {
    const sellerId = required(input.sellerId,"seller ID",100), supply = required(input.supplySource,"verified supply source");
    const [s] = await getDb().select().from(sellers).where(eq(sellers.id,sellerId)).limit(1);
    if (!s || s.sellerType !== "professional") throw new ValidationError("Only professional stores are eligible.");
    await getD1().batch([getD1().prepare("INSERT INTO preorder_seller_access (seller_id,approved,supply_source,reason,reviewed_by,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(seller_id) DO UPDATE SET approved=excluded.approved,supply_source=excluded.supply_source,reason=excluded.reason,reviewed_by=excluded.reviewed_by,updated_at=excluded.updated_at").bind(sellerId,input.approved===true?1:0,supply,reason,actor,now()),eventStatement({actor,kind:"seller_eligibility",detail:{sellerId,approved:input.approved,reason,supply}})]);
  } else await changeBatch(actor,required(input.batchId,"batch ID",100),input,true);
}
