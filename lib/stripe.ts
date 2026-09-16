import { config, requireConfig } from "./config.ts";
import { assertLiveCheckoutConfigured } from "./production-readiness.ts";
import { sellerProcessingDeduction, sellerProceedsAfterRefund } from "./seller-proceeds.ts";
import { stripeShippingAddress } from "./checkout-address.ts";
import type { NormalizedShippingAddress } from "./shipping-rules.ts";
import type { CheckoutLine } from "./checkout-allocation.ts";
export { sellerProceedsAfterRefund } from "./seller-proceeds.ts";

type StripeError = { error?: { message?: string; type?: string } };

async function stripeRequest<T>(
  path: string,
  init: { method?: string; body?: URLSearchParams; idempotencyKey?: string } = {},
): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    signal: AbortSignal.timeout(20_000),
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${requireConfig("stripeSecretKey")}`,
      "Stripe-Version": config.stripeApiVersion,
      ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body,
  });
  const data = (await response.json()) as T & StripeError;
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe request failed with status ${response.status}.`);
  }
  return data;
}

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  payment_status: string;
  status: string | null;
  payment_intent: string | {
    id: string;
    latest_charge?: string | {
      id: string;
      application_fee_amount?: number | null;
      balance_transaction?: string | {
        id: string;
        fee: number;
        net: number;
      } | null;
    } | null;
  } | null;
  customer_details?: { email?: string | null; name?: string | null; address?: Record<string, string | null> | null } | null;
  shipping_details?: { name?: string | null; address?: Record<string, string | null> | null } | null;
  collected_information?: { shipping_details?: { name?: string | null; address?: Record<string, string | null> | null } | null } | null;
  amount_subtotal?: number | null;
  amount_total?: number | null;
  total_details?: { amount_tax?: number | null; amount_shipping?: number | null } | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
};

export type CheckoutSessionInput = {
  checkoutGroupId?: string;
  reservationId: string;
  sellerId: string;
  sellerStripeAccountId: string;
  items: Array<{ title: string; description: string; imageUrl: string | null; priceCents: number; currency: string; quantity: number; reservationId?: string; shipping?: boolean }>;
  shippingCents: number;
  marketplaceFeeBps: number;
  platformFeeCents: number;
  expiresAt: Date;
  buyerUserId?: string | null;
  buyerEmail?: string | null;
  policyVersion: string;
  deliveryAddress?: NormalizedShippingAddress;
  checkoutCustomerId?: string;
  returnToken?: string;
};

export function stripeTransferGroup(reservationId: string) {
  return `MCC_${reservationId}`;
}

