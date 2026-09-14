import { getD1 } from "@/db";
import { config } from "@/lib/config";
import { productionReadiness } from "@/lib/production-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = productionReadiness(config);
  let databaseAvailable = false;
  try {
    // Check required commerce tables as well as database connectivity.
    await getD1().prepare("SELECT (SELECT 1 FROM sellers LIMIT 1) AS sellers, (SELECT 1 FROM stripe_events LIMIT 1) AS events, (SELECT 1 FROM checkout_reservations LIMIT 1) AS reservations").first();
    databaseAvailable = true;
  } catch {
    console.error("Production health check: database unavailable");
  }
  const healthy = databaseAvailable && (config.marketplaceMode === "test" || readiness.configurationReady);
  if (!readiness.configurationReady) {
    console.warn("Production configuration requires attention", {
      failedChecks: readiness.checks.filter((check) => !check.passed).map((check) => check.id),
    });
  }
  return Response.json({
    status: healthy ? "ok" : "degraded",
    marketplaceMode: config.marketplaceMode,
    liveCheckoutConfigured: databaseAvailable && readiness.configurationReady,
  }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
