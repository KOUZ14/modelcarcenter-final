import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { PhotonImage } from "@cf-wasm/photon";
import { imageSize } from "image-size";
import { productImageSources } from "../lib/product-image-sources.ts";
import { productDisplayTitle } from "../lib/product-presentation.ts";

test("display titles remove repeated edge identity while preserving the seller's words", () => {
  assert.equal(productDisplayTitle({title:"UT Models Mclaren F1 LM Orange 1:18",modelManufacturer:"UT Models",scale:"1:18"}),"Mclaren F1 LM Orange");
  assert.equal(productDisplayTitle({title:"A 1:18 collection by UT Models",modelManufacturer:"UT Models",scale:"1:18"}),"A 1:18 collection by UT Models");
  assert.equal(productDisplayTitle({title:"A+B Racer 1:64",modelManufacturer:"A+B",scale:"1:64"}),"Racer");
});

test("responsive sources use only managed photos and retain external and unsaved images", () => {
  for (const url of ["blob:preview","/preview.jpg","https://example.test/car.jpg"]) assert.deepEqual(productImageSources(url),{src:url});
  const url="/media/listings/seller/product/photo.jpg";
  assert.equal(productImageSources(url,true).src,`${url}?w=192`);
  assert.match(productImageSources(url).srcSet,/w=640 640w/);
  assert.match(productImageSources(url).srcSet,/w=1440 1440w/);
});

test("image derivatives preserve aspect ratio, originals, cache behavior and evidence privacy", async t => {
  const root=fileURLToPath(new URL("../",import.meta.url));
  const scratch=await mkdtemp(join(root,".sites-runtime/image-variants-")),bundle=join(scratch,"test.mjs");
  const pixels=new Uint8Array(1000*600*4);
  for(let i=0;i<pixels.length;i+=4) { pixels[i]=(i/4)%251;pixels[i+1]=120;pixels[i+2]=40;pixels[i+3]=255; }
  const photo=new PhotonImage(pixels,1000,600);
  const original=photo.get_bytes();photo.free();
  const cache=new Map(); let evidence=false,published=true,exists=true,reads=0;
  const previousCaches=globalThis.caches;
  globalThis.caches={default:{async match(key){reads++;return cache.get(key.url)?.clone();},async put(key,response){cache.set(key.url,response);}}};
  globalThis.__imageVariants={
    database:{prepare(sql){return {bind(){return this;},async first(){return sql.includes("purchase_evidence_media") ? evidence : published;}};}},
    storage:{async get(){return exists ? {etag:"original",httpEtag:'"original"',httpMetadata:{contentType:"image/png"},body:new Response(original).body,async arrayBuffer(){return original.slice().buffer;},writeHttpMetadata(headers){headers.set("Content-Type","image/png");}} : null;}},
  };
  t.after(async()=>{globalThis.caches=previousCaches;delete globalThis.__imageVariants;await unlink(bundle);await rmdir(scratch);});
  const result=await build({stdin:{resolveDir:root,contents:"export {GET} from './app/media/[...key]/route.ts'; export {resizeListingImage} from './lib/product-image-variants.ts';"},bundle:true,platform:"node",format:"esm",packages:"external",write:false,
    plugins:[{name:"image-fixtures",setup(builder){
      builder.onResolve({filter:/^(@\/db|cloudflare:workers)$/},({path})=>({path,namespace:"fixture"}));
      builder.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({contents:path==="@/db"?"export const getD1=()=>globalThis.__imageVariants.database;":"export const env={IMAGES:globalThis.__imageVariants.storage};"}));
    }}]});
  await writeFile(bundle,result.outputFiles[0].contents);
  const {GET,resizeListingImage}=await import(pathToFileURL(bundle).href);
  const get=(query="",headers={})=>GET(new Request(`https://shop.example.test/media/listings/s/p/photo.png${query}`,{headers}),{params:Promise.resolve({key:["listings","s","p","photo.png"]})});
  const response=await get("?w=192"),variant=new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),"image/webp");
  assert.equal(imageSize(variant).width,192);assert.equal(imageSize(variant).height,115);
  assert.deepEqual(new Uint8Array(await (await get()).arrayBuffer()),original,"Inspection retains the original bytes");
  assert.deepEqual(new Uint8Array(await (await get("?w=192")).arrayBuffer()),variant);
  assert.equal(cache.size,1);
  assert.equal((await get("?w=192",{"if-none-match":response.headers.get("etag")})).status,304);
  assert.equal((await get("?w=99999")).status,400);
  assert.throws(()=>resizeListingImage(original,99999,"image/png"),/Unsupported/);
  const large=resizeListingImage(original,1440,"image/png");assert.deepEqual(large.bytes,original,"Small originals are not enlarged");
  evidence=true;published=false;const before=reads;
  assert.equal((await get("?w=192")).status,404);assert.equal(reads,before,"Private retained evidence is checked before cached derivatives");
  evidence=false;exists=false;assert.equal((await get("?w=192")).status,404);
});