export function buildCheckoutSessionBody(input: CheckoutSessionInput) {
  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${config.siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: input.returnToken ? `${config.siteUrl}/api/checkout/return?reservation_id=${encodeURIComponent(input.reservationId)}` : `${config.siteUrl}/cart?checkout=cancelled`,
    client_reference_id: input.reservationId,
    submit_type: "pay",
    expires_at: String(Math.floor(input.expiresAt.getTime() / 1000)),
    "metadata[reservation_id]": input.reservationId,
    "metadata[seller_id]": input.sellerId,
    "metadata[marketplace_fee_bps]": String(input.marketplaceFeeBps),
    "metadata[policy_version]": input.policyVersion,
    "metadata[policy_accepted_at]": new Date().toISOString(),
    "metadata[payment_flow]": "separate",
    "metadata[processing_fee_payer]": "seller",
    "payment_intent_data[transfer_group]": stripeTransferGroup(input.reservationId),
    "payment_intent_data[metadata][payment_flow]": "separate",
    "payment_intent_data[metadata][processing_fee_payer]": "seller",
    "payment_intent_data[metadata][seller_id]": input.sellerId,
    "payment_intent_data[metadata][seller_stripe_account_id]": input.sellerStripeAccountId,
    "payment_intent_data[metadata][reservation_id]": input.reservationId,
    "automatic_tax[enabled]": config.automaticTax ? "true" : "false",
  });
  if (config.automaticTax) {
    body.set("automatic_tax[liability][type]", "self");
  }
  if (input.buyerUserId) {
    body.set("metadata[buyer_user_id]", input.buyerUserId);
    body.set("payment_intent_data[metadata][buyer_user_id]", input.buyerUserId);
  }
  if (input.returnToken) body.set("metadata[return_token]", input.returnToken);
  if (input.deliveryAddress) {
    if (!input.checkoutCustomerId) throw new Error("Checkout delivery address requires a dedicated Stripe customer.");
    body.set("customer", input.checkoutCustomerId);
    body.set("billing_address_collection", "auto");
    body.set("metadata[delivery_address_source]", "cart");
    const shipping = stripeShippingAddress(input.deliveryAddress);
    body.set("payment_intent_data[shipping][name]", shipping.name);
    for (const [key, value] of Object.entries(shipping.address)) {
      body.set(`payment_intent_data[shipping][address][${key}]`, value);
    }
    // Hosted Checkout cannot re-quote carrier services on address changes.
    // Keep this destination fixed; its Customer.shipping also drives Stripe Tax.
    // https://docs.stripe.com/tax/checkout
    body.set("custom_text[submit][message]", `Delivery to: ${[
      shipping.name, ...Object.values(shipping.address),
    ].filter(Boolean).join(", ").slice(0, 1050)}. To change the delivery address, return to your cart before paying.`);
  } else {
    if (input.buyerEmail) body.set("customer_email", input.buyerEmail);
    config.shippingCountries.forEach((country, index) => {
      body.set(`shipping_address_collection[allowed_countries][${index}]`, country);
    });
  }
  input.items.forEach((item, index) => {
    if (item.reservationId) body.set(`line_items[${index}][price_data][product_data][metadata][reservation_id]`, item.reservationId);
    if (item.shipping) body.set(`line_items[${index}][price_data][product_data][tax_code]`, config.stripeShippingTaxCode);
    body.set(`line_items[${index}][price_data][currency]`, item.currency);
    body.set(`line_items[${index}][price_data][unit_amount]`, String(item.priceCents));
    body.set(`line_items[${index}][price_data][product_data][name]`, item.title);
    body.set(
      `line_items[${index}][price_data][tax_behavior]`,
      config.stripeTaxBehavior,
    );
    if (item.description) body.set(`line_items[${index}][price_data][product_data][description]`, item.description.slice(0, 500));
    if (item.imageUrl?.startsWith("https://")) body.set(`line_items[${index}][price_data][product_data][images][0]`, item.imageUrl);
    body.set(`line_items[${index}][quantity]`, String(item.quantity));
  });
  if (input.shippingCents > 0) {
    const index = input.items.length;
    body.set(`line_items[${index}][price_data][currency]`, input.items[0].currency);
    body.set(`line_items[${index}][price_data][unit_amount]`, String(input.shippingCents));
    body.set(`line_items[${index}][price_data][product_data][name]`, "Seller shipping");
    body.set(
      `line_items[${index}][price_data][product_data][tax_code]`,
      config.stripeShippingTaxCode,
    );
    body.set(
      `line_items[${index}][price_data][tax_behavior]`,
      config.stripeTaxBehavior,
    );
    body.set(`line_items[${index}][quantity]`, "1");
  }
  if (input.checkoutGroupId) {
    body.set("metadata[checkout_group_id]", input.checkoutGroupId);
    body.set("payment_intent_data[metadata][checkout_group_id]", input.checkoutGroupId);
    for (const key of ["metadata[seller_id]", "metadata[marketplace_fee_bps]", "payment_intent_data[metadata][seller_id]", "payment_intent_data[metadata][seller_stripe_account_id]"]) body.delete(key);
  }
  return body;
}

