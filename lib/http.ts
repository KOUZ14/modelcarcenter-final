import { ValidationError } from "./validation";
import { CatalogMatchRequired } from "./catalog-product-rules";
import { UploadLimitError } from "./managed-uploads";
import { logSecurityEvent } from "./security-events";

export async function readJsonObject(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError("Request body must be an object.");
  }
  return payload as Record<string, unknown>;
}

export function routeError(error: unknown, fallback = "Unable to complete the request.") {
  if (error instanceof UploadLimitError) return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
  if (error instanceof CatalogMatchRequired) {
    return Response.json({ error: error.message, catalogMatches: error.matches }, { status: 409 });
  }
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message, fields: error.fields }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("UNIQUE constraint failed")) {
    return Response.json({ error: "That record already exists." }, { status: 409 });
  }
  if (message.includes("not configured") || message.includes("Missing required environment variable")) {
    logSecurityEvent("operation_failed", { scope: "route", status: 503, reason: "configuration_unavailable" });
    return Response.json({ error: "This service is temporarily unavailable. Please try again later." }, { status: 503 });
  }
  if (error instanceof Error && error.name === "ShippoApiError") {
    logSecurityEvent("operation_failed", { scope: "shipping", status: 502, reason: "provider_error" });
    return Response.json({ error: "The shipping service could not complete the request. Check the address and try again." }, { status: 502 });
  }
  logSecurityEvent("operation_failed", { scope: "route", status: 500, reason: "unexpected_error" });
  return Response.json({ error: fallback }, { status: 500 });
}
