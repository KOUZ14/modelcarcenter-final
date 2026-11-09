import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir,mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {drizzle} from 'drizzle-orm/d1';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {calculateCartMarketplaceFee,calculateSellerTotals,foundingFeeOffer} from '../lib/fees.ts';
import {POLICY_VERSION} from '../lib/legal.ts';

test('founding offer counts units, applies 7% only to excess items, and ignores old founding flags',()=>{
  const enrolled={sellerType:'professional',foundingFeeGrantedAt:'2026-11-05',foundingFeeUsedUnits:8,foundingFeeReservedUnits:0};
  const items=[{priceCents:10000,quantity:3},{priceCents:20000,quantity:1}];
  const fee=calculateCartMarketplaceFee(items,enrolled);
  assert.deepEqual(fee,{marketplaceFeeBps:700,foundingFeeFreeUnits:2,foundingFeeFreeSubtotalCents:30000});
  assert.equal(calculateSellerTotals(items,5000,fee).platformFeeCents,1400);
  assert.deepEqual(calculateCartMarketplaceFee([...items].reverse(),enrolled),fee);
  for(const seller of [{sellerType:'professional',isFoundingSeller:true},{...enrolled,sellerType:'collector'},{...enrolled,foundingFeeUsedUnits:10}]) {
    assert.equal(calculateCartMarketplaceFee(items,seller).foundingFeeFreeUnits,0);
  }
  assert.equal(foundingFeeOffer({...enrolled,foundingFeeReservedUnits:2}).remaining,0);
  const allFree=calculateCartMarketplaceFee([{priceCents:19999,quantity:2}],enrolled);
  assert.equal(allFree.marketplaceFeeBps,0);
  assert.equal(calculateSellerTotals([{priceCents:19999,quantity:2}],900,allFree).platformFeeCents,0);
});

