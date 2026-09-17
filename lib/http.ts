import { ValidationError } from "./validation";
import { CatalogMatchRequired } from "./catalog-product-rules";

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
    return Response.json({ error: message }, { status: 503 });
  }
  if (error instanceof Error && error.name === "ShippoApiError") {
    return Response.json({ error: error.message }, { status: 502 });
  }
  console.error(error);
  return Response.json({ error: fallback }, { status: 500 });
}
