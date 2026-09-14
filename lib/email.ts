import { config } from "./config";
import { escapeHtml, renderEmailHtml } from "./email-template";
import type { ShippingAddress } from "./types";

export { escapeHtml, renderEmailHtml } from "./email-template";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
};

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
    signal: AbortSignal.timeout(20_000),
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
      html: renderEmailHtml(
        input.subject,
        input.html,
        config.siteUrl,
        config.supportEmail,
      ),
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

export async function sendAuthMagicLinkEmail(input: { email: string; url: string }) {
  return sendEmail({
    to: input.email,
    subject: "Sign in to Model Car Center",
    html: `<h1>Sign in to Model Car Center</h1><p>Use this secure, single-use link to enter My Garage.</p><p><a href="${escapeHtml(input.url)}">Sign in to Model Car Center</a></p><p>This link expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
    text: `Sign in to Model Car Center: ${input.url}\n\nThis single-use link expires in 10 minutes. If you did not request it, ignore this email.`,
  });
}

export async function sendListingReviewEmail(input: {
  email: string;
  title: string;
  productSlug: string;
  approved: boolean;
  reason?: string | null;
  productId: string;
}) {
  const url = input.approved
    ? `${config.siteUrl}/products/${encodeURIComponent(input.productSlug)}`
    : `${config.siteUrl}/sell/model?id=${encodeURIComponent(input.productId)}`;
  const subject = input.approved ? `Listing approved: ${input.title}` : `Listing needs changes: ${input.title}`;
  const detail = input.approved
    ? "Your listing is now live in the marketplace."
    : `Your listing was not approved${input.reason ? `: ${input.reason}` : ". You can edit it and submit it again."}`;
  return sendEmail({
    to: input.email,
    subject,
    html: `<h1>${escapeHtml(subject)}</h1><p>${escapeHtml(detail)}</p><p><a href="${escapeHtml(url)}">${input.approved ? "View listing" : "Edit listing"}</a></p>`,
    text: `${subject}\n\n${detail}\n${url}`,
    idempotencyKey: `listing-review-${input.productId}-${input.approved ? "approved" : "rejected"}-${Date.now()}`,
  });
}

export type EmailOrder = {
  orderNumber: string;
  sellerName: string;
  sellerEmail: string;
  buyerEmail: string;
  currency: string;
  totalCents: number;
  shippingAddress: ShippingAddress;
  items: Array<{
    title: string;
    quantity: number;
    unitPriceCents: number;
    availabilityType?: "in_stock" | "preorder";
    releaseDate?: string | null;
  }>;
};

function orderItemsHtml(order: EmailOrder) {
  return order.items.map((item) => `<li>${escapeHtml(item.title)} × ${item.quantity} — ${escapeHtml(money(item.unitPriceCents * item.quantity, order.currency))}${item.availabilityType === "preorder" && item.releaseDate ? `<br><strong>Preorder · Expected release ${escapeHtml(formatReleaseDate(item.releaseDate))}</strong>` : ""}</li>`).join("");
}

function orderItemsText(order: EmailOrder) {
  return order.items.map((item) => `${item.title} x ${item.quantity} — ${money(item.unitPriceCents * item.quantity, order.currency)}${item.availabilityType === "preorder" && item.releaseDate ? `\nPreorder · Expected release ${formatReleaseDate(item.releaseDate)}` : ""}`).join("\n");
}

function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export async function sendPaidOrderEmails(order: EmailOrder) {
  const address = addressText(order.shippingAddress);
  const hasPreorder = order.items.some(
    (item) => item.availabilityType === "preorder",
  );
  await Promise.allSettled([
    sendEmail({
      to: order.sellerEmail,
      subject: `New paid order ${order.orderNumber}`,
      html: `<h1>New paid order</h1><p>Order <strong>${escapeHtml(order.orderNumber)}</strong> is paid${hasPreorder ? " and includes a preorder. Hold that item until its release date." : " and ready to fulfill."}</p><ul>${orderItemsHtml(order)}</ul><h2>Ship to</h2><pre>${escapeHtml(address)}</pre><p>Total paid: ${escapeHtml(money(order.totalCents, order.currency))}</p><p>Please fulfill on schedule and send tracking to ${escapeHtml(config.supportEmail)}.</p>`,
      text: `New paid order ${order.orderNumber}${hasPreorder ? " includes a preorder. Hold that item until its release date." : " is ready to fulfill."}\n\n${orderItemsText(order)}\n\nShip to:\n${address}\n\nTotal paid: ${money(order.totalCents, order.currency)}\n\nSend tracking to ${config.supportEmail}.`,
      idempotencyKey: `seller-paid-${order.orderNumber}`,
    }),
    sendEmail({
      to: order.buyerEmail,
      subject: `Order confirmation ${order.orderNumber}`,
      html: `<h1>Thanks for your order</h1><p>Your order <strong>${escapeHtml(order.orderNumber)}</strong> from ${escapeHtml(order.sellerName)} is paid.${hasPreorder ? " Preorder items will ship after the expected release date shown below; release dates may change." : ""}</p><ul>${orderItemsHtml(order)}</ul><h2>Shipping address</h2><pre>${escapeHtml(address)}</pre><p>Total: ${escapeHtml(money(order.totalCents, order.currency))}</p><p>Questions? Contact ${escapeHtml(config.supportEmail)}.</p>`,
      text: `Order ${order.orderNumber} from ${order.sellerName} is paid.${hasPreorder ? " Preorder items will ship after the expected release date; release dates may change." : ""}\n\n${orderItemsText(order)}\n\nShipping address:\n${address}\n\nTotal: ${money(order.totalCents, order.currency)}\nQuestions: ${config.supportEmail}`,
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

export async function sendLabelCreatedEmail(input: {
  buyerEmail: string;
  orderNumber: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string | null;
}) {
  const trackingUrl = input.trackingUrl || trackingLink(input.carrier, input.trackingNumber);
  return sendEmail({
    to: input.buyerEmail,
    subject: `Shipping label created for ${input.orderNumber}`,
    html: `<h1>Your order is being prepared</h1><p>${escapeHtml(input.carrier)} tracking has been created: <a href="${escapeHtml(trackingUrl)}">${escapeHtml(input.trackingNumber)}</a>.</p><p>The carrier may show “label created” until it receives the package. Questions? Contact ${escapeHtml(config.supportEmail)}.</p>`,
    text: `A ${input.carrier} shipping label was created for order ${input.orderNumber}. Tracking: ${input.trackingNumber}\n${trackingUrl}\nThe carrier may show “label created” until it receives the package. Questions: ${config.supportEmail}`,
    idempotencyKey: `label-${input.orderNumber}-${input.trackingNumber}`,
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
