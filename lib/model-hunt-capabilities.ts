import { config } from "./config";

// Match notifications already use the administrator review + email workflow.
// Only expose a boolean; delivery credentials stay on the server.
export function modelHuntEmailEnabled() {
  return Boolean(config.resendApiKey && config.businessLegalName && config.businessMailingAddress);
}
