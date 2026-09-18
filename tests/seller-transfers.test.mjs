import assert from "node:assert/strict";
import test from "node:test";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { processEligibleSellerTransfers } from "../lib/seller-transfers.ts";
import { sellerTransferReversalTarget } from "../lib/stripe.ts";

test("seller transfer reversals preserve the platform fee proportionally", () => {
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 10_000,
      refundedAmountCents: 5_000,
      sellerTransferAmountCents: 9_000,
      sellerProceedsCents: 9_000,
    }),
    4_500,
  );
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 10_000,
      refundedAmountCents: 10_000,
      sellerTransferAmountCents: 9_000,
      sellerProceedsCents: 9_000,
    }),
    9_000,
  );
});

test("seller transfer reversal targets are bounded", () => {
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 0,
      refundedAmountCents: 100,
      sellerTransferAmountCents: 90,
      sellerProceedsCents: 90,
    }),
    0,
  );
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 10_000,
      refundedAmountCents: 20_000,
      sellerTransferAmountCents: 9_000,
      sellerProceedsCents: 9_000,
    }),
    9_000,
  );
});

test("refunds issued before release reduce the transfer without being reversed twice", () => {
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 10_000,
      refundedAmountCents: 5_000,
      sellerTransferAmountCents: 4_500,
      sellerProceedsCents: 9_000,
    }),
    0,
  );
  assert.equal(
    sellerTransferReversalTarget({
      totalCents: 10_000,
      refundedAmountCents: 10_000,
      sellerTransferAmountCents: 4_500,
      sellerProceedsCents: 9_000,
    }),
    4_500,
  );
});

