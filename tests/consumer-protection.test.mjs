import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile,mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {drizzle} from 'drizzle-orm/d1';
import {addBusinessDays} from '../lib/reputation-rules.ts';
import {ACTIVE_PROTECTION_POLICY_VERSION,reportDeadlineForOrder,canReportOrderProblem} from '../lib/protection.ts';

test('new fourteen-day terms do not rewrite legacy three-day purchases',()=>{
  const base={createdAt:'2026-09-01T00:00:00Z',deliveredAt:'2026-09-10T00:00:00Z'};
  assert.equal(ACTIVE_PROTECTION_POLICY_VERSION,'delivery-14-v2');
  assert.equal(reportDeadlineForOrder({...base,protectionPolicyVersion:ACTIVE_PROTECTION_POLICY_VERSION}),'2026-09-24T00:00:00.000Z');
  assert.equal(reportDeadlineForOrder(base),'2026-09-13T00:00:00.000Z');
  assert.equal(canReportOrderProblem({...base,paymentStatus:'paid',totalCents:1000},new Date('2026-10-01')).requiresReview,true);
});

test('shipping and copyright waiting periods exclude observed federal holidays',()=>{
  assert.equal(addBusinessDays(new Date('2026-12-24T12:00:00Z'),1).toISOString(),'2026-12-28T23:59:59.999Z');
  assert.equal(addBusinessDays(new Date('2026-07-02T12:00:00Z'),1).toISOString(),'2026-07-06T23:59:59.999Z');
});

