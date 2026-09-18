import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { drizzle } from 'drizzle-orm/d1';
import { config } from '../lib/config.ts';
import { POLICY_VERSION } from '../lib/legal.ts';
import { dateWindow, capacitySummary } from '../lib/preorder-rules.ts';
import { depositScenarios } from './preorder-deposit-scenarios.mjs';

test('preorder windows preserve quarter/month precision and reject invented dates',()=>{
  assert.deepEqual(dateWindow({precision:'quarter',start:'2027-Q1',end:'2027-Q2'}),{start:'2027-01-01T00:00:00.000Z',end:'2027-06-30T23:59:59.999Z',precision:'quarter',label:'Q1 2027 – Q2 2027'});
  assert.equal(dateWindow({precision:'month',start:'2027-02'}).end,'2027-02-28T23:59:59.999Z');
  assert.equal(dateWindow({precision:'unknown'}).end,null);
  assert.throws(()=>dateWindow({precision:'day',start:'2027-02-30'}),/calendar/);
  assert.deepEqual(capacitySummary(6,0,10,0),{remaining:0,shortage:4});
});

test('preorder database and checkout lifecycle',async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),scratch=await mkdtemp(join(root,'.preorder-test-')),bundle=join(scratch,'api.mjs');
  const sqlite=new DatabaseSync(':memory:');
  for(const file of (await readdir(join(root,'drizzle'))).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(await readFile(join(root,'drizzle',file),'utf8'));
  sqlite.exec('PRAGMA foreign_keys=ON');
  const binding={prepare(query){let values=[];return {bind(...args){values=args;return this;},async raw(){const s=sqlite.prepare(query);s.setReturnArrays(true);return s.all(...values);},async all(){return {results:sqlite.prepare(query).all(...values),success:true};},async first(column){const row=sqlite.prepare(query).get(...values);return column?row?.[column]??null:row??null;},async run(){const r=sqlite.prepare(query).run(...values);return {success:true,meta:{changes:r.changes}};}};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  for(const id of ['buyer','buyer2','owner','owner2'])sqlite.prepare('INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)').run(id,id,`${id}@example.test`);
  for(const [id,owner] of [['seller','owner'],['seller2','owner2']])sqlite.prepare(`INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,status,stripe_account_id,stripe_charges_enabled,stripe_payouts_enabled,seller_terms_version,seller_terms_accepted_at,shipping_mode,default_shipping_cents,shipping_origin_street_1,shipping_origin_city,shipping_origin_region,shipping_origin_postal_code,shipping_origin_phone) VALUES (?,?,?,'Diecast Store','Owner',?,'active',?,1,1,?,CURRENT_TIMESTAMP,'flat',600,'100 Market St','San Francisco','CA','94105','4155550100')`).run(id,owner,id,`${owner}@example.test`,`acct_${id}`,POLICY_VERSION);
  const sessions=new Map(),refunds=[],emails=[],reversals=new Map(),transfers=new Map(),disputes=new Map();
  let refundOutcome='pending';
  globalThis.__preorderFixture={db:drizzle(binding),binding,emails,config:{...config,betterAuthSecret:'preorder-fixture-signing-secret-not-for-production',marketplaceMode:'test',stripeSecretKey:'sk_test_preorder',siteUrl:'https://mcc.test',automaticTax:true,stripeTaxBehavior:'exclusive'}};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(input);assert.equal(url.origin,'https://api.stripe.com');const body=new URLSearchParams(init.body);
    if(url.pathname.startsWith('/v1/accounts/'))return Response.json({charges_enabled:true,payouts_enabled:true});
    if(url.pathname==='/v1/customers')return Response.json({id:'cus_test'});
    if(url.pathname==='/v1/checkout/sessions' && init.method !== 'POST')return Response.json({data:[...sessions.values()],has_more:false});
    if(url.pathname==='/v1/checkout/sessions'){
      const key=init.headers['Idempotency-Key'];const previous=[...sessions.values()].find(s=>s.key===key);if(previous)return Response.json(previous);
      const id=`cs_test_${sessions.size+1}`,metadata=Object.fromEntries([...body].filter(([k])=>/^metadata\[/.test(k)).map(([k,v])=>[k.slice(9,-1),v]));
      let base=0;for(let i=0;body.has(`line_items[${i}][quantity]`);i++)base+=Number(body.get(`line_items[${i}][quantity]`))*Number(body.get(`line_items[${i}][price_data][unit_amount]`));
      const session={id,key,request:body.toString(),created:Math.floor(Date.now()/1000),url:`https://checkout.stripe.com/${id}`,status:'open',payment_status:'unpaid',metadata,amount_subtotal:base,amount_total:base+125,currency:'usd',total_details:{amount_tax:125},customer_details:{email:'buyer@example.test'},payment_intent:{id:`pi_${id}`,latest_charge:{id:`ch_${id}`,balance_transaction:{fee:90}}}};
      sessions.set(id,session);return Response.json(session);
    }
    if(url.pathname.startsWith('/v1/checkout/sessions/')){const session=sessions.get(url.pathname.split('/')[4]);assert.ok(session);if(url.pathname.endsWith('/expire'))session.status='expired';return Response.json(session);}
    if(url.pathname==='/v1/refunds'&&init.method==='POST'){const key=init.headers['Idempotency-Key'];let refund=refunds.find(r=>r.key===key);if(!refund){refund={id:`re_${refunds.length}`,status:refundOutcome,key,amount:Number(body.get('amount')),charge:body.get('charge'),metadata:{order_id:body.get('metadata[order_id]')}};refunds.push(refund);}return Response.json(refund);}
    if(url.pathname==='/v1/refunds')return Response.json({data:refunds.filter(r=>r.charge===url.searchParams.get('charge')),has_more:false});
    if(url.pathname==='/v1/transfers'&&init.method==='POST'){const key=init.headers['Idempotency-Key'];if(!transfers.has(key))transfers.set(key,{id:`tr_${transfers.size}`,amount:Number(body.get('amount')),amount_reversed:0,metadata:{order_id:body.get('metadata[order_id]')},transfer_group:body.get('transfer_group'),source_transaction:body.get('source_transaction')});return Response.json(transfers.get(key));}
    if(url.pathname==='/v1/transfers')return Response.json({data:[...transfers.values()].filter(r=>r.transfer_group===url.searchParams.get('transfer_group')),has_more:false});
    if(url.pathname.startsWith('/v1/disputes/'))return Response.json(disputes.get(url.pathname.split('/').at(-1)));
    if(/^\/v1\/transfers\/.+\/reversals$/.test(url.pathname)){const key=init.headers['Idempotency-Key'];if(!reversals.has(key))reversals.set(key,{id:`trr_${reversals.size}`,amount:Number(body.get('amount'))});return Response.json(reversals.get(key));}
    if(url.pathname.startsWith('/v1/refunds/'))return Response.json(refunds.find(r=>r.id===url.pathname.split('/').at(-1)));
    throw new Error(`Unexpected Stripe request ${url.pathname}`);
  };
  t.after(async()=>{globalThis.fetch=originalFetch;delete globalThis.__preorderFixture;sqlite.close();await unlink(bundle);await rmdir(scratch);});
  const mocks={db:'export const getDb=()=>globalThis.__preorderFixture.db;export const getD1=()=>globalThis.__preorderFixture.binding;',config:'export const config=globalThis.__preorderFixture.config;export const requireConfig=k=>config[k];',email:'export const sendLabelCreatedEmail=async()=>{};export const sendShipmentEmail=async()=>{};export const sendPaidOrderEmails=async v=>globalThis.__preorderFixture.emails.push(v);export const sendEmail=async v=>{globalThis.__preorderFixture.emails.push(v);return {sent:true};};export const escapeHtml=v=>String(v);'};
  const output=await build({stdin:{contents:`export * from './lib/preorders.ts';export * from './lib/preorder-payments.ts';export * from './lib/preorder-maintenance.ts';export * from './lib/preorder-waitlist.ts';export * from './lib/orders.ts';export * from './lib/inventory.ts';export * from './lib/catalog-products.ts';export * from './lib/preorder-deposits.ts';export * from './lib/preorder-order-refunds.ts';export {saveStoreProduct,setStoreProductStatus} from './lib/store.ts';export {createSellerTransfer} from './lib/stripe.ts';`,resolveDir:root},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},({path})=>{const mock=path==='@/db'?'db':/\/(config|email)(\.ts)?$/.exec(path)?.[1];if(mock)return {path:mock,namespace:'fixture'};if(path.startsWith('@/'))return {path:join(root,`${path.slice(2)}.ts`)};});b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:mocks[path]}));}}]});
  await writeFile(bundle,output.outputFiles[0].contents);const api=await import(pathToFileURL(bundle).href);
  const row=(sql,...args)=>sqlite.prepare(sql).get(...args),all=(sql,...args)=>sqlite.prepare(sql).all(...args);
  const future=new Date().getUTCFullYear()+2;
  const base={modelManufacturer:'MINI GT',manufacturerSku:'shared-assortment',vehicleMake:'Porsche',vehicleModel:'911',scale:'1:64',color:'blue',variant:'Regular blue, boxed',contents:'One regular model',saleUnit:'model',unitsPerPack:1,price:'18.00',buyerLimit:10,requestedQuantity:20,confirmedAllocation:20,capacity:20,safetyBuffer:2,supplierReference:'Supplier A',evidenceReference:'invoice-123',estimateSource:'Supplier confirmation',shippingBasis:'USPS flat rate',shippingEstimate:'6.00',receipt:{precision:'month',start:`${future}-01`},dispatch:{precision:'quarter',start:`${future}-Q1`},opensAt:new Date(Date.now()-86400000).toISOString(),cutoffAt:`${future}-01-01T00:00:00.000Z`,timezone:'America/Los_Angeles'};
  const buyer={id:'buyer',email:'buyer@example.test'},buyer2={id:'buyer2',email:'buyer2@example.test'};
  await api.adminPreorderAction('admin',{action:'policy',reviewed:true,enabled:true,delayResponseDays:7,reason:'Policy reviewed'});
  for(const sellerId of ['seller','seller2'])await api.adminPreorderAction('admin',{action:'eligibility',sellerId,approved:true,supplySource:'Verified dealer',reason:'Supply source checked'});
  const make=async(extra={},owner='owner')=>{const b=await api.createIncomingBatch(owner,{...base,...extra});await api.changeBatch('admin',b.batchId,{action:'review_evidence',reason:'Allocation documentation checked'},true);await api.changeBatch(owner,b.batchId,{action:'open',reason:'Ready'});return b;};
  const reserve=async(b,quantity=1,user=buyer,key=crypto.randomUUID())=>{const rev=row('SELECT revision FROM incoming_batches WHERE id=?',b.batchId).revision;const h=await api.holdPreorder(user,{batchId:b.batchId,quantity,revision:rev,idempotencyKey:key});return api.confirmPreorder(user.id,h.id,true);};
  let batch,reservation,checkout;
  await t.test('two sellers share the catalog but not their offers; variant SKU reuse stays distinct',async()=>{
    batch=await make();const second=await make({price:'25.00'},'owner2');
    assert.equal(row('SELECT catalog_product_id id FROM products WHERE id=?',batch.listingId).id,row('SELECT catalog_product_id id FROM products WHERE id=?',second.listingId).id);
    assert.notEqual(batch.batchId,second.batchId);
    const different=await api.createIncomingBatch('owner',{...base,color:'red',variant:'Red boxed',confirmDifferentModel:true});
    assert.notEqual(row('SELECT catalog_product_id id FROM products WHERE id=?',batch.listingId).id,row('SELECT catalog_product_id id FROM products WHERE id=?',different.listingId).id);
    assert.equal(row('SELECT inventory_quantity q FROM products WHERE id=?',batch.listingId).q,0);
  });
  await t.test('unknown estimates and unknown prices only accept interest, and cases have explicit units',async()=>{
    const b=await api.createIncomingBatch('owner',{...base,price:'',dispatch:{precision:'unknown'},saleUnit:'case',unitsPerPack:10,contents:'Ten-car assortment; no guaranteed chase'});
    const offers=await api.publicPreorderOffers(b.listingId);assert.equal(offers[0].canReserve,false);assert.equal(offers[0].terms.unitsPerPack,10);
    await assert.rejects(()=>reserve(b),/interest only/);
  });
  await t.test('holds and confirmation are idempotent; final-slot contention never exceeds capacity',async()=>{
    const last=await make({capacity:1,confirmedAllocation:1,safetyBuffer:0});
    const attempts=await Promise.allSettled([reserve(last,1,buyer,'last-a'),reserve(last,1,buyer2,'last-b')]);
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(row("SELECT SUM(quantity) q FROM preorder_reservations WHERE batch_id=? AND status='reserved'",last.batchId).q,1);
    reservation=await reserve(batch,10,buyer,'first');const retry=await reserve(batch,10,buyer,'first');assert.equal(retry.id,reservation.id);
    await reserve(batch,8,buyer2);await assert.rejects(()=>reserve(batch,1,buyer2),/interest only|capacity/i);
    assert.equal((await api.batchCapacity((await api.ownedBatch('owner',batch.batchId)).batch)).committed,18);
    await assert.rejects(()=>api.loadAuthoritativeCart([{productId:batch.listingId,quantity:1}]),/is a preorder/);
  });
  await t.test('shortages identify later commitments and preserve priority and original dates',async()=>{
    const b=await make({capacity:10,confirmedAllocation:10,safetyBuffer:0});const early=await reserve(b,6),late=await reserve(b,4,buyer2);
    await api.changeBatch('owner',b.batchId,{action:'capacity',capacity:6,confirmedAllocation:6,reason:'supplier shortage'});
    assert.equal(row('SELECT shortage FROM incoming_batches WHERE id=?',b.batchId).shortage,4);
    assert.equal((await api.buyerReservation(buyer.id,early.id)).consentState,'accepted');assert.equal((await api.buyerReservation(buyer2.id,late.id)).consentState,'required');
    const original=late.terms;await api.changeBatch('owner',b.batchId,{action:'delay',dispatch:{precision:'quarter',start:`${future}-Q2`},reason:'supplier production delay'});
    const after=await api.buyerReservation(buyer2.id,late.id);assert.equal(after.terms,original);assert.equal(after.acceptedSequence,late.acceptedSequence);
    await assert.rejects(()=>api.preorderPaymentCart(buyer2.id,late.id),/not available/);
  });
  await t.test('partial receipts hold only inspected stock and buyer accepts missing-unit cancellation',async()=>{
    const b=await make({capacity:4,confirmedAllocation:4,safetyBuffer:0}),r=await reserve(b,4);
    const receipt={action:'receipt',receivedQuantity:4,sellableQuantity:2,damagedQuantity:2,complete:true,reason:'Two damaged boxes'};
    await api.changeBatch('owner',b.batchId,receipt);await api.changeBatch('owner',b.batchId,receipt);
    assert.equal((await api.buyerReservation(buyer.id,r.id)).status,'allocated');assert.equal(row('SELECT reserved_quantity q FROM products WHERE id=?',b.listingId).q,2);
    await assert.rejects(()=>api.preorderPaymentCart(buyer.id,r.id),/not available/);
    await api.updateBuyerPreorder(buyer.id,r.id,{action:'accept_partial'});
    assert.equal((await api.buyerReservation(buyer.id,r.id)).quantity,2);
    await api.updateBuyerPreorder(buyer.id,r.id,{action:'cancel'});await api.updateBuyerPreorder(buyer.id,r.id,{action:'cancel'});
    assert.equal(row('SELECT reserved_quantity q FROM products WHERE id=?',b.listingId).q,0);
  });
  const destination={name:'Ada Buyer',street1:'123 Main St',street2:'',city:'Los Angeles',state:'CA',zip:'90012',country:'US'};
  const pay=id=>api.startPreorderPayment(buyer,id,{destination,shippingSelection:{rateId:'flat'},shippingCents:600,acceptedFinalQuote:true,policyVersion:POLICY_VERSION});
  const paid=async c=>{const s=sessions.get(c.sessionId);s.status='complete';s.payment_status='paid';return api.processStripeEvent({id:`evt_${s.id}`,type:'checkout.session.completed',data:{object:{id:s.id}}});};
  await t.test('pay-when-ready locks item price, consumes allocation once and preserves consumed capacity',async()=>{
    await api.changeBatch('owner',batch.batchId,{action:'receipt',receivedQuantity:20,sellableQuantity:18,damagedQuantity:2,complete:true,reason:'Received and checked'});
    sqlite.prepare('UPDATE products SET price_cents=9900 WHERE id=?').run(batch.listingId);
    const cart=await api.preorderPaymentCart(buyer.id,reservation.id);assert.equal(cart.cart.items[0].priceCents,1800);
    checkout=await pay(reservation.id);assert.equal(row('SELECT reserved_quantity q FROM products WHERE id=?',batch.listingId).q,18);
    await paid(checkout);await paid(checkout);
    assert.equal((await api.buyerReservation(buyer.id,reservation.id)).status,'converted');
    assert.equal(row('SELECT inventory_quantity q FROM products WHERE id=?',batch.listingId).q,8);
    assert.equal(row('SELECT reserved_quantity q FROM products WHERE id=?',batch.listingId).q,8);
    assert.equal(row('SELECT COUNT(*) n FROM orders WHERE checkout_reservation_id=?',checkout.reservationId).n,1);
    assert.equal((await api.batchCapacity((await api.ownedBatch('owner',batch.batchId)).batch)).committed,18);
  });
  await t.test('failed checkout holds allocation until expiry and late paid success becomes a pending refund',async()=>{
    const b=await make({capacity:1,confirmedAllocation:1,safetyBuffer:0}),r=await reserve(b);
    await api.changeBatch('owner',b.batchId,{action:'receipt',receivedQuantity:1,sellableQuantity:1,damagedQuantity:0,complete:true,reason:'Received'});
    const c=await pay(r.id);await api.releaseReservation(c.reservationId);
    assert.equal(row('SELECT reserved_quantity q FROM products WHERE id=?',b.listingId).q,1);
    sqlite.prepare("UPDATE preorder_reservations SET payment_deadline='2000-01-01T00:00:00.000Z' WHERE id=?").run(r.id);
    await api.cancelPreorder(r.id,'system','payment_expired',true);await paid(c);
    assert.equal(row('SELECT reserved_quantity q FROM products WHERE id=?',b.listingId).q,0);
    assert.equal(row('SELECT COUNT(*) n FROM orders WHERE checkout_reservation_id=?',c.reservationId).n,0);
    const ledger=row('SELECT * FROM preorder_payment_ledger WHERE session_id=?',c.sessionId);assert.equal(ledger.refund_status,'pending');
    await api.recoverPreorderRefunds();assert.equal(refunds.length,1);
    refunds[0].status='failed';
    await api.processStripeEvent({id:'evt_refund_failed',type:'refund.failed',data:{object:{id:ledger.refund_id,status:'failed'}}});
    assert.equal(row('SELECT refund_status status FROM preorder_payment_ledger WHERE session_id=?',c.sessionId).status,'failed');
  });
  await t.test('authorization, immutable terms and transactional notices survive retries',async()=>{
    await assert.rejects(()=>api.buyerReservation('buyer2',reservation.id),/not found/);
    await assert.rejects(()=>api.ownedBatch('owner2',batch.batchId),/does not belong/);
    assert.throws(()=>sqlite.prepare('UPDATE preorder_reservations SET terms=? WHERE id=?').run('{}',reservation.id),/immutable/);
    await api.deliverPreorderNotices();const count=emails.length;await api.deliverPreorderNotices();assert.equal(emails.length,count);
    assert.ok(all("SELECT * FROM preorder_events WHERE delivery_status='sent'").length>0);
  });
  await t.test('waitlist invitations hold a slot but require fresh terms acceptance and expire without charges',async()=>{
    const b=await make({capacity:1,confirmedAllocation:1,safetyBuffer:0});
    await api.joinPreorderWaitlist(buyer,b.batchId,1);await api.joinPreorderWaitlist(buyer,b.batchId,1);
    assert.equal(row('SELECT count(*) n FROM preorder_waitlist WHERE batch_id=?',b.batchId).n,1);
    await api.inviteNextWaitlisted('owner',b.batchId);
    const invite=row('SELECT * FROM preorder_waitlist WHERE batch_id=?',b.batchId);
    assert.equal((await api.buyerReservation(buyer.id,invite.reservation_id)).status,'hold');
    await assert.rejects(()=>reserve(b,1,buyer2),/interest only/);
    await api.confirmPreorder(buyer.id,invite.reservation_id,true);
    assert.equal((await api.buyerReservation(buyer.id,invite.reservation_id)).status,'reserved');
    assert.equal(row('SELECT status FROM preorder_waitlist WHERE id=?',invite.id).status,'reserved');
    const b2=await make({capacity:1,confirmedAllocation:1,safetyBuffer:0});await api.joinPreorderWaitlist(buyer2,b2.batchId,1);await api.inviteNextWaitlisted('owner',b2.batchId);
    const i2=row('SELECT * FROM preorder_waitlist WHERE batch_id=?',b2.batchId);
    sqlite.prepare("UPDATE preorder_reservations SET hold_expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(i2.reservation_id);
    await api.processPreorders();await api.processPreorders();
    assert.equal(row('SELECT status FROM preorder_waitlist WHERE id=?',i2.id).status,'expired');
  });
  await t.test('expiry rechecks current deadlines and consent to avoid cancelling a rescued reservation',async()=>{
    const b=await make({capacity:1,confirmedAllocation:1,safetyBuffer:0}),r=await reserve(b);
    await api.changeBatch('owner',b.batchId,{action:'delay',dispatch:{precision:'quarter',start:`${future}-Q2`},reason:'New supplier estimate'});
    await api.updateBuyerPreorder(buyer.id,r.id,{action:'keep',revision:2});
    await api.cancelPreorder(r.id,'system','response_deadline_expired',true);
    assert.equal((await api.buyerReservation(buyer.id,r.id)).status,'reserved');
    sqlite.prepare("UPDATE preorder_reservations SET consent_state='required',consent_deadline='2000-01-01T00:00:00.000Z' WHERE id=?").run(r.id);
    await api.processPreorders();assert.equal((await api.buyerReservation(buyer.id,r.id)).status,'expired');
    assert.equal((await api.buyerReservation(buyer.id,r.id)).reason,'delay_consent_expired');
  });
  await t.test('availability watches notify supported open offers once without creating a commitment',async()=>{
    const b=await make({capacity:1,confirmedAllocation:1,safetyBuffer:0});
    await api.changeBatch('owner',b.batchId,{action:'close',reason:'Wait for opening'});
    sqlite.prepare("INSERT INTO availability_alerts (id,product_id,email,unsubscribe_token,status,consent_at) VALUES ('watch',?,'watch@example.test','watch-token','active',?)").run(b.listingId,new Date().toISOString());
    await api.processPreorders();assert.equal(emails.filter(e=>e.to==='watch@example.test').length,0);
    await api.changeBatch('owner',b.batchId,{action:'open',reason:'Ready for reservations'});
    await api.processPreorders();await api.processPreorders();
    const sent=emails.filter(e=>e.to==='watch@example.test');assert.equal(sent.length,1);
    assert.match(sent[0].text,/has not reserved a unit/);assert.ok(sent[0].unsubscribeUrl);
    assert.equal(row('SELECT count(*) n FROM preorder_reservations WHERE batch_id=?',b.batchId).n,0);
  });
  await t.test('operations distinguish cancellation reasons and unpaid interest from shipped sales',async()=>{
    const overview=await api.preorderOperations();
    assert.ok(overview.cancellations.some(c=>c.reason==='delay_consent_expired'));
    assert.ok(overview.cancellations.every(c=>c.percent>=0&&c.percent<=100));
    const seller=await api.sellerPreorders('owner');
    assert.ok(seller.batches.every(b=>b.metrics.watchers>=0&&b.metrics.waitlisted>=0&&b.metrics.shipped>=0));
  });
  await t.test('seller terms are revalidated when a held reservation is confirmed',async()=>{
    const b=await make({capacity:1,confirmedAllocation:1,safetyBuffer:0});
    const hold=await api.holdPreorder(buyer,{batchId:b.batchId,quantity:1,revision:1,idempotencyKey:'terms-recheck'});
    sqlite.prepare("UPDATE sellers SET seller_terms_version='outdated' WHERE id='seller'").run();
    await assert.rejects(()=>api.confirmPreorder(buyer.id,hold.id,true),/no longer available/);
    sqlite.prepare("UPDATE sellers SET seller_terms_version=? WHERE id='seller'").run(POLICY_VERSION);
  });
  await t.test('paid batch cancellation refunds the remaining balance and reverses transfers without trusting stale events',async()=>{
    const b=await make({capacity:1,confirmedAllocation:1,safetyBuffer:0}),r=await reserve(b);
    await api.changeBatch('owner',b.batchId,{action:'receipt',receivedQuantity:1,sellableQuantity:1,damagedQuantity:0,complete:true,reason:'Received and inspected'});
    const c=await pay(r.id);await paid(c);
    const order=row('SELECT * FROM orders WHERE checkout_reservation_id=?',c.reservationId);
    sqlite.prepare("UPDATE orders SET stripe_transfer_id='tr_preorder',seller_transfer_amount_cents=seller_proceeds_cents,seller_transfer_status='transferred' WHERE id=?").run(order.id);
    refunds.push({id:'re_prior_partial',status:'succeeded',key:`seller-refund-${order.id}-0`,amount:100,charge:order.stripe_charge_id,metadata:{order_id:order.id}});
    refundOutcome='succeeded';
    await api.changeBatch('owner',b.batchId,{action:'cancel_batch',reasonCode:'seller_failure',reason:'Cannot fulfill inspected unit'});
    await api.changeBatch('owner',b.batchId,{action:'cancel_batch',reasonCode:'seller_failure',reason:'Retry cancellation'});
    const chargeRefunds=refunds.filter(f=>f.charge===order.stripe_charge_id);
    assert.equal(chargeRefunds.length,2);assert.equal(chargeRefunds.reduce((s,f)=>s+f.amount,0),order.total_cents);
    assert.equal(row('SELECT refund_status s FROM preorder_payment_ledger WHERE session_id=?',c.sessionId).s,'succeeded');
    const event={type:'charge.refunded',data:{object:{id:order.stripe_charge_id,payment_intent:order.stripe_payment_intent_id,amount_refunded:100}}};
    await api.processStripeEvent({...event,id:'evt_preorder_partial_stale'});
    await api.processStripeEvent({...event,id:'evt_preorder_partial_stale_retry'});
    const after=row('SELECT * FROM orders WHERE id=?',order.id);
    assert.equal(after.payment_status,'refunded');assert.equal(after.fulfillment_status,'cancelled');assert.equal(after.refunded_amount_cents,order.total_cents);
    assert.equal(after.seller_transfer_reversed_cents,order.seller_proceeds_cents);assert.equal(reversals.size,1);
    refundOutcome='pending';
  });
  await depositScenarios({t,api,sqlite,row,all,buyer,buyer2,sessions,refunds,reversals,transfers,disputes,future,pay,paid,setRefundOutcome:v=>{refundOutcome=v;}});
});
