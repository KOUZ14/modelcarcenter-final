import { config, requireConfig } from "./config";
import type { NormalizedShippingAddress, ParcelInput } from "./shipping-rules";

const SHIPPO_API = "https://api.goshippo.com";

export type ShippoRate = {
  id: string;
  provider: string;
  serviceLevel: string;
  serviceToken: string;
  amountCents: number;
  currency: string;
  estimatedDays: number | null;
  durationTerms: string;
  arrivesBy: string | null;
};

type ShippoRateResponse = {
  object_id?: string;
  provider?: string;
  amount?: string;
  currency?: string;
  estimated_days?: number | null;
  duration_terms?: string;
  arrives_by?: string | null;
  servicelevel?: { name?: string; token?: string };
};

type ShippoShipmentResponse = {
  object_id?: string;
  status?: string;
  rates?: ShippoRateResponse[];
  messages?: Array<{ text?: string; code?: string; source?: string }>;
};

export type ShippoTransaction = {
  object_id?: string;
  status?: string;
  object_state?: string;
  label_url?: string;
  label_file_type?: string;
  tracking_number?: string;
  tracking_url_provider?: string;
  tracking_status?: string;
  eta?: string | null;
  messages?: Array<{ text?: string; code?: string; source?: string }>;
  rate?: ShippoRateResponse | string;
};

export type ShippoTrackingEvent = {
  object_id?: string;
  status?: string;
  status_details?: string;
  status_date?: string;
  location?: { city?: string; state?: string; zip?: string; country?: string };
  substatus?: { code?: string; text?: string; action_required?: boolean };
};

export type ShippoTracking = {
  carrier?: string;
  tracking_number?: string;
  eta?: string | null;
  metadata?: string;
  tracking_status?: ShippoTrackingEvent;
  tracking_history?: ShippoTrackingEvent[];
  transaction?: string;
};

export class ShippoApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShippoApiError";
  }
}

export async function createShippoShipment(input: {
  from: {
    name: string;
    company: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone: string;
    email: string;
  };
  to: NormalizedShippingAddress & { email: string };
  parcel: ParcelInput;
  metadata: string;
  insuranceAmountCents: number;
  signatureRequired: boolean;
}) {
  const extra: Record<string, unknown> = {};
  if (input.insuranceAmountCents > 0) {
    extra.insurance = {
      amount: centsToDecimal(input.insuranceAmountCents),
      currency: "USD",
      content: "Collectible model cars",
    };
  }
  if (input.signatureRequired) extra.signature_confirmation = "STANDARD";

  const shipment = await shippoRequest<ShippoShipmentResponse>("/shipments/", {
    method: "POST",
    body: JSON.stringify({
      address_from: {
        ...input.from,
        is_residential: false,
        validate: true,
      },
      address_to: {
        ...input.to,
        is_residential: true,
        validate: true,
      },
      parcels: [
        {
          length: input.parcel.length,
          width: input.parcel.width,
          height: input.parcel.height,
          distance_unit: "in",
          weight: input.parcel.weight,
          mass_unit: "lb",
        },
      ],
      ...(Object.keys(extra).length ? { extra } : {}),
      metadata: input.metadata.slice(0, 100),
      async: false,
    }),
  });
  if (!shipment.object_id)
    throw new ShippoApiError(messageFromShippo(shipment, "Shippo did not create a shipment."));
  const rates = (shipment.rates ?? [])
    .map(normalizeRate)
    .filter((rate): rate is ShippoRate => Boolean(rate))
    .sort((left, right) => left.amountCents - right.amountCents);
  if (!rates.length)
    throw new ShippoApiError(messageFromShippo(shipment, "No carrier rates are available for this package and address."));
  return { shippoShipmentId: shipment.object_id, rates };
}

export async function purchaseShippoLabel(rateId: string, metadata: string) {
  return shippoRequest<ShippoTransaction>("/transactions/", {
    method: "POST",
    body: JSON.stringify({
      rate: rateId,
      async: false,
      label_file_type: "PDF_4x6",
      metadata: metadata.slice(0, 100),
    }),
  });
}

export async function retrieveShippoTransaction(transactionId: string) {
  return shippoRequest<ShippoTransaction>(
    `/transactions/${encodeURIComponent(transactionId)}`,
  );
}

export async function retrieveShippoTracking(
  carrier: string,
  trackingNumber: string,
) {
  return shippoRequest<ShippoTracking>(
    `/tracks/${encodeURIComponent(carrier.toLowerCase())}/${encodeURIComponent(trackingNumber)}`,
  );
}

export async function registerShippoTracking(
  carrier: string,
  trackingNumber: string,
  metadata: string,
) {
  return shippoRequest<ShippoTracking>("/tracks/", {
    method: "POST",
    body: JSON.stringify({
      carrier: carrier.trim().toLowerCase(),
      tracking_number: trackingNumber.trim(),
      metadata: metadata.slice(0, 100),
    }),
  });
}

function normalizeRate(rate: ShippoRateResponse): ShippoRate | null {
  const amount = Number(rate.amount);
  if (!rate.object_id || !Number.isFinite(amount) || amount < 0) return null;
  return {
    id: rate.object_id,
    provider: rate.provider?.trim() || "Carrier",
    serviceLevel: rate.servicelevel?.name?.trim() || "Service",
    serviceToken: rate.servicelevel?.token?.trim() || "",
    amountCents: Math.round(amount * 100),
    currency: rate.currency?.trim().toUpperCase() || "USD",
    estimatedDays:
      Number.isInteger(rate.estimated_days) && Number(rate.estimated_days) >= 0
        ? Number(rate.estimated_days)
        : null,
    durationTerms: rate.duration_terms?.trim() || "",
    arrivesBy: rate.arrives_by ?? null,
  };
}

async function shippoRequest<T>(path: string, init: RequestInit = {}) {
  const token = requireConfig("shippoApiKey");
  let response: Response;
  try {
    response = await fetch(`${SHIPPO_API}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(20_000),
      headers: {
        Authorization: `ShippoToken ${token}`,
        "Content-Type": "application/json",
        "SHIPPO-API-VERSION": config.shippoApiVersion,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ShippoApiError("Shippo is temporarily unreachable. Try again shortly.");
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new ShippoApiError(messageFromShippo(data, `Shippo request failed (${response.status}).`));
  return data as T;
}

function messageFromShippo(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const object = value as {
    detail?: unknown;
    messages?: Array<{ text?: unknown }>;
  };
  if (typeof object.detail === "string" && object.detail.trim())
    return `Shippo: ${object.detail.trim().slice(0, 400)}`;
  const messages = (object.messages ?? [])
    .map((message) => (typeof message.text === "string" ? message.text.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
  return messages.length ? `Shippo: ${messages.join(" ").slice(0, 400)}` : fallback;
}

function centsToDecimal(cents: number) {
  return (Math.max(0, Math.trunc(cents)) / 100).toFixed(2);
}
