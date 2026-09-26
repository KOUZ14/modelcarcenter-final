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
    const found = find(child, match);
    if (found) return found;
  }
}
function text(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return [tree.props?.children].flat(Infinity).map(text).join(" ").replace(/\s+/g, " ").trim();
}
const button = (tree, label) => find(tree, node => node.type === "button" && text(node) === label);
const order = (id, overrides = {}) => ({
  id, orderNumber: `ORDER-${id}`, sellerName: "Model shop", currency: "usd", totalCents: 5000, refundedAmountCents: 0,
  createdAt: "2026-10-01T12:00:00Z", deliveredAt: "2026-10-04T12:00:00Z", reportDeadline: "2026-10-07T12:00:00Z", eligible: true, caseId: null, ...overrides,
});
const request = (id, overrides = {}) => ({
  id, caseNumber: `REQUEST-${id}`, order: order(id), status: "awaiting_seller", viewerRole: "buyer", reason: "damaged", requestedResolution: "return_refund",
  createdAt: "2026-10-05T12:00:00Z", updatedAt: "2026-10-05T12:00:00Z", sellerRespondBy: "2026-10-08T12:00:00Z", buyerEvidenceBy: "2026-10-10T12:00:00Z",
  buyerEscalateBy: "2026-10-11T12:00:00Z", buyerShipBy: "2026-10-15T12:00:00Z", sellerResponseOverdue: false, returnShipmentOverdue: false,
  files: [], messages: [], ...overrides,
});
const data = (cases = [], buyerOrders = []) => ({ cases, buyerOrders, activeCount: cases.filter(item => !["closed", "resolved", "denied"].includes(item.status)).length, buyerCaseCount: cases.filter(item => item.viewerRole === "buyer").length, sellerCaseCount: cases.filter(item => item.viewerRole === "seller").length });