export async function createCheckoutSession(input: CheckoutSessionInput) {
  assertLiveCheckoutConfigured(config);
  let checkoutCustomerId: string | undefined;
  if (input.deliveryAddress) {
    const shipping = stripeShippingAddress(input.deliveryAddress);
    const customerBody = new URLSearchParams({
      name: shipping.name,
      "shipping[name]": shipping.name,
      "metadata[reservation_id]": input.reservationId,
    });
    if (input.buyerEmail) customerBody.set("email", input.buyerEmail);
    for (const [key, value] of Object.entries(shipping.address)) {
      customerBody.set(`shipping[address][${key}]`, value);
    }
    // A customer per reservation prevents another tab/session from changing the
    // tax destination of a payment page that is already open.
    const customer = await stripeRequest<{ id: string }>("/v1/customers", {
      method: "POST", body: customerBody,
      idempotencyKey: `checkout-customer-${input.reservationId}`,
    });
    checkoutCustomerId = customer.id;
  }
  const body = buildCheckoutSessionBody({ ...input, checkoutCustomerId });
  return stripeRequest<StripeCheckoutSession>("/v1/checkout/sessions", {
    method: "POST",
    body,
    idempotencyKey: `checkout-${input.reservationId}`,
  });
}

export async function expireCheckoutSession(sessionId: string) {
  return stripeRequest<StripeCheckoutSession>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {
    method: "POST", body: new URLSearchParams(),
    idempotencyKey: `expire-${sessionId}`,
  });
}

export type StripeAccount = {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted?: boolean;
  requirements?: { currently_due?: string[]; disabled_reason?: string | null };
};

export async function createConnectedAccount(input: { sellerId: string; email: string; storeName: string }) {
  const body = new URLSearchParams({
    country: "US",
    email: input.email,
    "business_profile[name]": input.storeName,
    "metadata[seller_id]": input.sellerId,
    "controller[fees][payer]": "application",
    "controller[losses][payments]": "application",
    "controller[stripe_dashboard][type]": "express",
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
  });
  return stripeRequest<StripeAccount>("/v1/accounts", {
    method: "POST",
    body,
    idempotencyKey: `seller-account-${input.sellerId}`,
  });
}

export async function createAccountOnboardingLink(
  accountId: string,
  returnPath = "/admin?stripe=returned",
  refreshPath = "/admin?stripe=refresh",
) {
  const body = new URLSearchParams({
    account: accountId,
    refresh_url: `${config.siteUrl}${refreshPath}`,
    return_url: `${config.siteUrl}${returnPath}`,
    type: "account_onboarding",
    "collection_options[fields]": "eventually_due",
  });
  return stripeRequest<{ url: string; expires_at: number }>("/v1/account_links", {
    method: "POST",
    body,
  });
}

export async function retrieveStripeAccount(accountId: string) {
  return stripeRequest<StripeAccount>(`/v1/accounts/${encodeURIComponent(accountId)}`);
}

export async function retrieveCheckoutSession(sessionId: string) {
  return stripeRequest<StripeCheckoutSession>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent.latest_charge.balance_transaction`,
  );
}

export async function retrieveCheckoutLines(sessionId: string) {
  const result = await stripeRequest<{ data: CheckoutLine[]; has_more: boolean }>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=100&expand[]=data.price.product`);
  if (result.has_more) throw new Error("Checkout contains more line items than the supported cart limit.");
  return result.data;
}

export async function retrieveChargeRefunds(chargeId: string) {
  type Refund = { id: string; amount: number; status: string; metadata?: Record<string, string> };
  const refunds: Refund[] = [];
  let after = "";
  for (;;) {
    const page = await stripeRequest<{ data: Refund[]; has_more: boolean }>(`/v1/refunds?charge=${encodeURIComponent(chargeId)}&limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`);
    refunds.push(...page.data);
    if (!page.has_more) return refunds;
    if (!page.data.length) throw new Error("Stripe returned an incomplete refund list.");
    after = page.data[page.data.length - 1].id;
  }
}

