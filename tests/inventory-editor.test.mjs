import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { sellerFixture } from "./fixtures/seller-dashboard.mjs";

function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const match = find(child, predicate); if (match) return match; }
}
function text(tree) {
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return [tree.props?.children].flat(Infinity).map(text).join(" ");
}

test("editor publishes directly, retains partial uploads, focuses errors and protects unsaved edits", async t => {
  const root = process.cwd(), scratch = await mkdtemp(join(root, ".sites-runtime/editor-behavior-")), bundle = join(scratch, "test.mjs");
  const originalFormData = globalThis.FormData, originalRaf = globalThis.requestAnimationFrame;
  const boundary = globalThis.__inventoryEditor = { hooks: null, upload: async () => {}, refresh() {}, closed: 0 };
  globalThis.FormData = class { constructor(form) { this.values = form.values; } *[Symbol.iterator]() { yield* Object.entries(this.values); } };
  globalThis.requestAnimationFrame = callback => callback();
  const mocks = {
    react: "export const useState=(...a)=>globalThis.__inventoryEditor.hooks.state(...a),useRef=(...a)=>globalThis.__inventoryEditor.hooks.ref(...a),useEffect=()=>{};",
    "next/link": "export default 'a';", "next/navigation": "export const useRouter=()=>({refresh(){globalThis.__inventoryEditor.refresh()},replace(){}});",
    "./use-dialog-focus": "export const useDialogFocus=()=>({current:null});",
    "./use-task-measurement": "export const useTaskMeasurement=()=>({start(){},complete(){}});",
    "./catalog-model-picker": "export const CatalogModelPicker='CatalogPicker';",
    "./product-image-fields": "export const ProductImageFields='PhotoFields';",
    "./collectible-listing-fields": "export const CollectibleListingFields='ConditionFields',RequiredPhotoChecklist='PhotoChecklist';",
    "./listing-buyer-preview": "export const ListingBuyerPreview='Preview';",
    "@/lib/upload-client": "export const uploadProductPhotoFiles=(args)=>globalThis.__inventoryEditor.upload(args);",
  };
  const output = await build({ stdin: { contents: "export {StoreProductEditor} from './components/store-product-editor.tsx'; export {CollectibleListingFields} from './components/collectible-listing-fields.tsx'; export {setSelectedPhotoViews} from './lib/listing-evidence.ts';", resolveDir: root }, bundle: true, platform: "node", format: "esm", packages: "external", write: false, plugins: [{ name: "editor-mocks", setup(b) {
    b.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "mock" } : path.endsWith(".css") ? { path, namespace: "css" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "css" }, () => ({ contents: "" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], resolveDir: root }));
  } }] });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { StoreProductEditor, CollectibleListingFields } = await import(pathToFileURL(bundle).href);
  t.after(async () => { globalThis.FormData = originalFormData; globalThis.requestAnimationFrame = originalRaf; delete globalThis.__inventoryEditor; await unlink(bundle); await rmdir(scratch); });
  function harness(component, props) {
    const state = []; let index = 0;
    const hooks = { state(initial) { const slot=index++; if (!(slot in state)) state[slot]=typeof initial === "function" ? initial() : initial; return [state[slot], value => { state[slot]=typeof value === "function" ? value(state[slot]) : value; }]; }, ref(initial) { const slot=index++; if (!(slot in state)) state[slot]={current:initial}; return state[slot]; } };
    return () => { index=0; boundary.hooks=hooks; return component(props); };
  }
  const fixture = sellerFixture();
  const product = { ...fixture.inventory[0], status: "draft", modelCondition: "new" };
  const base = { product, store: fixture.store, setup: { ...fixture.setup, readyToPublish: true }, marketplaceFeeBps: 700, onClose() { boundary.closed++; } };
  const values = { catalogProductId: "model", sellerSku: "SKU-1", price: "100", inventoryQuantity: "2", availabilityType: "in_stock", modelCondition: "new", packagingCondition: "excellent", originalBoxStatus: "included", coaStatus: "not_applicable", missingParts: "None known", defects: "None known", restorationCustomization: "None known" };
  let focused = "";
  const form = input => ({ values: input, querySelectorAll() { return Object.entries(input).map(([name,value]) => ({ name,value,required:false,willValidate:true,validity:{valid:true},getAttribute(key){return key === "name" ? name : null;},matches(){return false;},focus(){focused=name;},scrollIntoView(){} })); } });
  function submit(render, input = values, publish = false) {
    const element=find(render(), node=>node.type === "form"); const target=form(input); element.props.ref.current=target;
    return element.props.onSubmit({preventDefault(){},currentTarget:target,nativeEvent:{submitter:{getAttribute(){return publish ? "publish" : "save";}}}});
  }
  await t.test("New hides repetitive fields; switching back restores unanswered questions", () => {
    const render=harness(CollectibleListingFields,{product:{modelCondition:"mint"}});
    find(render(),node=>node.props?.name === "modelCondition").props.onChange({target:{value:"new"}});
    assert.match(text(render()),/No known missing parts/);
    assert.equal(find(render(),node=>node.props?.name === "defects").props.type,"hidden");
    find(render(),node=>node.props?.name === "modelCondition").props.onChange({target:{value:"mint"}});
    assert.equal(find(render(),node=>node.props?.name === "defects").props.initial, "");
    const withDamage=harness(CollectibleListingFields,{product:{modelCondition:"new",defects:"Paint chip"}});
    assert.equal(find(withDamage(),node=>node.props?.name === "defects").props.initial,"Paint chip");
    assert.doesNotMatch(text(withDamage()),/No known missing parts/);
  });
  await t.test("save and publish run in order and close only after confirmed publication",async()=>{
    const calls=[]; boundary.closed=0;
    const render=harness(StoreProductEditor,{...base,action:async payload=>{calls.push(payload);return {productId:"saved"};}});
    await submit(render,values,true);
    assert.deepEqual(calls.map(call=>call.action),["save_product","product_status"]); assert.equal(calls[1].productId,"saved"); assert.equal(boundary.closed,1);
  });
  await t.test("failed uploads retain only remaining files and retry the same saved draft",async()=>{
    const calls=[]; boundary.closed=0;
    const render=harness(StoreProductEditor,{...base,action:async payload=>{calls.push(payload);return {productId:"saved-draft"};}});
    const files=[new File(["photo"],"first.jpg"),new File(["photo"],"second.jpg")];
    find(render(),node=>node.type === "PhotoFields").props.onFilesChange(files);
    boundary.upload=async input=>{input.onUploaded([{id:"uploaded",url:"/media/first.jpg",alt:"Front"}],1);throw new Error("Upload interrupted.");};
    await submit(render);
    assert.match(text(render()),/Draft saved.*1 photo.*still need uploading/);
    assert.equal(boundary.closed,0);
    assert.deepEqual(find(render(),node=>node.type === "PhotoFields").props.files,[files[1]]);
    boundary.upload=async input=>{assert.deepEqual(input.files,[files[1]]);input.onUploaded([{id:"second",url:"/media/second.jpg",alt:"Rear"}],1);};
    await submit(render); assert.equal(calls[1].id,"saved-draft"); assert.match(text(render()),/Draft saved. You can finish/);
  });
  await t.test("field-specific API errors retain inputs and focus the offending control",async()=>{
    focused="";
    const render=harness(StoreProductEditor,{...base,action:async()=>{throw Object.assign(new Error("SKU already used."),{fields:{sellerSku:"Choose another SKU."}});}});
    await submit(render);
    assert.equal(focused,"sellerSku"); assert.match(text(render()),/Choose another SKU/);
    assert.equal(find(render(),node=>node.props?.name === "sellerSku").props["aria-invalid"],true);
  });
  await t.test("unsaved changes require an explicit discard and pending saves cannot submit twice",async()=>{
    boundary.closed=0; let resolve; let calls=0;
    const render=harness(StoreProductEditor,{...base,action:()=>{calls++;return new Promise(done=>{resolve=done;});}});
    find(render(),node=>node.type === "form").props.onChange();
    find(render(),node=>node.props?.["aria-label"] === "Close listing editor").props.onClick();
    assert.equal(boundary.closed,0); assert.match(text(render()),/Discard unsaved changes/);
    const first=submit(render); await submit(render); assert.equal(calls,1); resolve({productId:"saved"}); await first;
  });
});
