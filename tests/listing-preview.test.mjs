import assert from "node:assert/strict";
import test from "node:test";
import { buildListingPreview } from "../lib/listing-preview.ts";

test("draft preview uses current values, canonical identity and exact pending cover order without private fields", () => {
  const images = [{id:"second",url:"/second.jpg",alt:"Left side - Actual item"},{id:"first",url:"/first.jpg",alt:"Front - Actual item"}];
  const pendingImages = [{id:"new-detail",url:"blob:detail",alt:"Disclosed defects / repairs - Detail"},{id:"new-cover",url:"blob:cover",alt:"Front - Cover"}];
  const input = {values:{title:"Unsaved title",price:"$175.25",quantity:"3",modelCondition:"good",defects:"Unsaved roof chip",sellerDisplayName:"My garage",sellerDescription:"New biography",sellerPackingApproach:"New packing details",shippingOriginRegion:"CA",shippingOriginCountry:"US",shippingOriginStreet1:"PRIVATE STREET",shippingOriginPostalCode:"PRIVATE ZIP",shippingOriginPhone:"PRIVATE PHONE"},catalog:{title:"Catalog title",scale:"1:18",modelManufacturer:"AUTOart",reservedQuantity:1,privateNote:"PRIVATE CATALOG"},seller:{contactEmail:"PRIVATE EMAIL"},images,primaryImageUrl:"/first.jpg",pendingImages,pendingCoverUrl:"blob:cover"};
  const product=buildListingPreview(input);
  assert.equal(product.title,"Unsaved title"); assert.equal(product.priceCents,17525);
  assert.equal(product.defects,"Unsaved roof chip"); assert.equal(product.availableQuantity,2);
  assert.deepEqual(product.images.map(image=>image.id),["new-cover","second","first","new-detail"]);
  assert.deepEqual(product.images.map(image=>image.sortOrder),[0,1,2,3]);
  assert.equal(product.primaryImageUrl,"blob:cover");
  assert.equal(product.sellerPackingApproach,"New packing details");
  assert.doesNotMatch(JSON.stringify(product),/PRIVATE/);
  assert.deepEqual(images.map(image=>image.id),["second","first"]);
  assert.equal(buildListingPreview({...input,values:{...input.values,title:""}}).title,"Catalog title");
  assert.equal(buildListingPreview({...input,values:{...input.values,price:"invalid"}}).priceCents,0);
});

test("preview keeps unsaved photos and matches the buyer gallery's legacy cover fallback", () => {
  const base={values:{},catalog:{},seller:null,images:[],primaryImageUrl:"/legacy.jpg",pendingImages:[{id:"new",url:"blob:new",alt:"Detail"}]};
  assert.deepEqual(buildListingPreview(base).images.map(image=>image.url),["/legacy.jpg","blob:new"]);
  assert.deepEqual(buildListingPreview({...base,primaryImageUrl:null}).images.map(image=>image.url),["blob:new"]);
  assert.deepEqual(buildListingPreview({...base,pendingImages:[]}).images.map(image=>image.url),["/legacy.jpg"]);
});
