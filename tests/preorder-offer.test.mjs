import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

function find(tree,predicate) {
  if(!tree||typeof tree!=="object")return null;
  if(predicate(tree))return tree;
  for(const child of [tree.props?.children].flat(Infinity)){const result=find(child,predicate);if(result)return result;}
  return null;
}

test("preorder offers render server data and keep guest, consent, quantity and sticky actions consistent",async t=>{
  const root=fileURLToPath(new URL("../",import.meta.url));
  const scratch=await mkdtemp(join(root,".sites-runtime/preorder-ui-")),bundle=join(scratch,"test.mjs");
  let states=[],refs=[],effects=[],pending=[],si=0,ri=0,ei=0,observer,scrolls=0,focuses=0;
  const requests=[];
  const originals={fetch:globalThis.fetch,FormData:globalThis.FormData,window:globalThis.window,IntersectionObserver:globalThis.IntersectionObserver};
  const marketplace={collector:{id:"buyer"},authReady:true};
  globalThis.__preorderUI={marketplace,
    state(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==="function"?value(states[i]):value;}];},
    ref(initial){return refs[ri++]??(refs[ri-1]={current:initial});},
    effect(callback,deps){const i=ei++,previous=effects[i];if(!previous||deps.some((v,n)=>v!==previous.deps[n]))pending.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:callback()};});},
  };
  globalThis.IntersectionObserver=class {constructor(callback){observer={callback};this.record=observer;}observe(target){this.record.target=target;}disconnect(){this.record.disconnected=true;}};
  globalThis.FormData=class {constructor(values){this.values=values;}get(key){return this.values[key]??null;}};
  globalThis.window={location:{assign(url){requests.push({redirect:url});}}};
  globalThis.fetch=async(url,options)=>{const body=options?.body?JSON.parse(options.body):null;requests.push({url,body});return{ok:true,async json(){return body?.action==="hold"?{id:"reservation"}:body?.action==="deposit"?{url:"https://checkout.example.test"}:{offers:[]};}};};
  t.after(async()=>{effects.forEach(e=>e?.cleanup?.());Object.assign(globalThis,originals);delete globalThis.__preorderUI;await unlink(bundle);await rmdir(scratch);});
  const mocks={react:"const f=globalThis.__preorderUI;export const useState=f.state,useRef=f.ref,useEffect=f.effect;","next/link":"export default 'link';","./marketplace-provider":"export const useMarketplace=()=>globalThis.__preorderUI.marketplace;"};
  const result=await build({entryPoints:[join(root,"components/preorder-offer.tsx")],bundle:true,platform:"node",format:"esm",packages:"external",write:false,plugins:[{name:"preorder-fixture",setup(builder){
    builder.onResolve({filter:/.*/},({path})=>mocks[path]?{path,namespace:"fixture"}:undefined);
    builder.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({contents:mocks[path]}));
  }}]});
  await writeFile(bundle,result.outputFiles[0].contents);
  const {PreorderOffer,PreorderBatchOffer}=await import(pathToFileURL(bundle).href);
  const product={id:"listing",slug:"test-model",currency:"usd",priceCents:5000};
  const offer={id:"batch",canReserve:true,remaining:3,terms:{revision:7,buyerLimit:3,paymentModel:"deposit_10",priceCents:5000,depositUnitCents:500,currency:"usd",dispatch:{label:"March 2027"}}};
  function reset(){effects.forEach(e=>e?.cleanup?.());states=[];refs=[];effects=[];pending=[];}
  function render(Component,props){si=ri=ei=0;const tree=Component(props);const target=find(tree,n=>n.props?.className==="preorder-action-target");if(target)target.props.ref.current={scrollIntoView(){scrolls++;},focus(){focuses++;}};pending.splice(0).forEach(run=>run());return tree;}
  let tree=render(PreorderOffer,{product,initialOffers:[offer]});
  assert.ok(find(tree,n=>n.type===PreorderBatchOffer));assert.equal(requests.length,0,"Server offers must not trigger a hydration fetch");
  tree=render(PreorderOffer,{product,initialOffers:[{...offer,terms:{...offer.terms,revision:8}}]});
  assert.equal(find(tree,n=>n.type===PreorderBatchOffer).props.offer.terms.revision,8,"A server refresh replaces stale offer terms");
  reset();render(PreorderOffer,{product,initialOffers:[]});assert.equal(requests.length,0,"An empty server result is authoritative too");
  reset();const props={product,offer,sticky:true};
  const batch=()=>render(PreorderBatchOffer,props);
  const sticky=tree=>find(tree,n=>n.props?.className==="product-sticky-purchase preorder-sticky-purchase");
  marketplace.collector=null;tree=batch();
  assert.ok(find(tree,n=>n.props?.href?.startsWith("/sign-in?returnTo=")));assert.equal(find(tree,n=>n.type==="form"),null);
  marketplace.collector={id:"buyer"};tree=batch();
  assert.equal(find(tree,n=>n.props?.href?.startsWith("/sign-in")),null);
  const quantity=find(tree,n=>n.props?.name==="quantity");quantity.props.onChange({target:{value:"2"}});tree=batch();
  assert.equal(find(tree,n=>n.props?.className==="button dark preorder-submit").props.children,"Preorder — $10.00 deposit");
  assert.equal(find(tree,n=>n.props?.name==="accepted").props.required,true);
  const submit=()=>find(batch(),n=>n.type==="form").props.onSubmit;
  await submit()({preventDefault(){},currentTarget:{accepted:"on"}});assert.equal(requests.length,0,"Both acknowledgments are required");
  observer.callback([{isIntersecting:false,boundingClientRect:{bottom:500}}]);assert.equal(sticky(batch()),null);
  observer.callback([{isIntersecting:false,boundingClientRect:{bottom:-1}}]);tree=batch();
  const bar=sticky(tree);assert.ok(bar);find(bar,n=>n.type==="button").props.onClick();
  assert.equal(scrolls,1);assert.equal(focuses,1);assert.equal(requests.length,0,"Sticky action returns to consent without creating a reservation");
  await submit()({preventDefault(){},currentTarget:{accepted:"on",adultConsent:"on"}});
  assert.equal(requests[0].body.revision,7);assert.equal(requests[0].body.quantity,2);assert.equal(requests[0].body.action,"hold");
  assert.equal(requests[1].body.action,"deposit");assert.equal(requests[1].body.acceptedTerms,true);assert.equal(requests[2].redirect,"https://checkout.example.test");
  observer.callback([{isIntersecting:true,boundingClientRect:{bottom:40}}]);assert.equal(sticky(batch()),null);
  find(batch(),n=>n.props?.name==="quantity").props.onChange({target:{value:"4"}});
  assert.equal(find(batch(),n=>n.props?.className==="button dark preorder-submit").props.disabled,true);
  props.offer={...offer,canReserve:false};tree=batch();assert.equal(find(tree,n=>n.type==="form"),null);assert.equal(sticky(tree),null);assert.equal(observer.disconnected,true);
});
