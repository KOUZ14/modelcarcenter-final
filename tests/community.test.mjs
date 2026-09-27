import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir,mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {drizzle} from 'drizzle-orm/d1';
import {POLICY_VERSION} from '../lib/legal.ts';
import {config} from '../lib/config.ts';

test('collector privacy, social permissions and shared inventory authority',async t=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),scratch=await mkdtemp(join(root,'.sites-runtime/community-test-')),bundle=join(scratch,'api.mjs'),db=new DatabaseSync(':memory:');
 for(const f of(await readdir(join(root,'drizzle'))).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(join(root,'drizzle',f),'utf8'));
 db.exec('PRAGMA foreign_keys=ON');
 const binding={prepare(query){let values=[];return{bind(...args){values=args;return this;},async raw(){const s=db.prepare(query);s.setReturnArrays(true);return s.all(...values);},async all(){return{results:db.prepare(query).all(...values),success:true};},async first(column){const r=db.prepare(query).get(...values);return column?r?.[column]??null:r??null;},async run(){const r=db.prepare(query).run(...values);return{success:true,meta:{changes:r.changes}};}};},async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
 globalThis.__communityFixture={binding,db:drizzle(binding),config:{...config,betterAuthSecret:'community-fixture-secret-for-test-only',marketplaceMode:'test',stripeSecretKey:'sk_test_fixture',siteUrl:'https://mcc.test',automaticTax:true,stripeTaxBehavior:'exclusive'}};
 const sessions=new Map(),originalFetch=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{const url=new URL(input),body=new URLSearchParams(init.body);assert.equal(url.origin,'https://api.stripe.com');if(url.pathname.startsWith('/v1/accounts/'))return Response.json({charges_enabled:true,payouts_enabled:true});if(url.pathname==='/v1/customers')return Response.json({id:'cus_test'});if(url.pathname==='/v1/checkout/sessions'){const id=`cs_test_${sessions.size+1}`,metadata=Object.fromEntries([...body].filter(([k])=>/^metadata\[/.test(k)).map(([k,v])=>[k.slice(9,-1),v]));let base=0;for(let i=0;body.has(`line_items[${i}][quantity]`);i++)base+=Number(body.get(`line_items[${i}][quantity]`))*Number(body.get(`line_items[${i}][price_data][unit_amount]`));const s={id,url:`https://checkout.stripe.com/${id}`,status:'open',payment_status:'unpaid',metadata,amount_total:base+125,currency:'usd',total_details:{amount_tax:125},customer_details:{email:'buyer@example.test'},payment_intent:{id:`pi_${id}`,latest_charge:{id:`ch_${id}`,balance_transaction:{fee:90}}}};sessions.set(id,s);return Response.json(s);}if(url.pathname.startsWith('/v1/checkout/sessions/')){const s=sessions.get(url.pathname.split('/')[4]);assert.ok(s);if(url.pathname.endsWith('/expire'))s.status='expired';return Response.json(s);}throw Error('Unexpected Stripe operation '+url.pathname);};
 t.after(()=>{globalThis.fetch=originalFetch;});
 const output=await build({stdin:{contents:"export * from './lib/community.ts';export { getMessagingCenterData, startSellerConversation } from './lib/messaging.ts';export * from './lib/collection-offers.ts';export * from './lib/collector-messaging.ts';export * from './lib/inventory.ts';export * from './lib/community-images.ts';export * from './lib/collection-offer-payments.ts';export * from './lib/orders.ts';",resolveDir:root},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'community-fixture',setup(b){b.onResolve({filter:/^(@\/db|\.\/config(?:\.ts)?|\.\/email(?:\.ts)?)$/},({path})=>({path:path.replace(/\.ts$/,''),namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='./config'?'export const config=globalThis.__communityFixture.config;export const requireConfig=k=>config[k];':path==='./email'?'export const sendPaidOrderEmails=async()=>{};export const sendEmail=async()=>({sent:true});export const escapeHtml=v=>String(v);':'export const getDb=()=>globalThis.__communityFixture.db;export const getD1=()=>globalThis.__communityFixture.binding;'}));}}]});
 await writeFile(bundle,output.outputFiles[0].contents);const api=await import(pathToFileURL(bundle).href);t.after(async()=>{db.close();delete globalThis.__communityFixture;await unlink(bundle);await rmdir(scratch);});
 for(const id of ['owner','buyer','buyer2']){db.prepare('INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)').run(id,id,id+'@example.test');db.prepare('INSERT INTO collector_profiles (id,user_id,display_name,handle) VALUES (?,?,?,?)').run(id,id,id,id);await api.settings(id);}
 db.prepare("INSERT INTO catalog_products (id,model_car_manufacturer,manufacturer_key,scale,vehicle_make,vehicle_model,title) VALUES ('model','MINI GT','minigt','1:64','Porsche','911','Porsche 911')").run();
 const make=async(extra={})=>api.savePiece('owner',{catalogId:'model',title:'ignored',scale:'ignored',maker:'ignored',visibility:'private',privateNotes:'PRIVATE SECRET',purchaseCost:'1000',photos:[],...extra});
 let piece;
 await t.test('storefront contact works without a listing and preserves seller eligibility and message permissions',async()=>{
  for(const id of ['store-owner','store-buyer','store-other']){
   db.prepare('INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)').run(id,id,id+'@example.test');
   db.prepare('INSERT INTO collector_profiles (id,user_id,display_name,handle) VALUES (?,?,?,?)').run(id,id,id,id);
   await api.settings(id);
  }
  db.prepare("INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,status,seller_terms_version,seller_terms_accepted_at) VALUES ('empty-store','store-owner','empty-store','Empty Store','Owner','store@example.test','active',?,CURRENT_TIMESTAMP)").run(POLICY_VERSION);
  const data=await api.getMessagingCenterData('store-buyer',{sellerId:'empty-store'});
  assert.equal(data.newConversation.productId,null);
  assert.equal(data.newConversation.sellerId,'empty-store');
  assert.equal(data.newConversation.canMessage,true);
  assert.equal((await api.getMessagingCenterData('store-owner',{sellerId:'empty-store'})).newConversation.canMessage,false);
  await assert.rejects(()=>api.startSellerConversation('store-owner','empty-store','Hello'),/own store/);
  await assert.rejects(()=>api.startSellerConversation('store-buyer','empty-store','   '),/Write a message/);
  db.prepare("UPDATE sellers SET status='suspended' WHERE id='empty-store'").run();
  await assert.rejects(()=>api.startSellerConversation('store-buyer','empty-store','Hello'),/no longer available/);
  db.prepare("UPDATE sellers SET status='active',seller_terms_version='old' WHERE id='empty-store'").run();
  await assert.rejects(()=>api.startSellerConversation('store-buyer','empty-store','Hello'),/no longer available/);
  db.prepare("UPDATE sellers SET seller_terms_version=? WHERE id='empty-store'").run(POLICY_VERSION);
  db.prepare("UPDATE community_settings SET contact='existing' WHERE user_id='store-owner'").run();
  await assert.rejects(()=>api.startSellerConversation('store-buyer','empty-store','Hello'),/not accepting/);
  db.prepare("UPDATE community_settings SET contact='requests' WHERE user_id='store-owner'").run();
  const started=await api.startSellerConversation('store-buyer','empty-store','Can you source a blue Nissan?');
  const thread=db.prepare('SELECT * FROM collector_threads WHERE id=?').get(started.conversationId);
  assert.equal(thread.recipient_id,'store-owner');
  assert.equal(thread.reference,'Store enquiry: Empty Store');
  assert.equal(thread.status,'request');
  assert.equal(db.prepare('SELECT body FROM collector_messages WHERE thread_id=?').get(thread.id).body,'Can you source a blue Nissan?');
  await assert.rejects(()=>api.startSellerConversation('store-buyer','empty-store','Again'),/accepted/);
  db.prepare("INSERT INTO collector_relationships (id,owner_id,target_id,kind,created_at) VALUES ('store-block','store-owner','store-other','block',0)").run();
  await assert.rejects(()=>api.startSellerConversation('store-other','empty-store','Hello'),/unavailable|blocked/i);
 });
 await t.test('wanted releases remain separate from saved seller listings and belong to the current collector',async()=>{
  const wanted={action:'wishlist',catalogId:'model',enabled:true};
  await api.communityAction('owner',wanted);await api.communityAction('owner',wanted);
  assert.equal(db.prepare("SELECT count(*) n FROM model_wishlist WHERE owner_id='owner'").get().n,1,'Adding the same release twice is idempotent');
  assert.equal(db.prepare('SELECT count(*) n FROM wishlist_items').get().n,0,'Wanting a release does not save a seller listing');
  await api.communityAction('buyer',wanted);
  await api.communityAction('owner',{...wanted,enabled:false});
  assert.equal(db.prepare("SELECT count(*) n FROM model_wishlist WHERE owner_id='owner'").get().n,0);
  assert.equal(db.prepare("SELECT count(*) n FROM model_wishlist WHERE owner_id='buyer'").get().n,1,'Removal is scoped to the current collector');
  await api.communityAction('buyer',{...wanted,enabled:false});
  await assert.rejects(()=>api.communityAction('owner',{...wanted,catalogId:'missing'}),/unavailable/);
 });
 await t.test('migration leaves profiles unpublished and collections default private',async()=>{assert.equal((await api.settings('owner')).published,0);piece=await make();assert.equal(await api.getPiece(piece.id,null),null);assert.equal((await api.getPiece(piece.id,'owner')).privateNotes,'PRIVATE SECRET');assert.equal((await api.getCollection('owner',null)).length,0);assert.deepEqual(await api.collectors(null),[]);});
 await t.test('publication is explicit; public projection excludes private fields and duplicates remain physical pieces',async()=>{
  await assert.rejects(()=>make({visibility:'public'}),/Confirm/);
  await api.communityAction('owner',{action:'settings',handle:'owner',displayName:'Owner',published:true,publishConfirmed:true});
  await api.savePiece('owner',{id:piece.id,version:1,catalogId:'model',visibility:'public',publishConfirmed:true,privateNotes:'PRIVATE SECRET',purchaseCost:'1000',photos:[]});
  const publicPiece=await api.getPiece(piece.id,null);assert.equal(publicPiece.availability,'not_for_sale');assert.ok(!('privateNotes' in publicPiece));assert.ok(!('purchaseCost' in publicPiece));
  await make();assert.equal((await api.getCollection('owner','owner')).length,2);assert.equal((await api.getCollection('owner',null)).length,1);
 });
 await t.test('profile settings save atomically and defaults never rewrite existing piece visibility',async()=>{
  db.prepare("INSERT INTO community_media (id,owner_id,created_at) VALUES ('avatar-next','owner',0),('cover-next','owner',0)").run();
  const beforeProfile=db.prepare("SELECT * FROM collector_profiles WHERE user_id='owner'").get();
  const beforeSettings=await api.settings('owner');
  const beforePieces=db.prepare("SELECT id,visibility FROM collection_items WHERE owner_id='owner' ORDER BY id").all();
  await assert.rejects(()=>api.communityAction('owner',{action:'settings',handle:'buyer',displayName:'Changed',avatarId:'avatar-next',coverId:'cover-next',published:false,visibility:'public'}));
  assert.deepEqual(db.prepare("SELECT * FROM collector_profiles WHERE user_id='owner'").get(),beforeProfile);
  assert.deepEqual(await api.settings('owner'),beforeSettings);
  await assert.rejects(()=>api.communityAction('owner',{action:'settings',handle:'owner',displayName:'',avatarId:'avatar-next',coverId:'cover-next'}),/Display name/);
  assert.deepEqual(db.prepare("SELECT * FROM collector_profiles WHERE user_id='owner'").get(),beforeProfile);
  await api.communityAction('owner',{action:'settings',handle:'owner',displayName:'Owner',avatarId:'avatar-next',coverId:'cover-next',published:false,visibility:'public'});
  assert.deepEqual(db.prepare("SELECT id,visibility FROM collection_items WHERE owner_id='owner' ORDER BY id").all(),beforePieces);
  assert.equal((await api.getCollection('owner',null)).length,0,'A private profile hides even pieces marked public');
  assert.equal(db.prepare("SELECT avatar_url FROM collector_profiles WHERE user_id='owner'").get().avatar_url,'/community/media/avatar-next');
  assert.equal((await api.settings('owner')).cover_id,'cover-next');
  await assert.rejects(()=>api.communityAction('owner',{action:'settings',handle:'owner',displayName:'Owner',published:true}),/Confirm publication/);
  await api.communityAction('owner',{action:'settings',handle:'owner',displayName:'Owner',avatarId:'',coverId:'',published:true,publishConfirmed:true,visibility:'private'});
  assert.equal((await api.getCollection('owner',null)).length,1,'Republishing reveals only the existing public piece');
 });
 let post;
 await t.test('public item tags are reevaluated after privacy changes; Following stays chronological and empty when unfollowed',async()=>{
  post=await api.communityAction('owner',{action:'post',body:'A collector question',catalogId:'model',itemId:piece.id});assert.equal((await api.feed(null))[0].itemId,piece.id);assert.deepEqual(await api.feed('buyer',{tab:'following'}),[]);
  await api.communityAction('buyer',{action:'relationship',targetId:'owner',kind:'follow'});assert.equal((await api.feed('buyer',{tab:'following'})).length,1);
  const p=await api.getPiece(piece.id,'owner');await api.savePiece('owner',{...p,id:p.id,catalogId:'model',visibility:'private',photos:[]});assert.equal((await api.feed(null))[0].itemId,null);assert.equal(await api.getPiece(piece.id,'buyer'),null);
  await api.savePiece('owner',{...await api.getPiece(piece.id,'owner'),visibility:'public',publishConfirmed:true,photos:[]});
 });
 await t.test('post identity includes release metadata without exposing a private tagged piece',async()=>{
  const tagged=(await api.feed(null,{postId:post.id}))[0];
  assert.equal(tagged.modelScale,'1:64');assert.equal(tagged.modelManufacturer,'MINI GT');
  db.prepare("UPDATE catalog_products SET color='Red',primary_image_url='/test-model.jpg' WHERE id='model'").run();
  const release=(await api.feed(null,{postId:post.id}))[0];
  assert.equal(release.modelColor,'Red');assert.equal(release.modelImageUrl,'/test-model.jpg');
  db.prepare("UPDATE catalog_products SET color=NULL,primary_image_url=NULL WHERE id='model'").run();
  const personal=await make({color:'Gold',visibility:'public',publishConfirmed:true});
  const personalPost=await api.communityAction('owner',{action:'post',body:'My custom build',itemId:personal.id});
  try {
   const visible=(await api.feed(null,{postId:personalPost.id}))[0];
   assert.equal(visible.modelScale,'1:64');assert.equal(visible.modelManufacturer,'MINI GT');assert.equal(visible.modelColor,'Gold');
   await api.savePiece('owner',{...await api.getPiece(personal.id,'owner'),visibility:'private',photos:[]});
   const hidden=(await api.feed(null,{postId:personalPost.id}))[0];
   for(const key of ['itemId','itemTitle','modelScale','modelManufacturer','modelColor','modelImageUrl'])assert.equal(hidden[key],null,key+' must not expose a private piece');
  } finally {db.prepare('DELETE FROM community_posts WHERE id=?').run(personalPost.id);db.prepare('DELETE FROM collection_items WHERE id=?').run(personal.id);}
 });
 await t.test('comments supply timestamps and avatars while retaining profile and moderation requirements',async()=>{
  await assert.rejects(()=>api.communityAction('buyer',{action:'comment',postId:post.id,body:'Not published'}),/Publish your profile/);
  db.prepare("UPDATE collector_profiles SET avatar_url='/test-avatar.jpg' WHERE user_id='owner'").run();
  await api.communityAction('owner',{action:'comment',postId:post.id,body:'@buyer A reply'});
  const comment=(await api.comments(null,post.id))[0];
  try {
   assert.equal(comment.body,'@buyer A reply');assert.equal(comment.avatarUrl,'/test-avatar.jpg');assert.ok(comment.createdAt>0);assert.equal(comment.handle,'owner');
   db.prepare("UPDATE community_comments SET status='hidden' WHERE id=?").run(comment.id);
   assert.deepEqual(await api.comments(null,post.id),[]);
  } finally {db.prepare('DELETE FROM community_comments WHERE id=?').run(comment.id);db.prepare("UPDATE collector_profiles SET avatar_url=NULL WHERE user_id='owner'").run();}
 });
 await t.test('model discussion pages keep exact tags and do not skip posts with matching timestamps',async()=>{
  const insert=db.prepare("INSERT INTO community_posts (id,owner_id,body,catalog_id,created_at,status) VALUES (?,'owner','A model discussion',?,1000,?)");
  for(const id of ['preview-c','preview-b','preview-a'])insert.run(id,'model','public');
  insert.run('preview-unrelated',null,'public');insert.run('preview-hidden','model','hidden');
  try {
   const first=await api.feed(null,{catalogId:'model',order:'newest',before:1000,limit:2});
   assert.deepEqual(first.map(p=>p.id),['preview-c','preview-b']);
   const older=await api.feed(null,{catalogId:'model',order:'newest',before:first[1].createdAt,beforeId:first[1].id,limit:2});
   assert.deepEqual(older.map(p=>p.id),['preview-a']);
  } finally {db.prepare("DELETE FROM community_posts WHERE id IN ('preview-a','preview-b','preview-c','preview-unrelated','preview-hidden')").run();}
 });
 await t.test('Not for sale rejects stale-client offers; request messages require acceptance; blocks cover offers and replies',async()=>{
  await assert.rejects(()=>api.createCollectionOffer('buyer',{itemId:piece.id,priceCents:1000,quantity:1,acceptedTerms:true,country:'US',postalCode:'94105'}),/not accepting/);
  const thread=await api.collectorMessageAction('buyer',{action:'start',recipientId:'owner',body:'Hello'});await assert.rejects(()=>api.collectorMessageAction('buyer',{action:'send',id:thread.id,body:'Again'}),/accepted/);
  await api.collectorMessageAction('owner',{action:'accept_request',id:thread.id});await api.collectorMessageAction('buyer',{action:'send',id:thread.id,body:'Thanks'});
  await api.communityAction('owner',{action:'relationship',kind:'block',targetId:'buyer'}).catch(async()=>{await api.communityAction('buyer',{action:'settings',handle:'buyer',displayName:'Buyer',published:true,publishConfirmed:true});await api.communityAction('owner',{action:'relationship',kind:'block',targetId:'buyer'});});
  await assert.rejects(()=>api.collectorMessageAction('buyer',{action:'send',id:thread.id,body:'Bypass'}),/unavailable/);assert.deepEqual(await api.feed('buyer'),[]);assert.deepEqual(await api.feed('buyer',{catalogId:'model',order:'newest',limit:2}),[]);assert.equal(await api.getPiece(piece.id,'buyer'),null);
  await api.communityAction('owner',{action:'relationship',kind:'block',targetId:'buyer',enabled:false});
 });
 db.prepare(`INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,status,stripe_account_id,stripe_charges_enabled,stripe_payouts_enabled,seller_terms_version,seller_terms_accepted_at,shipping_mode,default_shipping_cents,shipping_origin_street_1,shipping_origin_city,shipping_origin_region,shipping_origin_postal_code,shipping_origin_phone) VALUES ('seller','owner','seller','Seller','Owner','owner@example.test','active','acct_test',1,1,?,CURRENT_TIMESTAMP,'flat',600,'100 Market St','San Francisco','CA','94105','4155550100')`).run(POLICY_VERSION);
 db.prepare(`INSERT INTO products (id,seller_id,catalog_product_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,inventory_quantity,status,package_length,package_width,package_height,package_weight) VALUES ('listing','seller','model','listing','unit1','Porsche 911','1:64','MINI GT','Porsche','911',2000,1,'active','5','4','3','1')`).run();
 await api.configureCollectionCommerce('owner',{itemId:piece.id,listingId:'listing',availability:'open_to_offers',minimumCents:100});
 const offer=buyer=>api.createCollectionOffer(buyer,{itemId:piece.id,priceCents:1500,quantity:1,acceptedTerms:true,country:'US',postalCode:'94105'});
 let first,second;
 await t.test('two acceptances share one reservation and block listing purchase',async()=>{
  first=await offer('buyer');second=await offer('buyer2');const a=await Promise.allSettled([api.changeCollectionOffer('owner',{action:'accept',id:first.id,acceptedTerms:true}),api.changeCollectionOffer('owner',{action:'accept',id:second.id,acceptedTerms:true})]);assert.equal(a.filter(v=>v.status==='fulfilled').length,1);assert.equal(db.prepare("SELECT reserved_quantity q FROM products WHERE id='listing'").get().q,1);assert.equal(db.prepare("SELECT count(*) n FROM collection_offers WHERE status='reserved'").get().n,1);await assert.rejects(()=>api.loadAuthoritativeCart([{productId:'listing',quantity:1}]),/available/);
 });
 await t.test('expiry releases exactly once, historical terms remain immutable, existing listing purchase wins the opposite race',async()=>{
  await api.expireCollectionOffers(Date.now()+25*3600000);await api.expireCollectionOffers(Date.now()+25*3600000);assert.equal(db.prepare("SELECT reserved_quantity q FROM products WHERE id='listing'").get().q,0);
  const pending=db.prepare("SELECT * FROM collection_offers WHERE status='proposed'").get();assert.ok(pending);assert.throws(()=>db.prepare('UPDATE collection_offers SET price_cents=1 WHERE id=?').run(pending.id),/immutable/);
  const cart=await api.loadAuthoritativeCart([{productId:'listing',quantity:1}]),reservation=await api.reserveCart(cart,'buyer',POLICY_VERSION);await assert.rejects(()=>api.changeCollectionOffer('owner',{action:'accept',id:pending.id,acceptedTerms:true}),/changed|reserved/);await api.releaseReservation(reservation.reservationId);await api.releaseReservation(reservation.reservationId);assert.equal(db.prepare("SELECT reserved_quantity q FROM products WHERE id='listing'").get().q,0);
 });

 await t.test('accepted price reaches existing checkout, retries retain one hold and duplicate callbacks create one paid order',async()=>{
  const pending=db.prepare("SELECT * FROM collection_offers WHERE status='proposed'").get();
  const counter=await api.changeCollectionOffer('owner',{action:'counter',id:pending.id,priceCents:1700});
  assert.equal(db.prepare('SELECT status FROM collection_offers WHERE id=?').get(pending.id).status,'superseded');
  await assert.rejects(()=>api.changeCollectionOffer('owner',{action:'accept',id:counter.id,acceptedTerms:true}),/other collector/);
  const buyer=pending.buyer_id;await api.changeCollectionOffer(buyer,{action:'accept',id:counter.id,acceptedTerms:true});
  assert.throws(()=>db.prepare("UPDATE products SET condition_notes='changed' WHERE id='listing'").run(),/cannot change/);
  const user={id:buyer,email:buyer+'@example.test'},destination={name:'Buyer',street1:'100 Market St',street2:'',city:'San Francisco',state:'CA',zip:'94105',country:'US'};
  const q=await api.quoteCollectionOffer(user,counter.id,destination),input={destination,shippingSelection:{quoteId:q.quoteId,rateId:q.options[0].id},shippingCents:q.options[0].amountCents,acceptedFinalQuote:true,policyVersion:POLICY_VERSION};
  const checkout=await api.payCollectionOffer(user,counter.id,input);
  assert.equal(db.prepare('SELECT subtotal_cents n FROM checkout_reservations WHERE id=?').get(checkout.reservationId).n,1700);
  assert.equal(db.prepare("SELECT reserved_quantity n FROM products WHERE id='listing'").get().n,1);
  await api.closeCollectionCheckout(buyer,counter.id);assert.equal(db.prepare("SELECT reserved_quantity n FROM products WHERE id='listing'").get().n,1);
  const retry=await api.payCollectionOffer(user,counter.id,input),session=sessions.get(retry.sessionId);session.payment_status='paid';session.status='complete';
  await api.processStripeEvent({id:'community_paid',type:'checkout.session.completed',data:{object:session}});
  await api.processStripeEvent({id:'community_paid_duplicate',type:'checkout.session.completed',data:{object:session}});
  assert.equal(db.prepare('SELECT count(*) n FROM orders WHERE checkout_reservation_id=?').get(retry.reservationId).n,1);
  assert.equal(db.prepare("SELECT inventory_quantity n FROM products WHERE id='listing'").get().n,0);
  assert.equal(db.prepare('SELECT status FROM collection_offers WHERE id=?').get(counter.id).status,'completed');
  assert.equal((await api.getPiece(piece.id,null)).availability,'previously_owned');
 });

 await t.test('late paid callbacks create a reconciliation record without an order or a second sale',async()=>{
  const late=await make({visibility:'public',publishConfirmed:true});
  db.prepare("INSERT INTO products (id,seller_id,catalog_product_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,inventory_quantity,status,package_length,package_width,package_height,package_weight) VALUES ('late-listing','seller','model','late-listing','late-unit','Porsche 911','1:64','MINI GT','Porsche','911',2000,1,'active','5','4','3','1')").run();
  await api.configureCollectionCommerce('owner',{itemId:late.id,listingId:'late-listing',availability:'open_to_offers'});
  const offer=await api.createCollectionOffer('buyer',{itemId:late.id,priceCents:1500,quantity:1,acceptedTerms:true,country:'US',postalCode:'94105'});await api.changeCollectionOffer('owner',{action:'accept',id:offer.id,acceptedTerms:true});
  const user={id:'buyer',email:'buyer@example.test'},destination={name:'Buyer',street1:'100 Market St',street2:'',city:'San Francisco',state:'CA',zip:'94105',country:'US'},q=await api.quoteCollectionOffer(user,offer.id,destination);
  const checkout=await api.payCollectionOffer(user,offer.id,{destination,shippingSelection:{quoteId:q.quoteId,rateId:q.options[0].id},shippingCents:q.options[0].amountCents,acceptedFinalQuote:true,policyVersion:POLICY_VERSION});
  await api.expireCollectionOffers(Date.now()+25*3600000);const session=sessions.get(checkout.sessionId);session.payment_status='paid';session.status='complete';
  for(const id of ['late-event','late-retry'])await assert.rejects(()=>api.processStripeEvent({id,type:'checkout.session.completed',data:{object:session}}),/reconciliation/);
  assert.equal(db.prepare('SELECT count(*) n FROM orders WHERE checkout_reservation_id=?').get(checkout.reservationId).n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM community_payment_exceptions WHERE session_id=?').get(session.id).n,1);
  assert.equal(db.prepare("SELECT reserved_quantity n FROM products WHERE id='late-listing'").get().n,0);
  const again=await api.createCollectionOffer('buyer2',{itemId:late.id,priceCents:1500,quantity:1,acceptedTerms:true,country:'US',postalCode:'94105'});await api.changeCollectionOffer('owner',{action:'accept',id:again.id,acceptedTerms:true});
  await api.configureCollectionCommerce('owner',{itemId:late.id,availability:'not_for_sale'});
  assert.equal(db.prepare('SELECT status FROM collection_offers WHERE id=?').get(again.id).status,'reserved');
  await api.cancelCollectionReservation('buyer2',again.id);
  assert.equal(db.prepare("SELECT reserved_quantity n FROM products WHERE id='late-listing'").get().n,0);
  assert.equal(db.prepare("SELECT status FROM products WHERE id='late-listing'").get().status,'inactive');
 });
 await t.test('add-piece selling setup respects publication, ownership and eligible single-piece listings',async()=>{
  for(const id of ['form-owner','form-new']){
   db.prepare('INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,0,0)').run(id,id,id+'@example.test');
   db.prepare('INSERT INTO collector_profiles (id,user_id,display_name,handle) VALUES (?,?,?,?)').run(id,id,id,id);
   await api.settings(id);
  }
  assert.deepEqual(await api.collectionSellingOptions('form-new'),{published:false,sellerReady:false,sellerType:null,listings:[]});
  await api.communityAction('form-owner',{action:'settings',handle:'form-owner',displayName:'Form Owner',published:true,publishConfirmed:true});
  db.prepare("INSERT INTO sellers (id,owner_user_id,slug,store_name,contact_name,contact_email,status,seller_type,stripe_account_id,stripe_charges_enabled,stripe_payouts_enabled,seller_terms_version,seller_terms_accepted_at) VALUES ('form-seller','form-owner','form-seller','Form Seller','Owner','form-owner@example.test','active','collector','acct_form_test',1,1,?,CURRENT_TIMESTAMP)").run(POLICY_VERSION);
  for(const [id,qty,status] of [['form-sale',1,'active'],['form-offers',1,'active'],['form-multi',2,'active'],['form-draft',1,'draft']])
   db.prepare("INSERT INTO products (id,seller_id,catalog_product_id,slug,seller_sku,title,scale,model_manufacturer,vehicle_make,vehicle_model,price_cents,inventory_quantity,status,package_length,package_width,package_height,package_weight) VALUES (?,'form-seller','model',?,?,'Porsche 911','1:64','MINI GT','Porsche','911',2000,?,?,'5','4','3','1')").run(id,id,id,qty,status);
  const options=await api.collectionSellingOptions('form-owner');assert.equal(options.sellerReady,true);
  assert.deepEqual(options.listings.map(l=>l.id).sort(),['form-offers','form-sale']);
  assert.deepEqual((await api.collectionSellingOptions('form-new')).listings,[]);
  const saved=await api.savePiece('form-owner',{catalogId:'model',visibility:'private',availability:'for_sale',photos:[]});
  assert.equal(saved.version,1);assert.equal((await api.getPiece(saved.id,'form-owner')).availability,'not_for_sale');
  await assert.rejects(()=>api.configureCollectionCommerce('form-owner',{itemId:saved.id,listingId:'form-sale',availability:'for_sale'}),/publish this piece/);
  const published=await api.savePiece('form-owner',{id:saved.id,version:saved.version,catalogId:'model',visibility:'public',publishConfirmed:true,photos:[]});assert.equal(published.version,2);
  db.prepare("UPDATE community_settings SET published=0 WHERE user_id='form-owner'").run();
  await assert.rejects(()=>api.configureCollectionCommerce('form-owner',{itemId:saved.id,listingId:'form-sale',availability:'for_sale'}),/Publish your collector profile/);
  db.prepare("UPDATE community_settings SET published=1 WHERE user_id='form-owner'").run();
  await api.configureCollectionCommerce('form-owner',{itemId:saved.id,listingId:'form-sale',availability:'for_sale'});
  assert.equal((await api.getPiece(saved.id,null)).availability,'for_sale');
  assert.deepEqual((await api.collectionSellingOptions('form-owner')).listings.map(l=>l.id),['form-offers']);
  assert.equal((await api.collectionSellingOptions('form-owner',saved.id)).listings.length,2);
  const other=await api.savePiece('form-owner',{catalogId:'model',visibility:'public',publishConfirmed:true,photos:[]});
  await assert.rejects(()=>api.configureCollectionCommerce('form-owner',{itemId:other.id,listingId:'form-sale',availability:'open_to_offers'}),/already linked/);
  await api.configureCollectionCommerce('form-owner',{itemId:other.id,listingId:'form-offers',availability:'open_to_offers',minimumCents:1200});
  assert.equal((await api.getPiece(other.id,null)).availability,'open_to_offers');
  assert.equal((await api.getPiece(other.id,null)).minimumCents,1200);
  await assert.rejects(()=>api.configureCollectionCommerce('form-new',{itemId:other.id,listingId:'form-offers',availability:'for_sale'}),/unavailable/);
  const current=await api.getPiece(other.id,'form-owner');
  await api.savePiece('form-owner',{...current,photos:[],privateNotes:'Updated without another physical piece'});
  await api.configureCollectionCommerce('form-owner',{itemId:other.id,availability:'not_for_sale'});
  assert.equal((await api.getPiece(other.id,'form-owner')).availability,'not_for_sale');
  assert.equal(db.prepare("SELECT count(*) n FROM collection_items WHERE owner_id='form-owner'").get().n,2);
  assert.equal(db.prepare("SELECT count(*) n FROM community_posts WHERE owner_id='form-owner'").get().n,0);
 });
 await t.test('deleting an account preserves paid commercial snapshots while removing private collection records',async()=>{
  const source=await readFile(join(root,'lib/collector-store.ts'),'utf8'),body=source.slice(source.indexOf('export async function deleteCollectorAccount('));
  const {transform}=await import('esbuild'),js=await transform(body.replace('export async function','async function'),{loader:'ts'}),remove=new Function('getD1',js.code+';return deleteCollectorAccount;')(()=>binding);
  await remove('owner');assert.equal(db.prepare("SELECT count(*) n FROM collection_items WHERE owner_id='owner'").get().n,0);
  assert.equal(db.prepare("SELECT count(*) n FROM collection_offers WHERE status='completed'").get().n,1);
  assert.equal(db.prepare("SELECT item_id FROM collection_offers WHERE status='completed'").get().item_id,null);
 });
 await t.test('photo sanitization removes location metadata and rejects malformed files',()=>{const input=Uint8Array.from([255,216,255,225,0,8,71,80,83,49,50,51,255,219,0,4,0,1,255,218,0,2,1,2,255,217]);const out=api.stripPhotoMetadata(input);assert.ok(!new TextDecoder().decode(out).includes('GPS'));assert.equal(out[2],255);assert.equal(out[3],219);assert.throws(()=>api.stripPhotoMetadata(Uint8Array.from([1,2,3,4])),/JPEG/);});
});