export function stripeSettlementDetails(
  session: StripeCheckoutSession,
  expectedPlatformFeeCents: number,
  allocation?: { totalCents: number; taxCents: number; paymentProcessingFeeCents: number | null },
) {
  const charge =
    typeof session.payment_intent === "object" && session.payment_intent
      ? session.payment_intent.latest_charge
      : null;
  const expandedCharge =
    charge && typeof charge === "object" ? charge : null;
  if (
    expandedCharge?.application_fee_amount != null &&
    expandedCharge.application_fee_amount !== expectedPlatformFeeCents
  ) {
    throw new Error(
      "Stripe application fee does not match the reserved marketplace fee.",
    );
  }
  const balanceTransaction = expandedCharge?.balance_transaction;
  const paymentProcessingFeeCents = allocation ? allocation.paymentProcessingFeeCents :
    balanceTransaction && typeof balanceTransaction === "object"
      ? balanceTransaction.fee
      : null;
  const taxCents = Math.max(0, allocation?.taxCents ?? session.total_details?.amount_tax ?? 0);
  const totalCents = allocation?.totalCents ?? session.amount_total;
  // Missing metadata identifies checkouts created under the previous fee policy.
  const processingFeePayer = session.metadata?.processing_fee_payer === "seller"
    ? "seller" as const : "platform" as const;
  const deduction = sellerProcessingDeduction({
    processingFeePayer,
    totalCents: totalCents ?? 0,
    taxCents,
    platformFeeCents: expectedPlatformFeeCents,
    paymentProcessingFeeCents,
  });
  const sellerProceedsCents =
    totalCents == null || deduction == null
      ? null
      : Math.max(
          0,
          totalCents - taxCents - expectedPlatformFeeCents - deduction,
        );
  return { processingFeePayer, paymentProcessingFeeCents, sellerProceedsCents };
}

export async function createOrderRefund(input: {
  orderId: string;
  paymentIntentId: string;
  chargeId?: string | null;
  amountCents?: number;
  idempotencyKey?: string;
  paymentFlow?: "destination" | "separate";
  stripeTransferId?: string | null;
  totalCents?: number;
  refundedAmountCents?: number;
  sellerTransferAmountCents?: number;
  sellerTransferReversedCents?: number;
  sellerProceedsCents?: number | null;
}) {
  const refundedAmountCents = input.refundedAmountCents ?? 0;
  const remainingCents = input.totalCents == null ? undefined : input.totalCents - refundedAmountCents;
  const amountCents = input.amountCents ?? remainingCents;
  if (input.paymentFlow === "separate" && (!Number.isSafeInteger(amountCents) || (amountCents ?? 0) < 1 || !Number.isSafeInteger(remainingCents) || amountCents! > remainingCents!)) throw new Error("A seller refund must fit within its remaining order amount.");
  let chargeId = input.chargeId;
  if (!chargeId) {
    const intent = await stripeRequest<{ latest_charge?: string | { id: string } | null }>(
      `/v1/payment_intents/${encodeURIComponent(input.paymentIntentId)}?expand[]=latest_charge`,
    );
    chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
  }
  if (!chargeId) throw new Error("Stripe charge is unavailable for this order.");
  const body = new URLSearchParams({
    charge: chargeId,
    "metadata[order_id]": input.orderId,
  });
  if (input.paymentFlow !== "separate") {
    body.set("reverse_transfer", "true");
    body.set("refund_application_fee", "true");
  }
  if (amountCents != null) body.set("amount", String(amountCents));
  const refund = await stripeRequest<{ id: string; status: string }>("/v1/refunds", {
    method: "POST",
    body,
    // All refund entry points share one key per observed seller balance. Racing
    // admin and seller requests cannot spend the same balance twice on a shared charge.
    idempotencyKey: input.paymentFlow === "separate"
      ? `seller-refund-${input.orderId}-${refundedAmountCents}`
      : input.idempotencyKey ??
      `${input.amountCents == null ? "full" : `partial-${input.amountCents}`}-refund-${input.orderId}`,
  });
  let sellerTransferReversedCents = input.sellerTransferReversedCents ?? 0;
  if (
    input.paymentFlow === "separate" &&
    refund.status === "succeeded" &&
    input.stripeTransferId &&
    input.totalCents &&
    input.sellerTransferAmountCents
  ) {
    const refundedAfter = Math.min(
      input.totalCents,
      (input.refundedAmountCents ?? 0) +
        (input.amountCents ?? input.totalCents - (input.refundedAmountCents ?? 0)),
    );
    const targetReversedCents = sellerTransferReversalTarget({
      totalCents: input.totalCents,
      refundedAmountCents: refundedAfter,
      sellerTransferAmountCents: input.sellerTransferAmountCents,
      sellerProceedsCents:
        input.sellerProceedsCents ?? input.sellerTransferAmountCents,
    });
    const amountToReverse = Math.max(
      0,
      targetReversedCents - sellerTransferReversedCents,
    );
    if (amountToReverse > 0) {
      await reverseSellerTransfer({
        transferId: input.stripeTransferId,
        orderId: input.orderId,
        amountCents: amountToReverse,
        targetReversedCents,
      });
      sellerTransferReversedCents = targetReversedCents;
    }
  }
  return { ...refund, sellerTransferReversedCents };
}

