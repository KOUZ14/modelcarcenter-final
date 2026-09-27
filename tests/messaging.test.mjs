import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import {
  canAccessConversation,
  cleanMessageBody,
  isUnreadMessage,
  MAX_MESSAGE_LENGTH,
  messagePreview,
} from "../lib/messaging-rules.ts";

test("message bodies are normalized, trimmed, and bounded", () => {
  assert.equal(cleanMessageBody("  Hello\r\ncollector  "), "Hello\ncollector");
  assert.equal(cleanMessageBody("x".repeat(MAX_MESSAGE_LENGTH + 20)).length, MAX_MESSAGE_LENGTH);
  assert.equal(cleanMessageBody(null), "");
  assert.equal(messagePreview("A  product\nquestion"), "A product question");
});

test("only the buyer or seller owner can access a conversation", () => {
  const conversation = {
    buyerUserId: "buyer-1",
    sellerOwnerUserId: "seller-1",
  };
  assert.equal(canAccessConversation("buyer-1", conversation), true);
  assert.equal(canAccessConversation("seller-1", conversation), true);
  assert.equal(canAccessConversation("visitor-1", conversation), false);
});

test("unread tracking ignores the viewer's own messages", () => {
  const base = {
    viewerUserId: "buyer-1",
    createdAt: "2026-08-20T12:00:00.000Z",
    lastReadAt: "2026-08-20T11:00:00.000Z",
  };
  assert.equal(isUnreadMessage({ ...base, senderUserId: "seller-1" }), true);
  assert.equal(isUnreadMessage({ ...base, senderUserId: "buyer-1" }), false);
  assert.equal(
    isUnreadMessage({
      ...base,
      senderUserId: "seller-1",
      lastReadAt: "2026-08-20T13:00:00.000Z",
    }),
    false,
  );
});

test("messaging storage is additive and participant access is server-enforced", async () => {
  const migrations = (await readdir(new URL("../drizzle/", import.meta.url))).filter(
    (name) => name.endsWith(".sql"),
  );
  const contents = await Promise.all(
    migrations.map((name) =>
      readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"),
    ),
  );
  const migration = contents.find((value) =>
    /CREATE TABLE `conversations`/i.test(value),
  );
  assert.ok(migration, "expected a conversations migration");
  assert.match(migration, /CREATE TABLE `conversation_messages`/i);
  assert.match(migration, /conversations_buyer_seller_product_unique/i);
  assert.doesNotMatch(migration, /DROP TABLE/i);

  const [route, messaging] = await Promise.all([
    readFile(new URL("../app/api/messages/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/messaging.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /requireCollectorApi/);
  assert.match(messaging, /requireConversationAccess/);
  assert.match(messaging, /canAccessConversation/);
});
