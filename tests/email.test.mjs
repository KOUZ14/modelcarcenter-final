import assert from "node:assert/strict";
import test from "node:test";
import { renderEmailHtml } from "../lib/email-template.ts";

test("notification emails use the shared Model Car Center design", () => {
  const html = renderEmailHtml(
    "Order <MCC-1001>",
    '<h1>Your order is ready</h1><p><a href="https://example.com/order">View order</a></p>',
  );

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /MODEL CAR/);
  assert.match(html, /Marketplace update/);
  assert.match(html, /#d5001c/);
  assert.match(html, /Your order is ready/);
  assert.match(html, /support@modelcarcenter\.com/);
  assert.match(html, /Order &lt;MCC-1001&gt;/);
  assert.doesNotMatch(html, /<title>Order <MCC-1001><\/title>/);
});