export async function createFullRefund(input: {
  orderId: string;
  paymentIntentId: string;
  chargeId?: string | null;
  paymentFlow?: "destination" | "separate";
  stripeTransferId?: string | null;
  totalCents?: number;
  refundedAmountCents?: number;
  sellerTransferAmountCents?: number;
  sellerTransferReversedCents?: number;
  sellerProceedsCents?: number | null;
}) {
  return createOrderRefund(input);
}

export function sellerTransferReversalTarget(input: {
  totalCents: number;
  refundedAmountCents: number;
  sellerTransferAmountCents: number;
  sellerProceedsCents?: number;
}) {
  if (input.totalCents < 1 || input.sellerTransferAmountCents < 1) return 0;
  const netSellerProceeds = sellerProceedsAfterRefund({
    totalCents: input.totalCents,
    refundedAmountCents: input.refundedAmountCents,
    sellerProceedsCents:
      input.sellerProceedsCents ?? input.sellerTransferAmountCents,
  });
  return Math.min(
    input.sellerTransferAmountCents,
    Math.max(0, input.sellerTransferAmountCents - netSellerProceeds),
  );
}

export async function createSellerTransfer(input: {
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerStripeAccountId: string;
  chargeId: string;
  transferGroup: string;
  amountCents: number;
  currency: string;
}) {
  const body = new URLSearchParams({
    amount: String(input.amountCents),
    currency: input.currency.toLowerCase(),
    destination: input.sellerStripeAccountId,
    source_transaction: input.chargeId,
    transfer_group: input.transferGroup,
    "metadata[order_id]": input.orderId,
    "metadata[order_number]": input.orderNumber,
    "metadata[seller_id]": input.sellerId,
  });
  return stripeRequest<{ id: string; amount: number; amount_reversed: number }>(
    "/v1/transfers",
    {
      method: "POST",
      body,
      idempotencyKey: `seller-transfer-${input.orderId}`,
    },
  );
}

export async function reverseSellerTransfer(input: {
  transferId: string;
  orderId: string;
  amountCents: number;
  targetReversedCents: number;
}) {
  const body = new URLSearchParams({
    amount: String(input.amountCents),
    "metadata[order_id]": input.orderId,
  });
  return stripeRequest<{ id: string; amount: number }>(
    `/v1/transfers/${encodeURIComponent(input.transferId)}/reversals`,
    {
      method: "POST",
      body,
      idempotencyKey: `seller-transfer-reversal-${input.orderId}-${input.targetReversedCents}`,
    },
  );
}

export async function verifyStripeWebhook(rawBody: string, signatureHeader: string, secret = config.stripeWebhookSecret) {
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = Number(parts.find((part) => part.startsWith("t="))?.slice(2));
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!Number.isFinite(timestamp) || !signatures.length) throw new Error("Invalid Stripe-Signature header.");
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) throw new Error("Stripe signature timestamp is outside tolerance.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (!signatures.some((signature) => constantTimeEqual(expected, signature))) throw new Error("Stripe webhook signature verification failed.");
  return JSON.parse(rawBody) as {
    id: string;
    type: string;
    livemode: boolean;
    data: { object: Record<string, unknown> };
  };
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}
