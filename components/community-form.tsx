"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AdultConsent } from "./adult-consent";
import { Icon } from "./icons";

export function CommunityForm() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setState("loading");
    try {
      const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || "Signup failed.");
      formElement.reset();
      setMessage(data.message || "You're on the list.");
      setState("success");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); setState("error"); }
  }
  if (state === "success") return <div className="joined" role="status"><Icon name="check"/><span><strong>{message}</strong><small>We&apos;ll email you when there&apos;s something worth sharing.</small></span></div>;
  return <form onSubmit={submit} aria-busy={state === "loading"}><div className="honeypot" aria-hidden="true"><label>Company website<input name="companyWebsite" tabIndex={-1}/></label></div><label className="sr-only" htmlFor="join-email">Email address</label><input id="join-email" name="email" type="email" inputMode="email" autoComplete="email" required placeholder="you@example.com"/><button type="submit" disabled={state === "loading"}>{state === "loading" ? "Joining…" : <>Join the community <Icon name="arrow"/></>}</button><AdultConsent/><label className="consent-check"><input name="marketingConsent" type="checkbox" required/><span>I want to receive Model Car Center community updates by email.</span></label><p className="collection-notice">Community updates are optional and are not required to shop. Unsubscribe anytime. See our <Link href="/privacy">Privacy Policy</Link>.</p>{state === "error" && <p className="form-error light-error" role="alert">{message}</p>}</form>;
}
