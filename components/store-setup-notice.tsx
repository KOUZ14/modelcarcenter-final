import Link from "next/link";
import type { StoreData } from "./store-dashboard";

export function StoreSetupNotice({ setup, storeStatus }: { setup: StoreData["setup"]; storeStatus: string }) {
  if (setup.readyToPublish) return null;
  return <aside className="store-setup-notice"><strong>Before your items can go on sale</strong><p>You can save drafts while completing these tasks.</p><ul>
    {setup.steps.filter(step => !step.complete && step.id !== "inventory").map(step => <li key={step.id}><Link href={step.href} target="_blank" rel="noopener noreferrer">{step.title} ↗</Link></li>)}
    {!setup.termsAccepted && <li><Link href="/store?view=settings&filter=terms#seller-terms" target="_blank" rel="noopener noreferrer">Accept Seller Terms ↗</Link></li>}
    {storeStatus !== "active" && <li><Link href="/store?view=payments" target="_blank" rel="noopener noreferrer">{storeStatus === "suspended" ? "Contact support about your store" : "Check store approval"} ↗</Link></li>}
  </ul><p>Setup opens in a new tab so your edits stay here. Save your draft after completing setup to refresh this checklist.</p></aside>;
}
