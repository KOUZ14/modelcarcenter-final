import type { ShippoTracking, ShippoTrackingEvent } from "./shippo";

// Only carrier timestamps are evidence. Receipt time and label creation cannot
// establish when a package entered the carrier network.
export function trackingEvidence(tracking: ShippoTracking, now = new Date()) {
  const history = [...(tracking.tracking_history ?? [])];
  if (tracking.tracking_status) history.push(tracking.tracking_status);
  const events = history.flatMap(event => {
    const at = event.status_date ? Date.parse(event.status_date) : NaN;
    return Number.isFinite(at) && at <= now.getTime()
      ? [{ ...event, status: String(event.status ?? "UNKNOWN").toUpperCase(), status_date: new Date(at).toISOString() }]
      : [];
  }).sort((a, b) => Date.parse(a.status_date) - Date.parse(b.status_date));
  const dispatched = events.find(event => isDispatchScan(event));
  const delivered = events.find(event => event.status === "DELIVERED");
  return {
    events,
    latest: events.at(-1),
    shippedAt: dispatched?.status_date ?? null,
    deliveredAt: delivered?.status_date ?? null,
    hasUndatedDispatch: history.some(event => isDispatchScan(event) &&
      (!event.status_date || !Number.isFinite(Date.parse(event.status_date)) || Date.parse(event.status_date) > now.getTime())),
  };
}

function isDispatchScan(event: ShippoTrackingEvent) {
  return ["TRANSIT", "DELIVERED"].includes(String(event.status).toUpperCase());
}
