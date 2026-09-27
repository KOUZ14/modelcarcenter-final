import Link from "next/link";
export const dynamic = "force-dynamic";
export default function AccessDenied() { return <main id="main-content" tabIndex={-1} className="access-denied"><p className="eyebrow">Admin access</p><h1>This account is not authorized.</h1><p>Ask the founder to add your signed-in email to ADMIN_EMAILS, then sign in again.</p><div><a className="button dark" href="/signout-with-chatgpt?return_to=/admin">Use another account</a><Link className="button outline" href="/">Return home</Link></div></main>; }