test('founding allowance is atomic, one-time, quantity-based and durable through checkout/payment/refunds',async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),scratch=await mkdtemp(join(root,'.sites-runtime','founding-test-')),file=join(scratch,'api.mjs');
  const sqlite=new DatabaseSync(':memory:');
  for(const name of (await readdir(join(root,'drizzle'))).filter(n=>n.endsWith('.sql')).sort()) sqlite.exec(await readFile(join(root,'drizzle',name),'utf8'));
  sqlite.exec('PRAGMA foreign_keys=ON');
  const binding={prepare(query){let values=[];return{
    bind(...args){values=args;return this;},async first(){return sqlite.prepare(query).get(...values)??null;},
    async raw(){const s=sqlite.prepare(query);s.setReturnArrays(true);return s.all(...values);},
    async all(){return{results:sqlite.prepare(query).all(...values)};},async run(){return{meta:sqlite.prepare(query).run(...values)};},
  };},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  globalThis.__foundingFeeTest={binding,db:drizzle(binding)};
  t.after(async()=>{delete globalThis.__foundingFeeTest;sqlite.close();await unlink(file).catch(()=>{});await rmdir(scratch);});
  const output=await build({absWorkingDir:root,bundle:true,platform:'node',format:'esm',packages:'external',write:false,jsx:'automatic',
    stdin:{contents:'export * from "./lib/inventory"; export {preparePaidOrder,processStripeEvent} from "./lib/orders"; export {grantFoundingFeeOffer} from "./lib/founding-fee-admin"; export {SellerOrderAmounts} from "./components/seller-order-amounts";',resolveDir:root,loader:'tsx'},
    plugins:[{name:'db',setup(b){b.onResolve({filter:/^@\/db$/},({path})=>({path,namespace:'db'}));b.onLoad({filter:/.*/,namespace:'db'},()=>({contents:'export const getD1=()=>globalThis.__foundingFeeTest.binding;export const getDb=()=>globalThis.__foundingFeeTest.db;'}));}}],
  });
  await writeFile(file,output.outputFiles[0].contents);const api=await import(pathToFileURL(file).href);
  const get=(sql,...args)=>sqlite.prepare(sql).get(...args),counts=()=>get("SELECT founding_fee_used_units used,founding_fee_reserved_units reserved FROM sellers WHERE id='store'");
  for(const [id,type] of [['store','professional'],['collector','collector'],['other','professional']]) sqlite.prepare(`INSERT INTO sellers
    (id,slug,store_name,contact_name,contact_email,seller_type,status,stripe_account_id,stripe_charges_enabled,stripe_payouts_enabled,seller_terms_version,seller_terms_accepted_at)
    VALUES (?,?,?,?,?,?,'active',?,1,1,?,CURRENT_TIMESTAMP)`).run(id,id,id,'Owner',`${id}@example.test`,type,`acct_${id}`,POLICY_VERSION);
  sqlite.exec("INSERT INTO catalog_products(id,model_car_manufacturer,manufacturer_key,scale,vehicle_make,vehicle_model,title) VALUES('catalog','Maker','maker','1:18','Make','Model','Model')");
  for(const [id,price,seller] of [['a',10000,'store'],['b',20000,'store'],['other-product',10000,'other']]) sqlite.prepare(`INSERT INTO products
    (id,catalog_product_id,seller_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,inventory_quantity,status)
    VALUES (?,'catalog',?,?,?,?, '1:18','Maker','Make','Model',?,50,'active')`).run(id,seller,id,id,id,price);
  // Existing sold units do not consume a newly granted offer or get repriced.
  sqlite.exec("INSERT INTO orders(id,order_number,seller_id,stripe_checkout_session_id,buyer_email,currency,subtotal_cents,shipping_cents,platform_fee_cents,marketplace_fee_bps,total_cents,payment_status) VALUES('old','old','store','cs_old','buyer@example.test','usd',20000,0,1400,700,20000,'paid')");
  const load=(quantity=1,id='a')=>api.loadAuthoritativeCart([{productId:id,quantity}]);
  const reserve=cart=>api.buildCartReservation(cart,null,POLICY_VERSION);
  const pay=async reservation=>{
    const row=get('SELECT * FROM checkout_reservations WHERE id=?',reservation.reservationId);
    const session={id:`cs_${row.id}`,currency:'usd',payment_status:'paid',status:'complete',url:null,amount_total:row.subtotal_cents+row.shipping_cents+1000,
      total_details:{amount_tax:1000},customer_details:{email:'buyer@example.test'},metadata:{payment_flow:'separate',processing_fee_payer:'seller'},
      payment_intent:{id:`pi_${row.id}`,latest_charge:{id:`ch_${row.id}`,balance_transaction:{fee:500}}}};
    const planned=await api.preparePaidOrder(session,row.id);await binding.batch(planned.statements);return get('SELECT * FROM orders WHERE id=?',planned.orderId);
  };
  await t.test('grant rejects collectors/missing stores, is idempotent and records the admin',async()=>{
    await assert.rejects(api.grantFoundingFeeOffer('collector','admin@example.test'),/professional/);
    await assert.rejects(api.grantFoundingFeeOffer('missing','admin@example.test'),/professional/);
    await api.grantFoundingFeeOffer('store','admin@example.test');await api.grantFoundingFeeOffer('store','second@example.test');
    assert.equal(get("SELECT founding_fee_granted_by actor FROM sellers WHERE id='store'").actor,'admin@example.test');
    assert.equal(get("SELECT count(*) n FROM admin_activity WHERE action='grant_founding_fee_offer'").n,1);
    assert.equal(counts().used,0);assert.equal(get("SELECT platform_fee_cents fee FROM orders WHERE id='old'").fee,1400);
  });
  await t.test('failed inventory reservation rolls back fee slots and the checkout',async()=>{
    const cart=await load(3),r=reserve(cart);
    sqlite.exec("UPDATE products SET price_cents=10001 WHERE id='a'");
    await assert.rejects(binding.batch(r.statements));
    assert.equal(counts().reserved,0);assert.equal(get('SELECT id FROM checkout_reservations WHERE id=?',r.reservationId),undefined);
    sqlite.exec("UPDATE products SET price_cents=10000 WHERE id='a'");
  });
  await t.test('a multi-seller checkout rolls back all fee slots if any seller fails',async()=>{
    await api.grantFoundingFeeOffer('other','admin@example.test');
    const groupId='failed-group',expires=new Date(Date.now()+3600000);
    const first=api.buildCartReservation(await load(3),null,POLICY_VERSION,undefined,groupId,expires);
    const second=api.buildCartReservation(await load(1,'other-product'),null,POLICY_VERSION,undefined,groupId,expires);
    sqlite.exec("UPDATE products SET price_cents=10001 WHERE id='other-product'");
    await assert.rejects(binding.batch([
      binding.prepare("INSERT INTO checkout_groups(id,currency,total_before_tax_cents,expires_at) VALUES(?,'usd',40000,?)").bind(groupId,expires.toISOString()),
      ...first.statements,...second.statements,
    ]));
    assert.equal(counts().reserved,0);
    assert.equal(get("SELECT founding_fee_reserved_units n FROM sellers WHERE id='other'").n,0);
    assert.equal(get('SELECT id FROM checkout_groups WHERE id=?',groupId),undefined);
    sqlite.exec("UPDATE products SET price_cents=10000 WHERE id='other-product'");
  });
  await t.test('concurrent checkouts cannot overspend the allowance, and expiry releases it once',async()=>{
    const first=reserve(await load(8,'a')),second=reserve(await load(8,'b'));
    await binding.batch(first.statements);assert.equal(counts().reserved,8);
    await assert.rejects(binding.batch(second.statements));
    assert.equal(get("SELECT reserved_quantity q FROM products WHERE id='b'").q,0);
    await api.processStripeEvent({id:'expired',type:'checkout.session.expired',data:{object:{metadata:{reservation_id:first.reservationId}}}});
    await api.releaseReservation(first.reservationId);assert.equal(counts().reserved,0);
  });
  await t.test('paid quantities consume slots exactly once and retries cannot reopen them',async()=>{
    const r=reserve(await load(8));await binding.batch(r.statements);const order=await pay(r);
    assert.equal(order.founding_fee_free_units,8);assert.equal(order.founding_fee_free_subtotal_cents,80000);
    assert.equal(order.platform_fee_cents,0);assert.equal(order.marketplace_fee_bps,0);assert.equal(order.payment_processing_fee_cents,500);
    assert.equal(counts().used,8);assert.equal(counts().reserved,0);
    await assert.rejects(pay(r),/already been handled/);await api.releaseReservation(r.reservationId);assert.equal(counts().used,8);
    assert.throws(()=>sqlite.prepare("UPDATE checkout_reservations SET status='pending' WHERE id=?").run(r.reservationId),/cannot be reopened/);
    sqlite.prepare("UPDATE orders SET payment_status='refunded',refunded_amount_cents=total_cents WHERE id=?").run(order.id);
    await api.grantFoundingFeeOffer('store','admin@example.test');assert.equal(counts().used,8);
  });
  await t.test('an order crossing ten charges only its excess units and preserves the exemption',async()=>{
    const cart=await api.loadAuthoritativeCart([{productId:'a',quantity:3},{productId:'b',quantity:1}]);
    assert.equal(cart.fee.foundingFeeFreeUnits,2);assert.equal(cart.totals.platformFeeCents,1400);
    const r=reserve(cart);await binding.batch(r.statements);const order=await pay(r);
    assert.equal(order.founding_fee_free_units,2);assert.equal(order.founding_fee_free_subtotal_cents,30000);assert.equal(order.platform_fee_cents,1400);
    assert.equal(order.seller_proceeds_cents,48100);assert.equal(counts().used,10);assert.equal(counts().reserved,0);
    assert.equal((await load()).totals.platformFeeCents,700);
    const html=renderToStaticMarkup(createElement(api.SellerOrderAmounts,{order:{currency:'usd',subtotalCents:50000,shippingCents:0,taxCents:1000,totalCents:51000,
      marketplaceFeeBps:700,platformFeeCents:1400,foundingFeeFreeUnits:2,foundingFeeFreeSubtotalCents:30000,processingFeePayer:'seller',paymentProcessingFeeCents:500,sellerProceedsCents:48100,refundedAmountCents:0,paymentStatus:'paid'}}));
    assert.match(html,/2<!-- --> fee-free units|2 fee-free units/);assert.match(html,/on remaining items/);assert.match(html,/300.00/);
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  });
});
