import { config } from "./config";
import type { ShippingAddress } from "./types";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

function addressText(shipping: ShippingAddress) {
  const address = shipping.address ?? {};
  return [
    shipping.name,
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
    address.country,
  ].filter(Boolean).join("\n");
}

export async function sendEmail(input: SendEmailInput) {
  if (!config.resendApiKey) {
    console.info(`[email skipped: RESEND_API_KEY unavailable] ${input.subject} -> ${input.to}`);
    return { sent: false as const, reason: "not_configured" as const };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "model-car-center/1.0",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [input.to],
      reply_to: config.supportEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await response.json()) as { id: string };
  return { sent: true as const, id: data.id };
}

export type EmailOrder = {
  orderNumber: string;
  sellerName: string;
  sellerEmail: string;
  buyerEmail: string;
  currency: string;
  totalCents: number;
  shippingAddress: ShippingAddress;
  items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
};

function orderItemsHtml(order: EmailOrder) {
  return order.items.map((item) => `<li>${escapeHtml(item.title)} × ${item.quantity} — ${escapeHtml(money(item.unitPriceCents * item.quantity, order.currency))}</li>`).join("");
}

function orderItemsText(order: EmailOrder) {
  return order.items.map((item) => `${item.title} x ${item.quantity} — ${money(item.unitPriceCents * item.quantity, order.currency)}`).join("\n");
}

export async function sendPaidOrderEmails(order: EmailOrder) {
  const address = addressText(order.shippingAddress);
  await Promise.allSettled([
    sendEmail({
      to: order.sellerEmail,
      subject: `New paid order ${order.orderNumber}`,
      html: `<h1>New paid order</h1><p>Order <strong>${escapeHtml(order.orderNumber)}</strong> is ready to fulfill.</p><ul>${orderItemsHtml(order)}</ul><h2>Ship to</h2><pre>${escapeHtml(address)}</pre><p>Total paid: ${escapeHtml(money(order.totalCents, order.currency))}</p><p>Please fulfill the order and send tracking to ${escapeHtml(config.supportEmail)}.</p>`,
      text: `New paid order ${order.orderNumber}\n\n${orderItemsText(order)}\n\nShip to:\n${address}\n\nTotal paid: ${money(order.totalCents, order.currency)}\n\nSend tracking to ${config.supportEmail}.`,
      idempotencyKey: `seller-paid-${order.orderNumber}`,
    }),
    sendEmail({
      to: order.buyerEmail,
      subject: `Order confirmation ${order.orderNumber}`,
      html: `<h1>Thanks for your order</h1><p>Your order <strong>${escapeHtml(order.orderNumber)}</strong> from ${escapeHtml(order.sellerName)} is paid.</p><ul>${orderItemsHtml(order)}</ul><h2>Shipping address</h2><pre>${escapeHtml(address)}</pre><p>Total: ${escapeHtml(money(order.totalCents, order.currency))}</p><p>Questions? Contact ${escapeHtml(config.supportEmail)}.</p>`,
      text: `Order ${order.orderNumber} from ${order.sellerName} is paid.\n\n${orderItemsText(order)}\n\nShipping address:\n${address}\n\nTotal: ${money(order.totalCents, order.currency)}\nQuestions: ${config.supportEmail}`,
      idempotencyKey: `buyer-paid-${order.orderNumber}`,
    }),
  ]);
}

export async function sendShipmentEmail(input: { buyerEmail: string; orderNumber: string; carrier: string; trackingNumber: string }) {
  const trackingUrl = trackingLink(input.carrier, input.trackingNumber);
  return sendEmail({
    to: input.buyerEmail,
    subject: `Order ${input.orderNumber} has shipped`,
    html: `<h1>Your order has shipped</h1><p>${escapeHtml(input.carrier)} tracking: <a href="${escapeHtml(trackingUrl)}">${escapeHtml(input.trackingNumber)}</a></p><p>Questions? Contact ${escapeHtml(config.supportEmail)}.</p>`,
    text: `Order ${input.orderNumber} has shipped via ${input.carrier}. Tracking: ${input.trackingNumber}\n${trackingUrl}\nQuestions: ${config.supportEmail}`,
    idempotencyKey: `shipped-${input.orderNumber}-${input.trackingNumber}`,
  });
}

export async function sendModelHuntMatchEmail(input: { email: string; referenceCode: string; requestedModel: string; productTitle: string; sellerName: string; priceCents: number; currency: string; productSlug: string }) {
  const url = `${config.siteUrl}/products/${encodeURIComponent(input.productSlug)}`;
  return sendEmail({
    to: input.email,
    subject: `Possible match for ${input.referenceCode}`,
    html: `<h1>We found a possible match</h1><p>You asked us to hunt for ${escapeHtml(input.requestedModel)}.</p><p><strong>${escapeHtml(input.productTitle)}</strong><br>${escapeHtml(input.sellerName)}<br>${escapeHtml(money(input.priceCents, input.currency))}</p><p><a href="${escapeHtml(url)}">View this model</a></p>`,
    text: `We found a possible match for ${input.requestedModel}: ${input.productTitle} from ${input.sellerName}, ${money(input.priceCents, input.currency)}. ${url}`,
    idempotencyKey: `hunt-${input.referenceCode}-${input.productSlug}`,
  });
}

function trackingLink(carrier: string, trackingNumber: string) {
  const encoded = encodeURIComponent(trackingNumber);
  const key = carrier.toLowerCase();
  if (key.includes("ups")) return `https://www.ups.com/track?tracknum=${encoded}`;
  if (key.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
  if (key.includes("usps")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
  if (key.includes("dhl")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encoded}`;
  return `${config.siteUrl}/contact`;
}
