import { getD1 } from "@/db";
import { assertContact, getPiece, notify, one, required, rows, run } from "./community";
import { startCollectorThread } from "./collector-messaging";
import { ValidationError } from "./validation";
import { POLICY_VERSION } from "./legal";
import { loadAuthoritativeCartItems,sellerCartFromRows } from "./inventory";
import { expireCollectionOffersIn } from "./collection-offer-maintenance";
export type CollectionOffer={id:string;root_id:string;item_id:string;buyer_id:string;owner_id:string;proposer_id:string;thread_id:string;status:string;price_cents:number;currency:string;terms:string;item_version:number;destination:string;expires_at:number;payment_deadline:number|null;checkout_id:string|null;created_at:number};
export const OFFER_MS=48*3600000,RESERVATION_MS=24*3600000;
export async function expireCollectionOffers(now=Date.now()){
  await expireCollectionOffersIn(getD1(),now);
}
async function listingTerms(itemId:string){return one<{id:string;title:string;currency:string;terms:string}>(`SELECT p.id,p.title,p.currency,json_object('listingId',p.id,'title',p.title,'catalogId',p.catalog_product_id,'condition',p.condition,'conditionNotes',p.condition_notes,'modelCondition',p.model_condition,'packageLength',p.package_length,'packageWidth',p.package_width,'packageHeight',p.package_height,'packageWeight',p.package_weight,'shipFrom',p.ship_from_address_id,'shippingMode',CASE WHEN s.seller_type='collector' THEN 'calculated' ELSE s.shipping_mode END,'shippingCents',s.default_shipping_cents,'handlingDays',s.handling_time_business_days,'currency',p.currency) terms FROM collection_items i JOIN products p ON p.id=i.listing_id JOIN sellers s ON s.id=p.seller_id WHERE i.id=? AND p.status='active' AND p.inventory_quantity=1 AND s.status='active' AND s.stripe_charges_enabled=1 AND s.stripe_payouts_enabled=1 AND s.seller_terms_version=? AND s.seller_terms_accepted_at IS NOT NULL`,itemId,POLICY_VERSION);}
export async function configureCollectionCommerce(user:string,p:Record<string,unknown>){
  const item=await getPiece(required(p.itemId,'Piece'),user);if(!item||item.ownerId!==user)throw new ValidationError('Piece unavailable.');
  await expireCollectionOffers();
  const committed=await one("SELECT id FROM collection_offers WHERE item_id=? AND status='reserved'",item.id);
  const state=String(p.availability);if(!['not_for_sale','open_to_offers','for_sale'].includes(state))throw new ValidationError('Invalid availability.');
  if(state==='not_for_sale'){await getD1().batch([getD1().prepare("UPDATE collection_offers SET status='withdrawn' WHERE item_id=? AND status='proposed'").bind(item.id),getD1().prepare("UPDATE collection_items SET availability='not_for_sale',version=version+1 WHERE id=? AND owner_id=?").bind(item.id,user),...(!committed&&item.listingId?[getD1().prepare("UPDATE products SET status='inactive' WHERE id=? AND reserved_quantity=0").bind(item.listingId)]:[])]);return {};}
  if(committed)throw new ValidationError('An accepted reservation remains committed until payment, cancellation or expiry.');
  if(!item.catalogId||item.visibility!=='public')throw new ValidationError('Confirm the exact catalog identity and publish this piece before enabling sales.');
  const listing=await one<{id:string}>(`SELECT p.id FROM products p JOIN sellers s ON s.id=p.seller_id WHERE p.id=? AND p.catalog_product_id=? AND s.owner_user_id=? AND p.inventory_quantity=1 AND p.reserved_quantity=0 AND p.status='active' AND p.availability_type!='preorder' AND p.package_length>0 AND p.package_width>0 AND p.package_height>0 AND p.package_weight>0 AND s.status='active' AND s.stripe_charges_enabled=1 AND s.stripe_payouts_enabled=1 AND s.seller_terms_version=? AND s.seller_terms_accepted_at IS NOT NULL`,required(p.listingId,'Single-piece listing'),item.catalogId,user,POLICY_VERSION);
  if(!listing)throw new ValidationError('Complete seller onboarding and an eligible single-piece listing with matching catalog and shipping details first.');
  const minimum=Number(p.minimumCents)||0;if(!Number.isSafeInteger(minimum)||minimum<0)throw new ValidationError('Enter a valid minimum offer.');
  await run("UPDATE collection_items SET listing_id=?,availability=?,minimum_cents=?,version=version+1 WHERE id=? AND owner_id=?",listing.id,state,minimum,item.id,user);return {};
}
export async function createCollectionOffer(user:string,p:Record<string,unknown>){
  await expireCollectionOffers();const item=await getPiece(required(p.itemId,'Piece'),user);if(!item||item.availability!=='open_to_offers'||item.visibility!=='public')throw new ValidationError('This piece is not accepting offers.');await assertContact(user,item.ownerId);
  const price=Number(p.priceCents);if(!Number.isSafeInteger(price)||price<Math.max(50,item.minimumCents))throw new ValidationError('Offer is below the visible minimum.');
  if(p.acceptedTerms!==true||Number(p.quantity)!==1)throw new ValidationError('Confirm quantity one and the offer terms.');
  const country=required(p.country,'Destination country',2).toUpperCase(),postal=required(p.postalCode,'Destination postal code',20);if(!/^[A-Z]{2}$/.test(country))throw new ValidationError('Use a two-letter country code.');
  if(await one("SELECT id FROM collection_offers WHERE buyer_id=? AND item_id=? AND status='declined' AND created_at>?",user,item.id,Date.now()-86400000))throw new ValidationError('Wait 24 hours after a decline before making another offer.');
  const listing=await listingTerms(item.id);if(!listing)throw new ValidationError('Seller or listing is no longer eligible.');
  const thread=await startCollectorThread(user,item.ownerId,item.id,true),id=crypto.randomUUID(),now=Date.now();
  await run("INSERT INTO collection_offers (id,root_id,item_id,buyer_id,owner_id,proposer_id,thread_id,price_cents,currency,terms,item_version,destination,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,id,item.id,user,item.ownerId,user,thread,price,listing.currency,listing.terms,item.version,JSON.stringify({country,postalCode:postal}),now+OFFER_MS,now);
  await offerMessage(id,user,'New offer');return {id,threadId:thread};
}
async function offerMessage(id:string,actor:string,label:string){const offer=(await one<CollectionOffer>('SELECT * FROM collection_offers WHERE id=?',id))!;await run('INSERT INTO collector_messages (id,thread_id,owner_id,body,offer_id,created_at) VALUES (?,?,?,?,?,?)',crypto.randomUUID(),offer.thread_id,actor,label,id,Date.now());await run('UPDATE collector_threads SET updated_at=? WHERE id=?',Date.now(),offer.thread_id);await notify(actor===offer.buyer_id?offer.owner_id:offer.buyer_id,actor,'transactional',label,`/messages?tab=offers&offer=${id}`);}
export async function changeCollectionOffer(user:string,p:Record<string,unknown>){
  await expireCollectionOffers();const offer=await one<CollectionOffer>('SELECT * FROM collection_offers WHERE id=? AND (buyer_id=? OR owner_id=?)',required(p.id,'Offer'),user,user);if(!offer)throw new ValidationError('Offer unavailable.');
  const action=String(p.action);if(offer.status!=='proposed')throw new ValidationError('This offer is no longer awaiting a response.');await assertContact(offer.buyer_id,offer.owner_id);
  if(action==='withdraw'||action==='decline'){if((action==='withdraw')!==(user===offer.proposer_id))throw new ValidationError('Choose an action for your role.');await run("UPDATE collection_offers SET status=? WHERE id=? AND status='proposed'",action==='withdraw'?'withdrawn':'declined',offer.id);await offerMessage(offer.id,user,action==='withdraw'?'Offer withdrawn':'Offer declined');return {};}
  if(user===offer.proposer_id)throw new ValidationError('The other collector must respond to this proposal.');
  const item=await getPiece(offer.item_id,user),listing=await listingTerms(offer.item_id);if(!item||item.availability!=='open_to_offers'||item.version!==offer.item_version||!listing||listing.terms!==offer.terms)throw new ValidationError('Item or shipping terms changed. Withdraw this offer and agree on new terms.');
  if(action==='counter'){const price=Number(p.priceCents);if(!Number.isSafeInteger(price)||price<Math.max(50,item.minimumCents))throw new ValidationError('Enter an amount at or above the visible minimum.');const id=crypto.randomUUID(),now=Date.now();await getD1().batch([getD1().prepare("UPDATE collection_offers SET status=CASE WHEN status='proposed' THEN 'superseded' ELSE NULL END WHERE id=?").bind(offer.id),getD1().prepare("INSERT INTO collection_offers (id,root_id,item_id,buyer_id,owner_id,proposer_id,thread_id,price_cents,currency,terms,item_version,destination,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,offer.root_id,offer.item_id,offer.buyer_id,offer.owner_id,user,offer.thread_id,price,offer.currency,offer.terms,offer.item_version,offer.destination,now+OFFER_MS,now)]);await offerMessage(id,user,'Counteroffer received');return {id};}
  if(action!=='accept'||p.acceptedTerms!==true)throw new ValidationError('Explicitly accept the current item, price and shipping terms.');
  await run("UPDATE collection_offers SET status=CASE WHEN status='proposed' AND expires_at>? THEN 'reserved' ELSE NULL END,payment_deadline=? WHERE id=?",Date.now(),Date.now()+RESERVATION_MS,offer.id);await offerMessage(offer.id,user,'Offer accepted — checkout required');return {};
}
export async function getCollectionOffers(user:string){await expireCollectionOffers();return rows<CollectionOffer>("SELECT * FROM collection_offers WHERE buyer_id=? OR owner_id=? ORDER BY created_at DESC LIMIT 100",user,user);}
export async function offerCheckoutCart(user:string,id:string){
  await expireCollectionOffers();const offer=await one<CollectionOffer>("SELECT * FROM collection_offers WHERE id=? AND buyer_id=? AND status='reserved' AND payment_deadline>?",id,user,Date.now());if(!offer)throw new ValidationError('This accepted offer is no longer eligible for checkout.');
  const listing=await listingTerms(offer.item_id);if(!listing||listing.terms!==offer.terms)throw new ValidationError('Item or shipping terms changed. Contact the seller before paying.');
  if(offer.checkout_id&&await one("SELECT id FROM checkout_reservations WHERE id=? AND status='pending'",offer.checkout_id))throw new ValidationError('An offer checkout is already open. Close it or wait for it to expire before retrying.');
  const items=await loadAuthoritativeCartItems([{productId:listing.id,quantity:1}],true);items[0].priceCents=offer.price_cents;
  return {offer,cart:sellerCartFromRows(items)};
}