test("order support keeps recovery routes and time-sensitive request actions available", async t => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const scratch = await mkdtemp(join(root, ".sites-runtime/resolution-test-"));
  const bundle = join(scratch, "resolution.mjs");
  globalThis.__resolutionTest = { hooks: null };
  const mocks = {
    react: "export const useState=(...args)=>globalThis.__resolutionTest.hooks.state(...args),useRef=(...args)=>globalThis.__resolutionTest.hooks.ref(...args),useEffect=(...args)=>globalThis.__resolutionTest.hooks.effect(...args);",
    "next/link": "export default 'a';",
    "next/image": "export default 'img';",
  };
  t.after(async () => { delete globalThis.__resolutionTest; await unlink(bundle).catch(() => {}); await rmdir(scratch); });
  const output = await build({ entryPoints: [join(root, "components/resolution-center.tsx")], bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{ name: "resolution-test", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "resolution-mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "resolution-mock" }, ({ path }) => ({ contents: mocks[path] }));
      builder.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: "export default {};", loader: "js" }));
    } }],
  });
  await writeFile(bundle, output.outputFiles[0].contents);
  const { ResolutionCenter } = await import(pathToFileURL(bundle).href);
  function renderer(props) {
    const stores = new Map(), focused = [], effects = [];
    function expand(node, path) {
      if (!node || typeof node !== "object") return node;
      if (typeof node.type === "function") {
        const key = `${path}:${node.type.name}`;
        if (!stores.has(key)) stores.set(key, []);
        const state = stores.get(key); let index = 0;
        globalThis.__resolutionTest.hooks = {
          state(initial) { const slot = index++; if (!(slot in state)) state[slot] = initial; return [state[slot], value => { state[slot] = value; }]; },
          ref(initial) { const slot = index++; if (!(slot in state)) state[slot] = { current: initial }; return state[slot]; },
          effect(callback) { effects.push(callback); },
        };
        return expand(node.type(node.props), key);
      }
      if (node.props?.ref) node.props.ref.current = { focus: () => focused.push(node.props.id), scrollIntoView() {} };
      return { ...node, props: { ...node.props, children: [node.props?.children].flat(Infinity).map((child, i) => expand(child, `${path}.${i}`)) } };
    }
    return { render() { const tree = expand({ type: ResolutionCenter, props }, "root"); effects.splice(0).forEach(callback => callback()); return tree; }, focused };
  }

  await t.test("an empty account offers help first and useful recovery after choosing an order", () => {
    const view = renderer({ data: data() });
    let tree = view.render();
    assert.equal(text(tree).match(/You have no support requests yet\./g)?.length, 1);
    assert.equal(find(tree, node => node.props?.["aria-label"] === "Filter support requests"), undefined);
    assert.equal(find(tree, node => node.type === "details").props.open, undefined);
    button(tree, "Choose an order").props.onClick(); tree = view.render();
    assert.match(text(tree), /We couldn't find an eligible order on this account/);
    assert.equal(find(tree, node => node.type === "a" && text(node) === "Find an order").props.href, "/account?view=orders");
    assert.equal(find(tree, node => node.type === "a" && text(node) === "Contact support").props.href, "/contact");
    assert.doesNotMatch(text(tree), /Browse models|no paid order|Active cases 0/);
    assert.deepEqual(view.focused, ["support-workspace"]);
  });

  await t.test("ineligible orders retain recovery and a route back to existing requests", () => {
    const view = renderer({ data: data([request("existing")], [order("expired", { eligible: false })]) });
    button(view.render(), "Choose an order").props.onClick();
    const tree = view.render();
    assert.match(text(tree), /past its reporting deadline/);
    assert.ok(find(tree, node => node.type === "a" && text(node) === "Find an order"));
    button(tree, "← View your support requests").props.onClick();
    assert.match(text(view.render()), /REQUEST-existing/);
  });

  await t.test("purchase and sale filters select a visible request and retain active deadlines", () => {
    const closed = request("closed", { status: "resolved", resolvedAt: "2026-10-06T12:00:00Z" });
    const buyer = request("buyer");
    const seller = request("seller", { viewerRole: "seller", sellerResponseOverdue: true });
    const view = renderer({ data: data([closed, buyer, seller]) });
    let tree = view.render();
    assert.match(text(find(tree, node => node.props?.className === "case-detail")), /REQUEST-buyer/);
    const list = find(tree, node => node.props?.className === "case-list");
    assert.match(text(list.props.children[0]), /REQUEST-buyer/);
    button(tree, "Sales").props.onClick(); tree = view.render();
    const filtered = text(find(tree, node => node.props?.className === "case-list"));
    assert.match(filtered, /REQUEST-seller.*Reply to the buyer by.*Oct 8, 2026, 12:00 PM UTC.*Deadline passed/);
    assert.doesNotMatch(filtered, /REQUEST-buyer|REQUEST-closed/);
    assert.match(text(find(tree, node => node.props?.className === "case-detail")), /REQUEST-seller/);
    button(tree, "Purchases").props.onClick();
    assert.match(text(find(view.render(), node => node.props?.className === "case-detail")), /REQUEST-buyer/);
    find(view.render(), node => node.type === "button" && text(node).startsWith("REQUEST-closed")).props.onClick();
    assert.match(text(find(view.render(), node => node.props?.className === "case-detail")), /REQUEST-closed/);
    assert.equal(view.focused.at(-1), "support-request-detail");
  });

  await t.test("explicit case links take precedence over the default active request", () => {
    const view = renderer({ data: data([request("active"), request("closed", { status: "closed", resolvedAt: "2026-10-06T12:00:00Z" })]), initialCaseId: "closed" });
    const detail = find(view.render(), node => node.props?.className === "case-detail");
    assert.match(text(detail), /REQUEST-closed.*Request completed/);
    assert.doesNotMatch(text(detail), /Add photos or documents by|Reply to the buyer by/);
    assert.equal(find(detail, node => node.type === "form"), undefined);
  });

  await t.test("an eligible order link selects that order and keeps its exact protection deadline", () => {
    const view = renderer({ data: data([], [order("first"), order("linked", { refundRequestDeadline: "2026-10-09T16:45:00Z" })]), initialOrderId: "linked" });
    const tree = view.render();
    assert.equal(find(tree, node => node.type === "select" && node.props.name === "orderId").props.value, "linked");
    assert.ok(find(tree, node => node.type === "time" && node.props.dateTime === "2026-10-09T16:45:00Z"));
    assert.ok(button(tree, "Send support request"));
  });

  await t.test("return and buyer-response deadlines stay visible before details with role-specific actions", () => {
    for (const viewerRole of ["buyer", "seller"]) {
      const item = request("return", { viewerRole, status: "return_authorized", returnAuthorizationNumber: "RETURN-123", returnShipmentOverdue: true });
      const tree = renderer({ data: data([item]) }).render();
      const detail = find(tree, node => node.props?.className === "case-detail");
      assert.ok(text(detail).indexOf("Oct 15, 2026, 12:00 PM UTC") < text(detail).indexOf("Order total"));
      assert.match(text(find(tree, node => node.props?.className === "case-list")), /Oct 15, 2026, 12:00 PM UTC.*Deadline passed/);
      if (viewerRole === "buyer") assert.equal(button(tree, "Mark return shipped").props.disabled, true);
      else assert.equal(button(tree, "Mark return shipped"), undefined);
    }
    const tree = renderer({ data: data([request("reply", { status: "awaiting_buyer" })]) }).render();
    assert.match(text(tree), /Review the seller’s reply by.*Oct 11, 2026, 12:00 PM UTC/);
    assert.ok(button(tree, "Request a review"));
  });

  await t.test("requests under review show their status without offering a duplicate review", () => {
    const tree = renderer({ data: data([request("review", { status: "under_review" })]) }).render();
    assert.match(text(tree), /Model Car Center is reviewing your request/);
    assert.equal(button(tree, "Request a review"), undefined);
    assert.equal(find(tree, node => node.props?.["aria-label"] === "Filter support requests"), undefined);
  });
});
