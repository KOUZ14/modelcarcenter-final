import { ValidationError } from "./validation.ts";

export function requireAdultConsent(value: unknown) {
  if (value !== true && value !== "on") {
    throw new ValidationError("Confirm that you are at least 18 before submitting.", { adultConsent: "Confirmation required" });
  }
}

export function requireMarketingConsent(value: unknown) {
  if (value !== true && value !== "on") {
    throw new ValidationError("Choose whether to receive community emails before subscribing.", { marketingConsent: "Confirmation required" });
  }
}
