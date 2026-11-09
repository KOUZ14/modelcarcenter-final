import { config } from "./config";
import { highValueShippingRules } from "./shipping-rules";
import { ValidationError } from "./validation";

export function assertExternalShippingAllowed(valueCents: number) {
  const rules = highValueShippingRules(valueCents, config.shippoInsuranceThresholdCents, config.shippoSignatureThresholdCents);
  if (rules.insuranceRequired || rules.signatureRequired) throw new ValidationError("This order requires an insured MCC shipping label, with signature service when required. Purchase the label through Shipping.");
}