test("delivery-gated transfers, case holds, partial refunds, and reversals reconcile in D1", async () => {
  const miniflare = new Miniflare(convertV4MiniflareOptions({
    workers: [
      {
        name: "seller-transfer-test",
        modules: true,
        script: "export default { fetch() { return new Response('ok') } }",
        compatibilityDate: "2026-08-21",
        d1Databases: { DB: `seller-transfer-${crypto.randomUUID()}` },
      },
    ],
  }));
  try {
    const database = await miniflare.getD1Database(
      "DB",
      "seller-transfer-test",
    );
    await database.batch([
      database.prepare(`CREATE TABLE sellers (
        id TEXT PRIMARY KEY,
        stripe_account_id TEXT,
        status TEXT NOT NULL
      )`),
      database.prepare(`CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        stripe_charge_id TEXT,
        stripe_transfer_group TEXT,
        stripe_transfer_id TEXT,
        currency TEXT NOT NULL,
        total_cents INTEGER NOT NULL,
        preorder_deposit_cents INTEGER NOT NULL DEFAULT 0,
        refunded_amount_cents INTEGER NOT NULL,
        seller_proceeds_cents INTEGER NOT NULL,
        seller_transfer_amount_cents INTEGER NOT NULL,
        seller_transfer_reversed_cents INTEGER NOT NULL,
        seller_transfer_status TEXT NOT NULL,
        seller_transfer_processing_at TEXT,
        seller_transfer_last_error TEXT,
        seller_transferred_at TEXT,
        payment_flow TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        fulfillment_status TEXT NOT NULL,
        payout_eligible_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      database.prepare(`CREATE TABLE preorder_refund_requests (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL)`),
      database.prepare(`CREATE TABLE resolution_cases (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        status TEXT NOT NULL
      )`),
      database.prepare(`CREATE TABLE disputes (
        id TEXT PRIMARY KEY,
        order_id TEXT,
        stripe_charge_id TEXT,
        status TEXT NOT NULL
      )`),
    ]);
    await database
      .prepare("INSERT INTO sellers (id, stripe_account_id, status) VALUES (?, ?, 'active')")
      .bind("seller-1", "acct_test",)
      .run();

    const insertOrder = database.prepare(`INSERT INTO orders (
      id, order_number, seller_id, stripe_charge_id, stripe_transfer_group,
      stripe_transfer_id, currency, total_cents, refunded_amount_cents,
      seller_proceeds_cents, seller_transfer_amount_cents,
      seller_transfer_reversed_cents, seller_transfer_status,
      seller_transfer_processing_at, seller_transfer_last_error,
      seller_transferred_at, payment_flow, payment_status,
      fulfillment_status, payout_eligible_at, created_at, updated_at
    ) VALUES (?, ?, 'seller-1', ?, ?, ?, 'usd', 11000, ?, 9900, ?, ?, ?, NULL, NULL, NULL,
      'separate', ?, 'delivered', '2026-08-20T00:00:00.000Z',
      '2026-08-19T00:00:00.000Z', '2026-08-20T00:00:00.000Z')`);
    await database.batch([
      insertOrder.bind(
        "order-full",
        "MCC-FULL",
        "ch_full",
        "MCC_full",
        null,
        0,
        0,
        0,
        "pending",
        "paid",
      ),
      insertOrder.bind(
        "order-partial",
        "MCC-PARTIAL",
        "ch_partial",
        "MCC_partial",
        null,
        5500,
        0,
        0,
        "pending",
        "partially_refunded",
      ),
      insertOrder.bind(
        "order-held",
        "MCC-HELD",
        "ch_held",
        "MCC_held",
        null,
        0,
        0,
        0,
        "pending",
        "paid",
      ),
      insertOrder.bind(
        "order-reversal",
        "MCC-REVERSAL",
        "ch_reversal",
        "MCC_reversal",
        "tr_existing",
        5500,
        9900,
        0,
        "transferred",
        "partially_refunded",
      ),
      insertOrder.bind(
        "order-disputed",
        "MCC-DISPUTED",
        "ch_disputed",
        "MCC_disputed",
        null,
        0,
        0,
        0,
        "pending",
        "paid",
      ),
      database
        .prepare("INSERT INTO resolution_cases (id, order_id, status) VALUES (?, ?, ?)")
        .bind("case-held", "order-held", "under_review"),
      database
        .prepare("INSERT INTO disputes (id, order_id, status) VALUES (?, ?, ?)")
        .bind("dp_open", "order-disputed", "needs_response"),
    ]);

    const created = [];
    const reversed = [];
    const result = await processEligibleSellerTransfers({
      database,
      now: new Date("2026-08-21T00:00:00.000Z"),
      gateway: {
        async create(input) {
          created.push(input);
          return {
            id: `tr_${input.orderId}`,
            amount: input.amountCents,
            amount_reversed: 0,
          };
        },
        async reverse(input) {
          reversed.push(input);
          return { id: `trr_${input.orderId}`, amount: input.amountCents };
        },
      },
    });

    assert.deepEqual(result, {
      considered: 2,
      transferred: 2,
      cancelled: 0,
      failed: 0,
      reversals: 1,
    });
    assert.deepEqual(
      created.map(({ orderId, amountCents }) => ({ orderId, amountCents })),
      [
        { orderId: "order-full", amountCents: 9900 },
        { orderId: "order-partial", amountCents: 4950 },
      ],
    );
    assert.deepEqual(
      reversed.map(({ orderId, amountCents }) => ({ orderId, amountCents })),
      [{ orderId: "order-reversal", amountCents: 4950 }],
    );

    const rows = await database
      .prepare(`SELECT id, seller_transfer_status AS status,
        seller_transfer_amount_cents AS amount,
        seller_transfer_reversed_cents AS reversed
        FROM orders ORDER BY id`)
      .all();
    const byId = new Map(rows.results.map((row) => [row.id, row]));
    assert.deepEqual(byId.get("order-full"), {
      id: "order-full",
      status: "transferred",
      amount: 9900,
      reversed: 0,
    });
    assert.deepEqual(byId.get("order-partial"), {
      id: "order-partial",
      status: "transferred",
      amount: 4950,
      reversed: 0,
    });
    assert.equal(byId.get("order-held").status, "pending");
    assert.deepEqual(byId.get("order-reversal"), {
      id: "order-reversal",
      status: "transferred",
      amount: 9900,
      reversed: 4950,
    });
  } finally {
    await miniflare.dispose();
  }
});