test('consumer workflows use immutable evidence, explicit consent and durable refund/report queues',async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),scratch=await mkdtemp(join(root,'.consumer-test-')),file=join(scratch,'api.mjs'),sqlite=new DatabaseSync(':memory:');
  for(const name of (await readdir(join(root,'drizzle'))).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(await readFile(join(root,'drizzle',name),'utf8'));
  sqlite.exec('PRAGMA foreign_keys=ON');
  const binding={prepare(query){let values=[];return {bind(...v){values=v;return this;},async first(){return sqlite.prepare(query).get(...values)??null;},async raw(){const s=sqlite.prepare(query);s.setReturnArrays(true);return s.all(...values);},async all(){return {results:sqlite.prepare(query).all(...values)};},async run(){return {meta:sqlite.prepare(query).run(...values)};}};},async batch(statements){sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const calls=[],refunds=new Map(),emails=[],config={siteUrl:'https://mcc.test',supportEmail:'support@mcc.test',reportingPhone:'',shippoInsuranceThresholdCents:25000,shippoSignatureThresholdCents:75000};
  globalThis.__consumer={binding,db:drizzle(binding),config,emails,send:false,refundStatus:'pending',refund:async input=>{calls.push(input);const previous=refunds.get(input.orderId);if(previous)return previous;const result={id:`refund-${input.orderId}`,status:globalThis.__consumer.refundStatus,amount:input.totalCents-input.refundedAmountCents,sellerTransferReversedCents:0};refunds.set(input.orderId,result);return result;},refunds:charge=>[...refunds].filter(([id])=>`ch-${id}`===charge).map(([,r])=>r)};
  const mocks={deposit:'export const requestDepositRefund=async()=>{};',db:'export const getD1=()=>globalThis.__consumer.binding;export const getDb=()=>globalThis.__consumer.db;',config:'export const config=globalThis.__consumer.config;export const requireConfig=k=>config[k];',email:'export const escapeHtml=v=>String(v);export const sendEmail=async v=>{if(!globalThis.__consumer.send)return {sent:false};globalThis.__consumer.emails.push(v);return {sent:true};};export const sendShipmentEmail=async()=>{};export const sendLabelCreatedEmail=async()=>{};',stripe:'export const retrieveChargeRefunds=async id=>globalThis.__consumer.refunds(id);',refund:'export const createFullRefund=input=>globalThis.__consumer.refund(input);export const createOrderRefund=createFullRefund;'};
  // Shipping now imports fee reconciliation. These workflows must never call
  // settlement or payout APIs; label accounting is exercised in its own suite.
  mocks.stripe += `
    const unexpectedSettlement = () => { throw new Error('Unexpected Stripe settlement or transfer'); };
    export { unexpectedSettlement as createSellerTransfer, unexpectedSettlement as reverseSellerTransfer,
      unexpectedSettlement as sellerProceedsAfterRefund, unexpectedSettlement as sellerTransferReversalTarget,
      unexpectedSettlement as retrieveCheckoutSession, unexpectedSettlement as stripeSettlementDetails };`;
  const output=await build({stdin:{contents:"export * from './lib/consumer-shipping.ts';export * from './lib/seller-compliance.ts';export * from './lib/marketplace-reports.ts';export * from './lib/compliance-admin.ts';export * from './lib/purchase-evidence.ts';export {deleteManagedUpload} from './lib/managed-uploads.ts';",resolveDir:root},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},({path})=>{const mock=path==='@/db'?'db':/\/(config|email|stripe)(\.ts)?$/.exec(path)?.[1]||(/preorder-order-refunds/.test(path)?'refund':/preorder-deposits/.test(path)?'deposit':null);if(mock)return {path:mock,namespace:'mock'};if(path.startsWith('@/'))return {path:join(root,path.slice(2)+'.ts')};});b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({contents:mocks[path]}));}}]});
  await writeFile(file,output.outputFiles[0].contents);const api=await import(pathToFileURL(file).href);
  t.after(async()=>{delete globalThis.__consumer;sqlite.close();await unlink(file);await rmdir(scratch);});
  sqlite.exec(`INSERT INTO user(id,name,email,created_at,updated_at) VALUES('buyer','Buyer','buyer@mcc.test',0,0),('seller','Seller','seller@mcc.test',0,0),('outsider','Other','other@mcc.test',0,0);
    INSERT INTO sellers(id,owner_user_id,slug,store_name,contact_name,contact_email,status,return_policy_summary) VALUES('store','seller','store','Store','Seller','seller@mcc.test','active','Returns accepted for 30 days');
    INSERT INTO catalog_products(id,title,scale,model_car_manufacturer,manufacturer_key,vehicle_make,vehicle_model) VALUES('catalog','Model','1:64','Maker','maker','Make','Model');
    INSERT INTO products(id,catalog_product_id,seller_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,description,defects) VALUES('product','catalog','store','model','sku','Model','1:64','Maker','Make','Model',1000,'Original listing description','Scratch on base');`);
  const get=(sql,...args)=>sqlite.prepare(sql).get(...args);
  const order=(id,shipBy,version='delivery-14-v2')=>sqlite.prepare(`INSERT INTO orders(id,order_number,seller_id,buyer_user_id,stripe_checkout_session_id,buyer_email,currency,subtotal_cents,shipping_cents,platform_fee_cents,total_cents,stripe_charge_id,stripe_payment_intent_id,payment_status,payment_flow,paid_at,ship_by_at,protection_policy_version) VALUES(?,?,'store','buyer',?,'buyer@mcc.test','usd',1000,0,70,1000,?,?,'paid','separate',?,?,?)`).run(id,id,`cs-${id}`,`ch-${id}`,`pi-${id}`,new Date().toISOString(),shipBy,version);
  await t.test('evidence captures condition, seller promises and photos and survives later edits',async()=>{
    sqlite.exec(`INSERT INTO security_uploads(storage_key,owner_id,size_bytes,created_at) VALUES('listings/photo.jpg','seller',100,0);
      INSERT INTO product_images(id,product_id,url,storage_key,source) VALUES('photo','product','/media/listings/photo.jpg','listings/photo.jpg','r2');
      INSERT INTO checkout_reservations(id,seller_id,subtotal_cents,shipping_cents,platform_fee_cents,currency,expires_at,policy_version,protection_policy_version) VALUES('checkout','store',1000,0,70,'usd','2099-01-01','current','delivery-14-v2');
      INSERT INTO checkout_reservation_items(id,reservation_id,product_id,product_title_snapshot,seller_sku_snapshot,scale_snapshot,manufacturer_snapshot,unit_price_cents,quantity) VALUES('line','checkout','product','Model','sku','1:64','Maker',1000,1);`);
    const snapshot=JSON.parse(get("SELECT snapshot FROM purchase_evidence WHERE id='line'").snapshot);
    assert.equal(snapshot.defects,'Scratch on base');assert.equal(snapshot.sellerReturnPolicy,'Returns accepted for 30 days');assert.equal(snapshot.media[0].storageKey,'listings/photo.jpg');
    sqlite.exec("UPDATE products SET description='Edited',defects='' WHERE id='product';UPDATE sellers SET return_policy_summary='No returns' WHERE id='store'");
    assert.deepEqual(JSON.parse(get("SELECT snapshot FROM purchase_evidence WHERE id='line'").snapshot),snapshot);
    assert.throws(()=>sqlite.exec("UPDATE purchase_evidence SET snapshot='{}' WHERE id='line'"),/immutable/);
    assert.throws(()=>sqlite.exec("DELETE FROM purchase_evidence WHERE id='line'"),/retention/);
    const deleted=[];await api.deleteManagedUpload(binding,{delete:async key=>deleted.push(key)},'listings/photo.jpg');assert.deepEqual(deleted,[]);
    order('evidence','2099-01-01');sqlite.exec("UPDATE orders SET checkout_reservation_id='checkout' WHERE id='evidence'");assert.equal((await api.purchaseEvidenceForOrder('evidence'))[0].snapshot.defects,'Scratch on base');
  });
  await t.test('delay consent is restricted to the buyer and silence creates a retryable full refund',async()=>{
    const promise=new Date(Date.now()+3600000).toISOString(),proposed=new Date(Date.now()+86400000).toISOString();order('delay',promise);
    await assert.rejects(api.requestShippingDelay('outsider',{orderId:'delay',proposedAt:proposed,reason:'Supplier transit delay'}),/Request a supported/);
    const {id}=await api.requestShippingDelay('seller',{orderId:'delay',proposedAt:proposed,reason:'Carrier pickup delayed until tomorrow'});
    await assert.rejects(api.respondToShippingDelay('outsider',{id,action:'accept'}),/no longer available/);
    await api.processShippingDelays(new Date(Date.now()+7200000));
    assert.equal(get('SELECT status FROM order_shipping_delays WHERE id=?',id).status,'refunding');assert.equal(calls.filter(c=>c.orderId==='delay').length,1);
    await api.processShippingDelays(new Date(Date.now()+7200000));assert.equal(calls.filter(c=>c.orderId==='delay').length,1);
    refunds.get('delay').status='succeeded';await api.processShippingDelays(new Date(Date.now()+7200000));
    assert.equal(get("SELECT payment_status FROM orders WHERE id='delay'").payment_status,'refunded');assert.equal(get('SELECT status FROM order_shipping_delays WHERE id=?',id).status,'refunded');
    await assert.rejects(binding.prepare("UPDATE orders SET fulfillment_status='shipped' WHERE id='delay'").run(),/cancellation/);
  });
  await t.test('explicit acceptance extends one deadline; an overdue legacy order is left for review',async()=>{
    const promise=new Date(Date.now()+3600000).toISOString(),proposed=new Date(Date.now()+86400000).toISOString();order('accepted',promise);order('legacy','2000-01-01','delivery-3-v1');
    const {id}=await api.requestShippingDelay('seller',{orderId:'accepted',proposedAt:proposed,reason:'Supported revised pickup date'});
    await api.respondToShippingDelay('buyer',{id,action:'accept'});await api.processShippingDelays(new Date(Date.now()+7200000));
    assert.equal(get("SELECT ship_by_at FROM orders WHERE id='accepted'").ship_by_at,proposed);assert.equal(get("SELECT payment_status FROM orders WHERE id='legacy'").payment_status,'paid');
    assert.equal(get("SELECT count(*) n FROM order_shipping_delays WHERE order_id='legacy'").n,0);
  });
  await t.test('new overdue orders without notices queue refunds; missing email credentials do not mark notices delivered',async()=>{
    order('overdue','2000-01-01');await api.processShippingDelays();assert.equal(get("SELECT status FROM order_shipping_delays WHERE order_id='overdue'").status,'refunding');
    await api.deliverLegalNotices();assert.ok(get('SELECT count(*) n FROM legal_notifications WHERE sent_at IS NULL AND attempts>0').n>0);
    globalThis.__consumer.send=true;await api.deliverLegalNotices();assert.equal(get('SELECT count(*) n FROM legal_notifications WHERE sent_at IS NULL').n,0);
  });
  await t.test('shared-charge refunds are attributed to the seller order, never its siblings',async()=>{
    sqlite.exec("INSERT INTO checkout_groups(id,currency,total_before_tax_cents,expires_at) VALUES('shared-group','usd',2000,'2099-01-01')");
    order('shared-target','2000-01-01');
    sqlite.exec("UPDATE orders SET checkout_group_id='shared-group',stripe_charge_id='shared-charge' WHERE id='shared-target'");
    const original=globalThis.__consumer.refunds;
    globalThis.__consumer.refunds=charge=>charge==='shared-charge'?[{id:'sibling-refund',amount:1000,status:'succeeded',metadata:{order_id:'sibling'}}]:original(charge);
    globalThis.__consumer.refundStatus='succeeded';await api.processShippingDelays();
    const request=calls.find(c=>c.orderId==='shared-target');assert.ok(request);assert.equal(request.refundedAmountCents,0);assert.equal(request.totalCents,1000);
    globalThis.__consumer.refunds=original;
  });
  await t.test('INFORM measures rolling transactions and revenue together and distinguishes annual disclosure',()=>{
    const now=new Date('2026-09-27T00:00:00Z'),sale={at:'2026-01-01T00:00:00Z',qualifyingCents:2500,grossCents:10000};
    assert.equal(api.informCoverage(Array.from({length:199},()=>sale),now).covered,false);
    assert.deepEqual(api.informCoverage(Array.from({length:200},()=>sale),now),{covered:true,disclosureRequired:true,maxTransactions:200,maxRevenueCents:500000,annualGrossCents:2000000});
    assert.equal(api.informCoverage(Array.from({length:200},()=>({...sale,qualifyingCents:2499})),now).covered,false);
    const prior=Array.from({length:200},()=>({...sale,at:'2025-01-01T00:00:00Z'}));assert.equal(api.informCoverage(prior,now).covered,true);assert.equal(api.informCoverage(prior,now).disclosureRequired,false);
    assert.equal(api.informCoverage(prior.map(s=>({...s,at:'2024-01-01T00:00:00Z'})),now).covered,false);
  });
  await t.test('public complaints require declarations and are stored privately with a notification, without a fabricated agent',async()=>{
    const base={kind:'copyright',email:'owner@example.test',name:'Owner',subjectUrl:'https://mcc.test/products/model',details:'My original photo was copied without permission.',signature:'Owner',truthful:true,mailingAddress:'Public agent address',phone:'5555550101',workOrRemovedContent:'Original product photo'};
    assert.equal(api.dmcaReady(),false);await assert.rejects(api.submitMarketplaceReport(base),/declaration/);
    const {id}=await api.submitMarketplaceReport({...base,authorized:true});assert.equal(get('SELECT status FROM marketplace_reports WHERE id=?',id).status,'received');assert.ok(get('SELECT id FROM legal_notifications WHERE id=?',`report:${id}`));
    await assert.rejects(api.submitMarketplaceReport({...base,kind:'counter_notice',authorized:true,relatedId:id}),/jurisdiction/);
    await api.complianceAction('admin',{id,action:'remove_listing',reason:'Verified ownership and unauthorized copying'});
    assert.equal(get('SELECT status FROM marketplace_reports WHERE id=?',id).status,'removed');
    const counter=await api.submitMarketplaceReport({...base,kind:'counter_notice',authorized:true,jurisdiction:true,relatedId:id});
    await assert.rejects(api.complianceAction('admin',{id:counter.id,action:'forward_counter',reason:'Reviewed'}),/valid counter-notice/);
    await api.complianceAction('admin',{id:counter.id,action:'forward_counter',reason:'All required statements and identification reviewed',verified:true});
    await api.reconcileCounterNotices();assert.equal(get('SELECT restore_after FROM marketplace_reports WHERE id=?',counter.id).restore_after,null);
    await api.deliverLegalNotices();await api.reconcileCounterNotices();
    assert.ok(Date.parse(get('SELECT restore_after FROM marketplace_reports WHERE id=?',counter.id).restore_after)>Date.now());
    await assert.rejects(api.complianceAction('admin',{id:counter.id,action:'restore_reviewed',reason:'Attempted early restoration',verified:true}),/waiting period/);
    await api.complianceAction('admin',{id:counter.id,action:'litigation',reason:'Verified notice of filed court action, secure case reference'});
    await assert.rejects(api.complianceAction('admin',{id:counter.id,action:'restore_reviewed',reason:'Attempted restoration during litigation',verified:true}),/Restoration requires/);
    assert.throws(()=>sqlite.exec("DELETE FROM compliance_audit"),/immutable/);
  });
  await t.test('covered sellers cannot sell without a reporting phone and reviewed disclosure',async()=>{
    for(let n=0;n<200;n++) {
      order(`volume-${n}`,'2099-01-01');
      sqlite.prepare("UPDATE orders SET total_cents=10000,subtotal_cents=10000 WHERE id=?").run(`volume-${n}`);
      sqlite.prepare("INSERT INTO order_items(id,order_id,product_id,product_title_snapshot,seller_sku_snapshot,scale_snapshot,manufacturer_snapshot,unit_price_cents,quantity) VALUES(?,?,'product','Model','sku','1:64','Maker',10000,1)").run(`volume-line-${n}`,`volume-${n}`);
    }
    assert.equal((await api.assessSellerCompliance('store')).blocked,true);
    await assert.rejects(api.assertSellerCompliance('store'),/verification/);
    await assert.rejects(binding.prepare("INSERT INTO checkout_reservations(id,seller_id,subtotal_cents,shipping_cents,platform_fee_cents,currency,expires_at) VALUES('blocked','store',1000,0,0,'usd','2099-01-01')").run(),/compliance review/);
    config.reportingPhone='+14155550100';
    assert.equal((await api.assessSellerCompliance('store')).blocked,true,'disclosure is still missing');
    await api.certifySeller('seller',{businessName:'Store',businessAddress:'Business mailing address',businessEmail:'seller@mcc.test',businessPhone:'4155550100',certified:true});
    assert.equal((await api.assessSellerCompliance('store')).blocked,true,'self-certification is not verification or disclosure');
    await assert.rejects(api.complianceAction('admin',{action:'verify_seller',id:'store',reason:'Checked records'}),/independent verification/);
    await api.complianceAction('admin',{action:'verify_seller',id:'store',reason:'Independently verified current contact, identity and secure bank/tax records',verified:true,reference:'secure-provider-review-123',disclosure:'Store, business address, seller@mcc.test'});
    assert.equal((await api.assessSellerCompliance('store')).blocked,false);
  });
  await t.test('high-value external tracking is rejected at both configured boundaries',()=>{
    api.assertExternalShippingAllowed(24999);assert.throws(()=>api.assertExternalShippingAllowed(25000),/insured MCC/);assert.throws(()=>api.assertExternalShippingAllowed(75000),/insured MCC/);
  });
});
