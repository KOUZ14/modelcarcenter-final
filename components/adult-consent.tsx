import Link from "next/link";

export function AdultConsent() {
  return <label className="consent-check adult-consent"><input type="checkbox" name="adultConsent" required/><span>I am at least 18 years old. I agree to the <Link href="/terms">Marketplace Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.</span></label>;
}
