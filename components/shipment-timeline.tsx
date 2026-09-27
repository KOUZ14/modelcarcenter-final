import type { ReactNode } from "react";
import { formatMoney, formatUtcDate, formatUtcDateTime } from "@/lib/format";

export type ShipmentTrackingEvent = {
  id: string;
  status: string;
  statusDetails: string;
  statusDate: string;
  location: string;
};

export type ShipmentTimelineData = {
  id: string;
  carrier: string;
  serviceLevel: string;
  currency: string;
  parcelLength: string;
  parcelWidth: string;
  parcelHeight: string;
  parcelWeight: string;
  declaredValueCents: number;
  insuranceRequired: boolean;
  signatureRequired: boolean;
  trackingNumber: string;
  trackingUrl: string | null;
  status: string;
  statusDetails: string;
  eta: string | null;
  combinedOrderIds: string[];
  events: ShipmentTrackingEvent[];
};

export function ShipmentTimeline({
  shipment,
  actions,
  note,
}: {
  shipment: ShipmentTimelineData;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <section className="shipment-details" aria-label="Shipment tracking">
      <header className="shipment-heading">
        <div>
          <p className="eyebrow">Shipment tracking</p>
          <h4>
            {shipment.carrier} {shipment.serviceLevel}
          </h4>
          <p className="shipment-tracking-number">
            {shipment.trackingNumber}
          </p>
        </div>
        <span className={`status ${shipment.status}`}>
          {shipmentStatusLabel(shipment.status)}
        </span>
      </header>

      {shipment.statusDetails && (
        <p className="shipment-status-detail">{shipment.statusDetails}</p>
      )}

      <dl className="shipment-facts">
        <div>
          <dt>Estimated delivery</dt>
          <dd>
            {shipment.eta
              ? formatUtcDate(shipment.eta)
              : "Carrier estimate pending"}
          </dd>
        </div>
        <div>
          <dt>Package state</dt>
          <dd>{shipmentStatusLabel(shipment.status)}</dd>
        </div>
        <div>
          <dt>Insurance</dt>
          <dd>
            {shipment.insuranceRequired
              ? `Insured for ${formatMoney(
                  shipment.declaredValueCents,
                  shipment.currency,
                )}`
              : "No added carrier insurance"}
          </dd>
        </div>
        <div>
          <dt>Signature</dt>
          <dd>
            {shipment.signatureRequired
              ? "Required at delivery"
              : "Not required"}
          </dd>
        </div>
      </dl>

      <p className="shipment-parcel">
        Package: {shipment.parcelLength} × {shipment.parcelWidth} ×{" "}
        {shipment.parcelHeight} in · {shipment.parcelWeight} lb
      </p>

      {shipment.combinedOrderIds.length > 1 && (
        <p className="shipment-combined">
          <b>Combined shipment:</b> {shipment.combinedOrderIds.length} orders
          share this tracking number.
        </p>
      )}

      {(shipment.trackingUrl || actions) && (
        <div className="row-actions">
          {shipment.trackingUrl && (
            <a
              className="button outline small"
              href={shipment.trackingUrl}
              target="_blank"
              rel="noreferrer"
            >
              Carrier tracking
            </a>
          )}
          {actions}
        </div>
      )}

      <div className="tracking-timeline-heading">
        <h4>Tracking timeline</h4>
        {shipment.events.length > 0 && (
          <span>
            {shipment.events.length} update
            {shipment.events.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {shipment.events.length > 0 ? (
        <ol className="tracking-events">
          {shipment.events.map((event) => {
            const location = formatTrackingLocation(event.location);
            return (
              <li key={event.id}>
                <b>{shipmentStatusLabel(event.status)}</b>
                <span>{event.statusDetails || "Carrier update"}</span>
                <small>
                  {formatUtcDateTime(event.statusDate)}
                  {location ? ` · ${location}` : ""}
                </small>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="form-note">
          Carrier updates will appear after the package receives its first scan.
        </p>
      )}
      {note}
    </section>
  );
}

function shipmentStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function formatTrackingLocation(value: string) {
  try {
    const location = JSON.parse(value) as {
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    };
    return [location.city, location.state, location.zip, location.country]
      .filter(Boolean)
      .join(", ");
  } catch {
    return "";
  }
}
