"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function SignInForm({
  returnTo = "/account",
  initialError = "",
  saveOrder = false,
}: {
  returnTo?: string;
  initialError?: string;
  saveOrder?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">(
    initialError ? "error" : "idle",
  );
  const [message, setMessage] = useState(initialError);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setMessage("");
    const callbackURL =
      returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : "/account";
    const newUserCallbackURL = `${callbackURL}${callbackURL.includes("?") ? "&" : "?"}new=1`;
    const errorParams = new URLSearchParams({ error: "invalid-link", returnTo: callbackURL });
    if (saveOrder) errorParams.set("intent", "save-order");
    const result = await authClient.signIn.magicLink({
      email,
      name: email.split("@")[0] || "Collector",
      callbackURL,
      newUserCallbackURL,
      errorCallbackURL: `/sign-in?${errorParams}`,
    });
    if (result.error) {
      setState("error");
      setMessage(
        result.error.message ||
          "We could not send the sign-in email. Please try again.",
      );
      return;
    }
    setState("sent");
  }
  if (state === "sent")
    return (
      <div className="auth-card" role="status">
        <p className="eyebrow">Check your email</p>
        <h1>Your secure link is on its way.</h1>
        <p>
          We sent a single-use sign-in link to <b>{email}</b>. It expires in 10
          minutes.
        </p>
        <button
          className="text-button"
          type="button"
          onClick={() => setState("idle")}
        >
          Use another email
        </button>
        {returnTo === "/cart" && <Link className="button outline" href="/cart">Continue as guest</Link>}
        {saveOrder && <Link className="text-link" href="/marketplace">Continue browsing</Link>}
      </div>
    );
  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <p className="eyebrow">
        {returnTo.startsWith("/store") ? "Store account" : "Your account"}
      </p>
      <h1>{saveOrder ? "Create your optional account" : "Sign in to Model Car Center"}</h1>
      <p>
        {saveOrder
          ? "Use the same email you used at checkout. After you verify the secure link, your guest orders will appear in My Garage. If you already have an account, the link signs you in."
          : "Use one secure account for shopping and selling. Approved stores should sign in with the contact email on their seller record."}
      </p>
      {saveOrder && <p>Your purchase is complete. This step is optional; tracking emails and support do not require an account.</p>}
      <label htmlFor="sign-in-email">
        Email address
        <input
          id="sign-in-email"
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </label>
      {state === "error" && (
        <p className="form-error" role="alert">
          {message ||
            "This sign-in link is invalid or expired. Request a new one."}
        </p>
      )}
      <button
        className="button dark"
        type="submit"
        disabled={state === "loading" || !email}
      >
        {state === "loading" ? "Sending secure link…" : "Continue"}
      </button>
      <p className="form-note">
        No password needed. By continuing, you agree to the <Link href="/terms">Marketplace Terms</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>. Browsing and guest checkout remain available without an account.
      </p>
      {returnTo === "/cart" && <Link className="button outline" href="/cart">Continue as guest</Link>}
      {saveOrder && <Link className="text-link" href="/marketplace">Skip and continue browsing</Link>}
    </form>
  );
}
