import type { ReadinessCheck } from "@/lib/production-readiness";

const remedies: Record<string, string> = {
  live_mode: "Set marketplace mode to live in the deployment after completing the operational checks.",
  public_origin: "Set the public HTTPS site origin for this deployment.",
  auth_secret: "Configure a non-placeholder authentication secret of at least 32 characters.",
  stripe_live_key: "Configure the platform's live Stripe API key.",
  stripe_platform_webhook: "Configure the signing secret for the platform payment webhook.",
  stripe_connect_webhook: "Configure a separate signing secret for the Connect webhook.",
  shippo_live_key: "Configure a live Shippo API key.",
  shippo_webhook: "Configure the shipping webhook secret, distinct from the API key.",
  email_key: "Configure the transactional email provider credential.",
  email_sender: "Set the verified sender and support addresses.",
  admin_allowlist: "Add the founder's email to the deployment admin allowlist.",
  admin_bypass: "Disable the development admin bypass.",
};

export function ProductionReadiness({ checks, configurationReady, checkedAt }: {
  checks: ReadinessCheck[];
  configurationReady: boolean;
  checkedAt?: string;
}) {
  return <section className="demand-grid">
    <section>
      <h2>{configurationReady ? "Live configuration checks passed" : "Production setup needs attention"}</h2>
      <p>These checks verify configuration only. Provider activation, webhook delivery, seller onboarding, and a complete live order still need verification.</p>
      <p>Checked: {checkedAt ? new Date(checkedAt).toLocaleString() : "Not recorded"}. Results apply to this environment only.</p>
      <ol>{checks.map((check) => <li key={check.id}>
        <span>{check.label}<br/><small>{check.passed ? "Configuration evidence present; live operation unverified." : remedies[check.id] || "Review this deployment's configuration."}</small></span><b>{check.passed ? "Configured" : "Needs setup"}</b>
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
