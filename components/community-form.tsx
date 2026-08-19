"use client";

import { FormEvent, useState } from "react";
import { Icon } from "./icons";

export function CommunityForm() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("loading");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Signup failed.");
      event.currentTarget.reset(); setState("success");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); setState("error"); }
  }
  if (state === "success") return <div className="joined" role="status"><Icon name="check"/><span>You&apos;re on the list.</span></div>;
  return <form onSubmit={submit}><div className="honeypot" aria-hidden="true"><label>Company website<input name="companyWebsite" tabIndex={-1}/></label></div><label className="sr-only" htmlFor="join-email">Email address</label><input id="join-email" name="email" type="email" required placeholder="Email address"/><button type="submit" disabled={state === "loading"}>{state === "loading" ? "Joining…" : <>Join the community <Icon name="arrow"/></>}</button>{state === "error" && <p className="form-error light-error" role="alert">{message}</p>}</form>;
}
