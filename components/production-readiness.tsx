import type { ReadinessCheck } from "@/lib/production-readiness";

export function ProductionReadiness({ checks, configurationReady }: {
  checks: ReadinessCheck[];
  configurationReady: boolean;
}) {
  return <section className="demand-grid">
    <section>
      <h2>{configurationReady ? "Live configuration checks passed" : "Production setup needs attention"}</h2>
      <p>These checks verify configuration only. Provider activation, webhook delivery, seller onboarding, and a complete live order still need verification.</p>
      <ol>{checks.map((check) => <li key={check.id}>
        <span>{check.label}</span><b>{check.passed ? "Passed" : "Needs setup"}</b>
      </li>)}</ol>
    </section>
    <section>
      <h2>Before accepting real orders</h2>
      <p>In Stripe live mode, verify the platform endpoint at <code>/api/stripe/webhook</code> and the connected-account endpoint at <code>/api/stripe/webhook-connect</code>. Each requires its own signing secret.</p>
      <p>Verify the email sending domain and the Shippo tracking webhook. Onboard real sellers with live Stripe accounts and confirm their ship-from addresses.</p>
      <p>Complete a controlled live purchase, order confirmation, shipment, delivery, payout, and refund. Check the production logs for scheduled transfer processing.</p>
      <a className="text-link" href="/api/health" target="_blank" rel="noreferrer">Open service health</a>
    </section>
  </section>;
}
