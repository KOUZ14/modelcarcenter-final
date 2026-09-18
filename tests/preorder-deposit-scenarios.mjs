import assert from 'node:assert/strict';
import { POLICY_VERSION } from '../lib/legal.ts';

export async function depositScenarios({t,api,sqlite,row,all,buyer,buyer2,sessions,refunds,reversals,transfers,disputes,future,pay,paid,setRefundOutcome}) {
  const store=()=>Object.fromEntries(Object.entries(row("SELECT * FROM sellers WHERE id='seller'")).map(([key,value])=>[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),value]));
  let sequence=0;
  const make=async(extra={})=>{
    const sku=`deposit-${++sequence}`;
    const payload={modelManufacturer:'MINI GT',manufacturerSku:sku,scale:'1:64',vehicleMake:'Porsche',vehicleModel:'911',color:'Blue',title:`Preorder ${sku}`,sellerSku:sku,price:'18.00',inventoryQuantity:3,modelCondition:'mint',packagingCondition:'mint',originalBoxStatus:'included',missingParts:'None',defects:'None',restorationCustomization:'None',coaStatus:'not_applicable',accessories:'None',availabilityType:'preorder',releaseDate:`${future}-01-31`,preorderBuyerLimit:3,...extra};
    const saved=await api.saveStoreProduct(store(),payload);
    sqlite.prepare("UPDATE products SET primary_image_url='/preview.jpg' WHERE id=?").run(saved.productId);
    await api.setStoreProductStatus(store(),saved.productId,'active');
    const b=row('SELECT * FROM incoming_batches WHERE listing_id=?',saved.productId);
    return {batchId:b.id,listingId:saved.productId,payload};
  };
  const hold=b=>api.holdPreorder(buyer,{batchId:b.batchId,quantity:1,revision:1,idempotencyKey:crypto.randomUUID()});
  const depositSession=async(r,user=buyer)=>{await api.startPreorderDeposit(user,r.id,true);return sessions.get(row('SELECT session_id id FROM preorder_deposit_checkouts WHERE reservation_id=?',r.id).id);};
  const payDeposit=async(r)=>{const s=await depositSession(r);s.status='complete';s.payment_status='paid';await api.processPreorderDepositStripeEvent({id:`evt_deposit_${s.id}`,type:'checkout.session.completed',data:{object:s}});return s;};
  const reserve=async(b)=>{const r=await hold(b);const session=await payDeposit(r);return {...r,session};};
  const ready=b=>api.changeBatch('owner',b.batchId,{action:'receipt',receivedQuantity:3,sellableQuantity:3,damagedQuantity:0,complete:true,reason:'Stock received'});
  const ledger=id=>row("SELECT * FROM preorder_payment_ledger WHERE reservation_id=? AND kind='deposit'",id);
  const refundsFor=r=>refunds.filter(f=>f.charge===r.session.payment_intent.latest_charge.id);
  setRefundOutcome('succeeded');

  await t.test('the normal listing form creates a deposit offer without extra seller or supply approvals',async()=>{
    sqlite.prepare("DELETE FROM preorder_seller_access WHERE seller_id='seller'").run();
    const b=await make(),p=row('SELECT * FROM products WHERE id=?',b.listingId),offer=(await api.publicPreorderOffers(b.listingId))[0];
    assert.equal(p.inventory_quantity,0);assert.equal(offer.remaining,3);assert.equal(offer.canReserve,true);
    assert.equal(offer.terms.paymentModel,'deposit_10');assert.equal(offer.terms.depositUnitCents,180);
    const r=await hold(b);await assert.rejects(()=>api.confirmPreorder(buyer.id,r.id,true),/10% deposit/);
    await assert.rejects(()=>api.startPreorderDeposit(buyer2,r.id,true),/not found/);
    await assert.rejects(()=>api.startPreorderDeposit(buyer,r.id,false),/Accept/);
    const s=await payDeposit(r);await payDepositReplay(s);
    assert.equal((await api.buyerReservation(buyer.id,r.id)).status,'reserved');
    assert.equal(ledger(r.id).amount_cents,305);assert.equal(ledger(r.id).subtotal_cents,180);
    assert.equal(row("SELECT count(*) n FROM preorder_payment_ledger WHERE reservation_id=? AND kind='deposit'",r.id).n,1);
    await assert.rejects(()=>api.saveStoreProduct(store(),{...b.payload,id:b.listingId,price:'25'}),/commitments/);
    await assert.rejects(()=>make({price:'4.99'}),/at least/);
  });
  async function payDepositReplay(s) { await api.processPreorderDepositStripeEvent({id:`evt_retry_${s.id}`,type:'checkout.session.completed',data:{object:s}}); }

  await t.test('deposit checkout retries reuse the accepted price and one Stripe session',async()=>{
    const r=await hold(await make());const s=await depositSession(r);const retry=await depositSession(r);
    assert.equal(s.id,retry.id);assert.match(s.request,/10%25\+preorder\+deposit/);
    const body=new URLSearchParams(s.request);assert.equal(body.get('line_items[0][price_data][unit_amount]'),'180');
    assert.equal(body.get('payment_method_types[0]'),'card');assert.equal(body.get('payment_intent_data[transfer_data][destination]'),null);
    assert.equal(body.get('success_url'),'https://mcc.test/account?view=orders&deposit=paid');
    assert.equal(body.get('cancel_url'),'https://mcc.test/account?view=orders&deposit=cancelled');
  });

  await t.test('late deposits and outdated seller terms refund instead of creating a commitment',async()=>{
    for (const why of ['expired','seller terms']) {
      const r=await hold(await make()),s=await depositSession(r);
      if(why==='expired')sqlite.prepare("UPDATE preorder_reservations SET hold_expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(r.id);
      else sqlite.prepare("UPDATE sellers SET seller_terms_version='old' WHERE id='seller'").run();
      s.status='complete';s.payment_status='paid';await payDepositReplay(s);
      assert.equal(ledger(r.id).refund_status,'succeeded');assert.equal(ledger(r.id).refunded_cents,305);
      assert.notEqual((await api.buyerReservation(buyer.id,r.id)).status,'reserved');
      sqlite.prepare("UPDATE sellers SET seller_terms_version=? WHERE id='seller'").run(POLICY_VERSION);
    }
  });

  await t.test('remaining checkout charges 90%, credits the deposit and combines actual processing fees',async()=>{
    const b=await make(),r=await reserve(b);await ready(b);
    const c=await pay(r.id),s=sessions.get(c.sessionId),body=new URLSearchParams(s.request);
    assert.equal(body.get('line_items[0][price_data][unit_amount]'),'1620');
    await paid(c);await paid(c);
    const order=row('SELECT * FROM orders WHERE checkout_reservation_id=?',c.reservationId);
    assert.equal(order.subtotal_cents,1800);assert.equal(order.total_cents,2650);assert.equal(order.tax_cents,250);
    assert.equal(order.preorder_deposit_cents,305);assert.equal(order.payment_processing_fee_cents,180);
    assert.equal(row('SELECT inventory_quantity q FROM products WHERE id=?',b.listingId).q,2);
    const tr=await api.createSellerTransfer({orderId:order.id,orderNumber:order.order_number,sellerId:'seller',sellerStripeAccountId:'acct_seller',chargeId:order.stripe_charge_id,transferGroup:order.stripe_transfer_group,amountCents:order.seller_proceeds_cents,currency:'usd',combinedPayments:true});
    assert.equal(tr.source_transaction,null);
    sqlite.prepare("UPDATE orders SET stripe_transfer_id=?,seller_transfer_amount_cents=?,seller_transfer_status='transferred' WHERE id=?").run(tr.id,tr.amount,order.id);
    setRefundOutcome('pending');
    await api.changeBatch('owner',b.batchId,{action:'cancel_batch',reasonCode:'seller_failure',reason:'Unable to dispatch'});
    await api.recoverPreorderOrderRefunds();
    const both=refunds.filter(f=>[order.stripe_charge_id,r.session.payment_intent.latest_charge.id].includes(f.charge));
    assert.equal(both.length,2);assert.equal(both.reduce((n,f)=>n+f.amount,0),order.total_cents);
    assert.equal(row('SELECT refunded_amount_cents n FROM orders WHERE id=?',order.id).n,0);
    for(const f of both) f.status='succeeded';
    await api.processPreorderDepositStripeEvent({id:'evt_both_refunded',type:'charge.refunded',data:{object:{id:r.session.payment_intent.latest_charge.id}}});
    await api.reconcilePreorderOrderRefunds(order.id);
    const after=row('SELECT * FROM orders WHERE id=?',order.id);
    assert.equal(after.payment_status,'refunded');assert.equal(after.refunded_amount_cents,2650);
    assert.equal(after.seller_transfer_reversed_cents,tr.amount);
    assert.equal(all("SELECT * FROM preorder_refund_requests WHERE order_id=? AND status='succeeded'",order.id).length,1);
    setRefundOutcome('succeeded');
  });

  await t.test('buyer cancellation retains the deposit; the seller can refund it even after settlement',async()=>{
    const r=await reserve(await make());await api.updateBuyerPreorder(buyer.id,r.id,{action:'cancel'});await api.recoverPreorderRefunds();
    assert.equal(ledger(r.id).refund_status,'not_required');assert.equal(refundsFor(r).length,0);
    sqlite.prepare("UPDATE preorder_reservations SET updated_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(r.id);
    const before=transfers.size;await api.settleForfeitedPreorderDeposits();await api.settleForfeitedPreorderDeposits();assert.equal(transfers.size,before+1);
    const checkout=row('SELECT * FROM preorder_deposit_checkouts WHERE reservation_id=?',r.id);assert.ok(checkout.seller_transfer_amount_cents>0);
    const reversalsBefore=reversals.size;await api.refundPreorderDeposit('owner',r.id,'Seller courtesy refund');await api.recoverPreorderRefunds();
    assert.equal(ledger(r.id).refund_status,'succeeded');assert.equal(refundsFor(r).length,1);assert.equal(reversals.size,reversalsBefore+1);
    assert.equal(row('SELECT seller_transfer_reversed_cents n FROM preorder_deposit_checkouts WHERE reservation_id=?',r.id).n,checkout.seller_transfer_amount_cents);
  });

  await t.test('seller cancellation, declined delays and unavailable stock return the full deposit',async()=>{
    for(const cause of ['cancel','delay','shortage']) {
      const b=await make(),r=await reserve(b);
      if(cause==='cancel')await api.changeBatch('owner',b.batchId,{action:'cancel_batch',reasonCode:'manufacturer_cancelled',reason:'Production cancelled'});
      if(cause==='delay'){await api.changeBatch('owner',b.batchId,{action:'delay',dispatch:{precision:'day',start:`${future}-03-01`},reason:'Manufacturer delay'});await api.updateBuyerPreorder(buyer.id,r.id,{action:'cancel'});}
      if(cause==='shortage')await api.changeBatch('owner',b.batchId,{action:'receipt',receivedQuantity:0,sellableQuantity:0,damagedQuantity:0,complete:true,reason:'No stock available'});
      await api.recoverPreorderRefunds();assert.equal(ledger(r.id).refund_status,'succeeded',cause);assert.equal(refundsFor(r)[0].amount,305);
    }
  });

  await t.test('missing a ready-stock payment deadline retains the deposit and releases inventory',async()=>{
    const b=await make(),r=await reserve(b);await ready(b);
    sqlite.prepare("UPDATE preorder_reservations SET payment_deadline='2000-01-01T00:00:00.000Z' WHERE id=?").run(r.id);
    await api.cancelPreorder(r.id,'system','response_deadline_expired',true);
    assert.equal((await api.buyerReservation(buyer.id,r.id)).reason,'payment_deadline_expired');
    assert.equal(ledger(r.id).refund_status,'not_required');assert.equal(row('SELECT reserved_quantity n FROM products WHERE id=?',b.listingId).n,0);
  });

  await t.test('cancellation records a refund obligation even if the request ends before recovery runs',async()=>{
    const r=await reserve(await make());
    sqlite.prepare("UPDATE preorder_reservations SET status='cancelled',reason='seller_failure' WHERE id=?").run(r.id);
    assert.equal(ledger(r.id).refund_status,'required');
    await api.recoverPreorderRefunds();assert.equal(ledger(r.id).refunded_cents,305);
  });

  await t.test('partial order refunds serialize requests and settle both charges without exceeding the total',async()=>{
    const b=await make(),r=await reserve(b);await ready(b);const c=await pay(r.id);await paid(c);
    const order=row('SELECT * FROM orders WHERE checkout_reservation_id=?',c.reservationId);
    const input={orderId:order.id,paymentIntentId:order.stripe_payment_intent_id,paymentFlow:'separate',totalCents:order.total_cents};
    setRefundOutcome('pending');
    const first=await api.createPreorderOrderRefund({...input,amountCents:500});assert.equal(first.status,'pending');
    await assert.rejects(()=>api.createPreorderOrderRefund({...input,amountCents:600}),/already processing/);
    assert.throws(()=>sqlite.prepare("INSERT INTO preorder_refund_requests (id,order_id,target_cents,created_at) VALUES ('competing',?,600,CURRENT_TIMESTAMP)").run(order.id),/UNIQUE/);
    const partial=refunds.find(f=>f.charge===order.stripe_charge_id);partial.status='succeeded';
    await api.reconcilePreorderOrderRefunds(order.id);assert.equal(row('SELECT refunded_amount_cents n FROM orders WHERE id=?',order.id).n,500);
    assert.equal(row('SELECT refund_status s FROM preorder_payment_ledger WHERE session_id=?',c.sessionId).s,'not_required','A completed partial refund is not left pending');
    setRefundOutcome('succeeded');await api.createPreorderOrderRefund({...input,refundedAmountCents:500});
    const after=row('SELECT * FROM orders WHERE id=?',order.id);assert.equal(after.payment_status,'refunded');assert.equal(after.refunded_amount_cents,2650);
    assert.equal(refunds.filter(f=>[order.stripe_charge_id,r.session.payment_intent.latest_charge.id].includes(f.charge)).reduce((n,f)=>n+f.amount,0),2650);
  });

  await t.test('deposit disputes block balance payment and match the final order when already converted',async()=>{
    const b=await make(),r=await reserve(b);await ready(b);
    const charge=r.session.payment_intent.latest_charge.id,event={id:'evt_dep_dispute',type:'charge.dispute.created',data:{object:{id:'dp_dep',charge,status:'needs_response',amount:305,currency:'usd'}}};
    disputes.set('dp_dep',{...event.data.object});await api.processPreorderDepositStripeEvent(event);
    await assert.rejects(()=>api.preorderPaymentCart(buyer.id,r.id),/deposit needs/);
    disputes.set('dp_dep',{...event.data.object,status:'won'});await api.processPreorderDepositStripeEvent({...event,id:'evt_dep_won'});
    const c=await pay(r.id);await paid(c);const order=row('SELECT * FROM orders WHERE checkout_reservation_id=?',c.reservationId);
    disputes.set('dp_dep',{...event.data.object,status:'needs_response'});
    const reopened={...event,id:'evt_dep_reopened'};assert.equal(await api.processPreorderDepositStripeEvent(reopened),null);await api.processStripeEvent(reopened);
    assert.equal(row("SELECT order_id id FROM disputes WHERE id='dp_dep'").id,order.id);
  });
}
