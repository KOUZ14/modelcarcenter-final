import { readFile } from "node:fs/promises";

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const value = line.slice(separator + 1).trim();
        return [
          line.slice(0, separator).trim(),
          value.replace(/^(['"])(.*)\1$/, "$2"),
        ];
      }),
  );
}

const accountId = process.argv[2];
if (!accountId?.startsWith("acct_")) {
  throw new Error("Pass the test connected-account ID as the first argument.");
}

const localEnv = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const secretKey = localEnv.STRIPE_SECRET_KEY;
if (!secretKey?.startsWith("sk_test_")) {
  throw new Error("Refusing to run: .env.local must contain a Stripe test-mode secret key.");
}

const apiVersion = localEnv.STRIPE_API_VERSION || "2025-02-24.acacia";
async function stripe(path, init = {}) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": apiVersion,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe ${path} failed (${response.status}): ${body.error?.message || "unknown error"}`);
  }
  return body;
}

function form(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) params.append(key, String(value));
  return params;
}

const account = await stripe(`/accounts/${accountId}`);
if (!account.charges_enabled || !account.payouts_enabled) {
  throw new Error("The connected account is not ready for both charges and payouts in this Stripe test environment.");
}

const proofId = `mcc_release_${Date.now()}`;
let paymentIntent;
let transfer;
let reversal;
let reversedTransfer;
let refund;
try {
  paymentIntent = await stripe("/payment_intents", {
    method: "POST",
    body: form({
      amount: 11325,
      currency: "usd",
      payment_method: "pm_card_visa",
      "payment_method_types[]": "card",
      confirm: "true",
      description: "Model Car Center release verification (test mode)",
      transfer_group: proofId,
      "metadata[purpose]": "release_verification",
    }),
  });
  if (paymentIntent.status !== "succeeded" || !paymentIntent.latest_charge) {
    throw new Error(`The test PaymentIntent did not succeed (status: ${paymentIntent.status}).`);
  }

  transfer = await stripe("/transfers", {
    method: "POST",
    body: form({
      amount: 9800,
      currency: "usd",
      destination: accountId,
      source_transaction: paymentIntent.latest_charge,
      transfer_group: proofId,
      description: "Model Car Center seller settlement verification (test mode)",
      "metadata[purpose]": "release_verification",
    }),
  });
  reversal = await stripe(`/transfers/${transfer.id}/reversals`, {
    method: "POST",
    body: form({ amount: 9800, "metadata[purpose]": "release_verification" }),
  });
  reversedTransfer = await stripe(`/transfers/${transfer.id}`);
  refund = await stripe("/refunds", {
    method: "POST",
    body: form({ payment_intent: paymentIntent.id, reason: "requested_by_customer" }),
  });
} catch (error) {
  if (paymentIntent && !refund) {
    try {
      refund = await stripe("/refunds", {
        method: "POST",
        body: form({ payment_intent: paymentIntent.id, reason: "requested_by_customer" }),
      });
    } catch {
      // Preserve the original failure; test-mode cleanup can be inspected by ID.
    }
  }
  throw error;
}

console.log(JSON.stringify({
  mode: account.livemode ? "live" : "test",
  account: { id: account.id, chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled },
  charge: { id: paymentIntent.latest_charge, amount: paymentIntent.amount, status: paymentIntent.status },
  transfer: { id: transfer.id, amount: transfer.amount, reversed: reversedTransfer.reversed, amountReversed: reversedTransfer.amount_reversed },
  reversal: { id: reversal.id, amount: reversal.amount },
  refund: { id: refund.id, amount: refund.amount, status: refund.status },
}, null, 2));
