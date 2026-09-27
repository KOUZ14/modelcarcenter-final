import { getD1 } from "@/db";
import { offerCheckoutCart, type CollectionOffer } from "./collection-offers";
import { one } from "./community";
import { attachStripeSession,buildCartReservation,releaseReservation } from "./inventory";
import { quoteCheckoutShipping,resolveCheckoutShipping } from "./checkout-shipping";
import { assertSellerPaymentsReady,createCheckoutSession,expireCheckoutSession,retrieveCheckoutSession } from "./stripe";
import { calculateServerTotals } from "./business";
import { parseCheckoutShippingAddress } from "./shipping-rules";
import { POLICY_VERSION } from "./legal";
import { config } from "./config";
import { ValidationError } from "./validation";

function destinationAgrees(offer:CollectionOffer,input:unknown){const address=parseCheckoutShippingAddress(input),agreed=JSON.parse(offer.destination);if(address.country.toUpperCase()!==agreed.country||address.zip.replace(/\s/g,'').toUpperCase()!==agreed.postalCode.replace(/\s/g,'').toUpperCase())throw new ValidationError('Use the destination agreed in the offer, or request a new agreement.');return address;}
export async function quoteCollectionOffer(user:{id:string;email:string},id:string,destination:unknown){const{offer,cart}=await offerCheckoutCart(user.id,id);destinationAgrees(offer,destination);return quoteCheckoutShipping(cart,destination,user.id,user.email);}
export async function cancelCollectionReservation(user:string,id:string){
  const offer=await one<CollectionOffer>("SELECT * FROM collection_offers WHERE id=? AND (buyer_id=? OR owner_id=?) AND status='reserved'",id,user,user);
  if(!offer)throw new ValidationError('Accepted reservation unavailable.');
  await closeCollectionCheckout(offer.buyer_id,id);
  const result=await getD1().prepare("UPDATE collection_offers SET status='withdrawn' WHERE id=? AND status='reserved'").bind(id).run();
  if(!result.meta.changes)throw new ValidationError('This reservation has already changed. Review the order status.');
}
export async function closeCollectionCheckout(user:string,id:string){const offer=await one<CollectionOffer>('SELECT * FROM collection_offers WHERE id=? AND buyer_id=?',id,user);if(!offer)throw new ValidationError('Offer unavailable.');if(!offer.checkout_id)return;const checkout=await one<{sessionId:string}>('SELECT stripe_checkout_session_id sessionId FROM checkout_reservations WHERE id=?',offer.checkout_id);if(checkout?.sessionId){const session=await retrieveCheckoutSession(checkout.sessionId);if(session.payment_status==='paid')throw new ValidationError('Payment is being reconciled. Please wait for your order.');if(session.status==='open')await expireCheckoutSession(session.id);}await releaseReservation(offer.checkout_id);}
export async function payCollectionOffer(user:{id:string;email:string},id:string,p:Record<string,unknown>){
  const {offer,cart:loaded}=await offerCheckoutCart(user.id,id);destinationAgrees(offer,p.destination);
  if(p.acceptedFinalQuote!==true||p.policyVersion!==POLICY_VERSION)throw new ValidationError('Accept the final shipping quote and current marketplace policies.');
  if(offer.payment_deadline!-Date.now()<31*60000)throw new ValidationError('The reservation window is closing. A new checkout cannot extend it.');
  await assertSellerPaymentsReady(loaded.seller.sellerStripeAccountId!,loaded.seller.sellerName);
  const shipping=await resolveCheckoutShipping(loaded,p.shippingSelection,user.id,p.destination);if(shipping.amountCents!==Number(p.shippingCents))throw new ValidationError('Shipping changed. Calculate and accept a fresh quote.');
  const cart={...loaded,totals:calculateServerTotals(loaded.items,shipping.amountCents,loaded.fee.marketplaceFeeBps)},expires=new Date(Math.min(offer.payment_deadline!,Date.now()+config.checkoutExpirationMinutes*60000)),checkout=buildCartReservation(cart,user.id,POLICY_VERSION,shipping,null,expires,true),db=getD1();
  await db.batch([...checkout.statements,db.prepare("UPDATE collection_offers SET checkout_id=?,status=CASE WHEN status='reserved' AND payment_deadline>? AND (checkout_id IS NULL OR NOT EXISTS(SELECT 1 FROM checkout_reservations WHERE id=checkout_id AND status='pending')) THEN status ELSE NULL END WHERE id=?").bind(checkout.reservationId,Date.now(),id),db.prepare('INSERT INTO collection_offer_checkouts (checkout_id,offer_id) VALUES (?,?)').bind(checkout.reservationId,id)]);
  let sessionId:string|null=null;try{const returnToken=crypto.randomUUID(),session=await createCheckoutSession({reservationId:checkout.reservationId,sellerId:cart.seller.sellerId,sellerStripeAccountId:cart.seller.sellerStripeAccountId!,items:cart.items,shippingCents:shipping.amountCents,marketplaceFeeBps:cart.fee.marketplaceFeeBps,platformFeeCents:cart.totals.platformFeeCents,expiresAt:expires,buyerUserId:user.id,buyerEmail:user.email,policyVersion:POLICY_VERSION,deliveryAddress:parseCheckoutShippingAddress(JSON.parse(shipping.quotedAddress!)),returnToken});sessionId=session.id;if(!session.url)throw new Error('Payment checkout unavailable.');await attachStripeSession(checkout.reservationId,session.id);return{url:session.url,reservationId:checkout.reservationId,sessionId:session.id,returnToken};}catch(e){const closed=!sessionId||await expireCheckoutSession(sessionId).then(()=>true).catch(()=>false);if(closed)await releaseReservation(checkout.reservationId);throw e;}
}
