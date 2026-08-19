"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm({
  returnTo = "/account",
  initialError = "",
}: {
  returnTo?: string;
  initialError?: string;
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
    const result = await authClient.signIn.magicLink({
      email,
      name: email.split("@")[0] || "Collector",
      callbackURL,
      newUserCallbackURL: "/account?new=1",
      errorCallbackURL: "/sign-in?error=invalid-link",
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
      </div>
    );
  return (
    <form className="auth-card" onSubmit={submit} noValidate>
      <p className="eyebrow">Collector account</p>
      <h1>Sign in to Model Car Center</h1>
      <p>
        Keep your orders, wishlist, Model Hunts, listings, and sales in one My
        Garage account.
      </p>
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
        No password needed. Browsing and guest checkout remain available without
        an account.
      </p>
    </form>
  );
}
