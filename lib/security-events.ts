type SecurityEvent =
  | "request_rejected"
  | "rate_limited"
  | "security_control_unavailable"
  | "access_denied"
  | "admin_mutation"
  | "auth_result"
  | "magic_link_requested"
  | "magic_link_delivery_failed"
  | "webhook_rejected";

// Deliberately exclude bodies, URLs/queries, cookies, headers, email addresses,
// tokens, and upstream exception messages from security telemetry.
export function logSecurityEvent(
  event: SecurityEvent,
  details: { scope?: string; status?: number; reason?: string } = {},
) {
  console.info(JSON.stringify({
    type: "security",
    event,
    at: new Date().toISOString(),
    ...(details.scope ? { scope: details.scope.slice(0, 80) } : {}),
    ...(details.status ? { status: details.status } : {}),
    ...(details.reason ? { reason: details.reason.slice(0, 80) } : {}),
  }));
}
