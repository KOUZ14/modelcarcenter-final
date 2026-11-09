import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

function find(tree, match) {
  if (!tree || typeof tree !== "object") return undefined;
  if (match(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const result = find(child, match);
    if (result) return result;
  }
}

test("photo viewer touch gestures", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/gallery-test-"));
  const bundle = join(scratch, "gallery.mjs");
  let slots = [], index = 0;
  globalThis.__galleryTest = {
    state(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], next => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; }];
    },
    ref(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
  };
  t.after(async () => {
    delete globalThis.__galleryTest;
    await unlink(bundle);
    await rmdir(scratch);
  });
  const mocks = {
    react: "export const useState=(...a)=>globalThis.__galleryTest.state(...a),useRef=(...a)=>globalThis.__galleryTest.ref(...a),useCallback=f=>f,useEffect=()=>{};",
    "next/image": "export default 'img';",
  };
  const output = await build({
    entryPoints: [join(root, "components/product-gallery.tsx")],
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "gallery-fixtures", setup(builder) {
      builder.onResolve({ filter: /^(react|next\/image)$/ }, ({ path }) => ({ path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { ProductGallery } = await import(pathToFileURL(bundle).href);

  function viewer() {
    slots = [];
    const captures = new Set();
    const target = {
      clientWidth: 360, clientHeight: 600,
      getBoundingClientRect: () => ({ left: 20, top: 100, width: 360, height: 600 }),
      setPointerCapture: id => captures.add(id),
      hasPointerCapture: id => captures.has(id),
      releasePointerCapture(id) {
        captures.delete(id);
        stage().props.onLostPointerCapture({ pointerId: id, currentTarget: target });
      },
    };
    const props = {
      productName: "Nissan Fairlady",
      images: [
        { id: "front", url: "/front.jpg", alt: "Front" },
        { id: "side", url: "/side.jpg", alt: "Side" },
      ],
    };
    let tree;
    function render() {
      index = 0;
      tree = ProductGallery(props);
      const surface = stage();
      if (surface) surface.props.ref.current = target;
    }
    const stage = () => find(tree, node => node.props?.className?.startsWith("inspection-stage"));
    const button = label => find(tree, node => node.props?.["aria-label"] === label);
    render(); button("Enlarge photo 1 of 2").props.onClick(); render();
    return {
      captures, render, button,
      pointer(handler, pointerId, x, y, extra = {}) {
        stage().props[handler]({ pointerId, clientX: x, clientY: y, button: 0, pointerType: "touch", currentTarget: target, ...extra });
      },
      image() { render(); return find(tree, node => node.props?.className === "inspection-image"); },
      view() {
        const transform = this.image().props.style.transform;
        const [, x, y, zoom] = transform.match(/translate3d\(([-\d.e]+)px, ([-\d.e]+)px, 0\) scale\(([-\d.e]+)\)/);
        return { x: Number(x), y: Number(y), zoom: Number(zoom) };
      },
    };
  }
  function expectView(actual, expected) {
    for (const [key, value] of Object.entries(expected)) {
      assert.ok(Math.abs(actual[key] - value) < 1e-9, `${key}: expected ${value}, got ${actual[key]}`);
    }
  }

  await t.test("pinches from full-image fit around the fingers, including movements batched before a render", () => {
    const v = viewer();
    v.pointer("onPointerDown", 1, 120, 340);
    v.pointer("onPointerDown", 2, 220, 340);
    assert.equal(v.captures.size, 2);
    v.pointer("onPointerMove", 1, 70, 340);
    v.pointer("onPointerMove", 2, 270, 340);
    expectView(v.view(), { x: 30, y: 60, zoom: 2 });
    assert.deepEqual(v.button("Reset to fit full image").props.children, [200, "%"]);

    v.pointer("onPointerMove", 1, 120, 340);
    v.pointer("onPointerMove", 2, 220, 340);
    expectView(v.view(), { x: 0, y: 0, zoom: 1 });
    assert.equal(v.button("Zoom out").props.disabled, true);
  });

  await t.test("lifting either finger continues panning without a jump or a render in between", () => {
    for (const released of [1, 2]) {
      const v = viewer();
      v.pointer("onPointerDown", 1, 120, 340);
      v.pointer("onPointerDown", 2, 220, 340);
      v.pointer("onPointerMove", 1, 70, 340);
      v.pointer("onPointerMove", 2, 270, 340);
      v.pointer("onPointerUp", released, released === 1 ? 70 : 270, 340);
      const remaining = released === 1 ? 2 : 1;
      v.pointer("onPointerMove", remaining, remaining === 1 ? 100 : 300, 380);
      expectView(v.view(), { x: 60, y: 100, zoom: 2 });
      assert.deepEqual([...v.captures], [remaining]);
    }
  });

  await t.test("clamps zoom to 100–400% and reverses immediately after reaching a limit", () => {
    const v = viewer();
    v.pointer("onPointerDown", 1, 180, 400);
    v.pointer("onPointerDown", 2, 220, 400);
    v.pointer("onPointerMove", 1, 100, 400);
    v.pointer("onPointerMove", 2, 500, 400);
    expectView(v.view(), { zoom: 4 });
    assert.equal(v.button("Zoom in").props.disabled, true);
    v.pointer("onPointerMove", 2, 400, 400);
    expectView(v.view(), { zoom: 3 });
    v.pointer("onPointerMove", 2, 110, 400);
    expectView(v.view(), { x: 0, y: 0, zoom: 1 });
    v.pointer("onPointerMove", 2, 120, 400);
    expectView(v.view(), { zoom: 2 });
  });

  await t.test("cancelled or lost pointers stop participating and a new finger can resume zooming", () => {
    for (const handler of ["onPointerCancel", "onLostPointerCapture"]) {
      const v = viewer();
      v.pointer("onPointerDown", 1, 120, 340);
      v.pointer("onPointerDown", 2, 220, 340);
      v.pointer("onPointerMove", 1, 70, 340);
      v.pointer("onPointerMove", 2, 270, 340);
      v.pointer(handler, 2, 270, 340);
      v.pointer("onPointerMove", 2, 1000, 1000);
      v.pointer("onPointerMove", 1, 80, 350);
      expectView(v.view(), { x: 40, y: 70, zoom: 2 });
      v.pointer("onPointerDown", 3, 180, 350);
      v.pointer("onPointerMove", 3, 280, 350);
      expectView(v.view(), { zoom: 4 });
    }
  });

  await t.test("reset and photo navigation clear active gestures and release captured fingers", () => {
    for (const action of ["Reset to fit full image", "Next photo"]) {
      const v = viewer();
      v.pointer("onPointerDown", 1, 120, 340);
      v.pointer("onPointerDown", 2, 220, 340);
      v.pointer("onPointerMove", 2, 320, 340);
      v.button(action).props.onClick(); v.render();
      assert.equal(v.captures.size, 0);
      v.pointer("onPointerMove", 1, 50, 200);
      v.pointer("onPointerMove", 2, 500, 500);
      expectView(v.view(), { x: 0, y: 0, zoom: 1 });
      assert.equal(v.image().props.src, action === "Next photo" ? "/side.jpg" : "/front.jpg");
    }
  });

  await t.test("single-finger and mouse dragging stay within the photo viewer bounds", () => {
    const v = viewer();
    v.pointer("onPointerDown", 1, 120, 340);
    v.pointer("onPointerMove", 1, 220, 440);
    expectView(v.view(), { x: 0, y: 0, zoom: 1 });
    v.pointer("onPointerUp", 1, 220, 440);
    v.button("Zoom in").props.onClick(); v.render();
    v.pointer("onPointerDown", 2, 200, 400, { pointerType: "mouse" });
    v.pointer("onPointerMove", 2, 1200, 1400, { pointerType: "mouse" });
    expectView(v.view(), { x: 90, y: 150, zoom: 1.5 });
    v.pointer("onPointerMove", 2, -1200, -1400, { pointerType: "mouse" });
    expectView(v.view(), { x: -90, y: -150, zoom: 1.5 });
    v.pointer("onPointerUp", 2, -1200, -1400);
    v.pointer("onPointerDown", 3, 200, 400, { button: 2, pointerType: "mouse" });
    assert.equal(v.captures.size, 0);
  });
});
