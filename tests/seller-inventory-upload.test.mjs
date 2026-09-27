import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setImmediate } from "node:timers/promises";
import { build } from "esbuild";

function find(tree, match) {
  if (!tree || typeof tree !== "object") return undefined;
  if (match(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const found = find(child, match); if (found) return found; }
}
function text(tree) {
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return [tree.props?.children].flat(Infinity).map(text).join(" ").replace(/\s+/g, " ").trim();
}
const saveButton = tree => find(tree, node => node.type === "button" && /^Save .* to inventory$/.test(text(node)));
const fileInput = tree => find(tree, node => node.type === "input" && node.props.type === "file");
const editor = tree => find(tree, node => node.type === "textarea");
const readyRow = { rowNumber: 2, sellerSku: "911-SILVER", title: "Porsche 911", priceCents: 24995, inventoryQuantity: 2, operation: "insert" };
const ready = { valid: [readyRow], validCount: 1, errors: [] };
const file = (overrides = {}) => ({ name: "inventory.csv", size: 120, text: async () => "original CSV", ...overrides });

test("inventory import checks files before saving and recovers safely from errors", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/csv-test-")), bundle = join(scratch, "import.mjs");
  globalThis.__csvTest = { hooks: null };
  const mocks = {
    react: "export const useState=(...a)=>globalThis.__csvTest.hooks.state(...a),useRef=(...a)=>globalThis.__csvTest.hooks.ref(...a);",
    "next/link": "export default 'a';",
    "@/lib/analytics-client": "export const trackEvent=()=>{};",
    "./use-task-measurement": "export const useTaskMeasurement=()=>({start(){},complete(){}});",
  };
  t.after(async () => { delete globalThis.__csvTest; await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const output = await build({ entryPoints: [join(root, "components/seller-inventory-upload.tsx")], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "csv-fixtures", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : path.endsWith(".css") ? { path, namespace: "empty-css" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
      builder.onLoad({ filter: /.*/, namespace: "empty-css" }, () => ({ contents: "" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { SellerInventoryUpload } = await import(pathToFileURL(bundle).href);
  function renderer(action, disabled = false) {
    const state = []; let index = 0;
    const hooks = {
      state(initial) { const slot = index++; if (!(slot in state)) state[slot] = initial; return [state[slot], value => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }]; },
      ref(initial) { const slot = index++; if (!(slot in state)) state[slot] = { current: initial }; return state[slot]; },
    };
    const render = () => { index = 0; globalThis.__csvTest.hooks = hooks; return SellerInventoryUpload({ action, disabled, expanded: true }); };
    return { render, async choose(nextFile) {
      const input = { files: nextFile ? [nextFile] : [], value: "inventory.csv" };
      fileInput(render()).props.onChange({ currentTarget: input });
      assert.equal(input.value, "", "the same corrected filename can be selected again");
      await setImmediate(); return render();
    } };
  }

  await t.test("choosing a file previews automatically; explicit save uses the checked CSV", async () => {
    const requests = [];
    const view = renderer(async payload => { requests.push(payload); return payload.action === "preview_import" ? { preview: ready } : { created: 1, updated: 0, imported: 1 }; });
    assert.equal(saveButton(view.render()), undefined);
    let tree = await view.choose(file());
    assert.deepEqual(requests, [{ action: "preview_import", csv: "original CSV" }]);
    assert.equal(saveButton(tree).props.disabled, false);
    assert.match(text(tree), /inventory.csv/);
    assert.equal(find(tree, node => node.props?.className === "csv-editor").props.open, undefined);
    saveButton(tree).props.onClick(); await setImmediate(); tree = view.render();
    assert.deepEqual(requests[1], { action: "commit_import", csv: "original CSV" });
    assert.match(text(tree), /1 new draft created/); assert.doesNotMatch(text(tree), /0 existing/);
    assert.equal(saveButton(tree), undefined); assert.equal(editor(tree), undefined);
  });
  await t.test("row errors block all saving, even when other rows are valid", async () => {
    const requests = [];
    const view = renderer(async payload => { requests.push(payload); return { preview: { ...ready, errors: [{ row: 3, errors: ["price must be a valid amount"] }] } }; });
    const tree = await view.choose(file());
    assert.equal(saveButton(tree).props.disabled, true);
    assert.match(text(tree), /Row 3/); assert.match(text(tree), /price must be a valid amount/);
    saveButton(tree).props.onClick(); await setImmediate(); assert.equal(requests.length, 1);
  });
  await t.test("an invalid replacement file clears the previous saveable preview", async () => {
    let calls = 0;
    const view = renderer(async () => { calls++; return { preview: ready }; });
    await view.choose(file());
    const cancelled = await view.choose(); assert.equal(saveButton(cancelled).props.disabled, false);
    for (const invalid of [file({ size: 5_000_001 }), file({ name: "inventory.xlsx" }), file({ text: async () => "" }), file({ text: async () => { throw Error("unreadable"); } })]) {
      await view.choose(file()); const before = calls;
      const tree = await view.choose(invalid);
      assert.equal(saveButton(tree), undefined); assert.equal(calls, before);
      assert.ok(find(tree, node => node.props?.role === "alert"));
    }
  });
  await t.test("editing invalidates the preview and rechecking submits current text", async () => {
    const requests = [];
    const view = renderer(async payload => { requests.push(payload); return { preview: ready }; });
    let tree = await view.choose(file());
    editor(tree).props.onChange({ target: { value: "" } }); tree = view.render();
    assert.ok(editor(tree), "the editor stays available after clearing its contents");
    assert.equal(saveButton(tree), undefined);
    editor(tree).props.onChange({ target: { value: "corrected CSV" } }); tree = view.render();
    find(tree, node => node.type === "button" && text(node) === "Check file again").props.onClick();
    await setImmediate(); tree = view.render();
    assert.equal(requests[1].csv, "corrected CSV"); assert.equal(saveButton(tree).props.disabled, false);
  });
  await t.test("preview and save failures retain the file for retry", async () => {
    let failPreview = true, failSave = true;
    const view = renderer(async payload => {
      if (payload.action === "preview_import") { if (failPreview) throw Error("Try checking again"); return { preview: ready }; }
      if (failSave) throw Error("Could not save"); return { created: 0, updated: 1, imported: 1 };
    });
    let tree = await view.choose(file());
    assert.equal(editor(tree).props.value, "original CSV"); assert.equal(saveButton(tree), undefined);
    failPreview = false;
    find(tree, node => node.type === "button" && text(node) === "Check file again").props.onClick(); await setImmediate();
    saveButton(view.render()).props.onClick(); await setImmediate(); tree = view.render();
    assert.match(text(tree), /Could not save/); assert.equal(editor(tree).props.value, "original CSV");
    failSave = false; saveButton(tree).props.onClick(); await setImmediate();
    assert.match(text(view.render()), /1 existing listing updated/);
  });
  await t.test("in-flight reads and saves disable controls and prevent duplicate submissions", async () => {
    let finishRead, finishSave, saves = 0;
    const view = renderer(async payload => {
      if (payload.action === "preview_import") return { preview: ready };
      saves++; return new Promise(resolve => { finishSave = resolve; });
    });
    let tree = await view.choose(file({ text: () => new Promise(resolve => { finishRead = resolve; }) }));
    assert.equal(fileInput(tree).props.disabled, true); assert.match(text(tree), /Reading your file/);
    finishRead("slow CSV"); await setImmediate(); tree = view.render();
    const save = saveButton(tree); save.props.onClick(); save.props.onClick();
    assert.equal(saves, 1); assert.equal(fileInput(view.render()).props.disabled, true);
    finishSave({ created: 1, updated: 0, imported: 1 }); await setImmediate();
    assert.match(text(view.render()), /Import complete/);
  });
  await t.test("large previews keep full create/update counts and identify template examples", async () => {
    const rows = Array.from({ length: 105 }, (_, index) => ({ ...readyRow, rowNumber: index + 2, operation: index ? "insert" : "update", ...(index ? {} : { sellerSku: "SKU-001", title: "Example model" }) }));
    const view = renderer(async () => ({ preview: { valid: rows, validCount: rows.length, errors: [] } }));
    const tree = await view.choose(file());
    assert.match(text(tree), /104 New drafts 1 Listing to update/);
    assert.match(text(tree), /105 models checked successfully · showing the first 100/);
    assert.match(text(tree), /template’s example model/);
    assert.match(text(saveButton(tree)), /Save 105 models to inventory/);
    assert.match(text(tree), /Total stock replaces the current quantity/);
  });
  await t.test("disabled stores cannot read or submit imports", async () => {
    const view = renderer(async () => { throw Error("must not call"); }, true);
    assert.equal(fileInput(view.render()).props.disabled, true);
    const tree = await view.choose(file({ text: async () => { throw Error("must not read"); } }));
    assert.equal(editor(tree), undefined); assert.equal(saveButton(tree), undefined);
  });
});
