import { config } from "./config";

export function adminEnvironment() {
  const local = process.env.NODE_ENV !== "production";
  const payments = /^(sk|rk)_live_/.test(config.stripeSecretKey) ? "Live payments" : /^(sk|rk)_test_/.test(config.stripeSecretKey) ? "Test payments" : "Payments unconfigured";
  return `${local ? "Local" : config.marketplaceMode === "live" ? "Live environment" : "Test environment"} · ${payments}`;
}
