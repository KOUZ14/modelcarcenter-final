"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { communityRequest } from "./community-ui";

export function CollectionWishlistButton({ catalogId, initialSaved, signedIn, returnTo }: {
  catalogId: string; initialSaved: boolean; signedIn: boolean; returnTo: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const router = useRouter();

  async function toggle() {
    if (pending.current) return;
    if (!signedIn) { router.push(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`); return; }
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await communityRequest({ action: "wishlist", catalogId, enabled: !saved });
      setSaved(!saved);
      setNotice(saved ? "Removed from models you’re looking for." : "Added to models you’re looking for.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your wishlist could not be updated. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <div className="piece-wishlist">
    <button type="button" className="button dark" aria-pressed={saved} disabled={busy} onClick={() => void toggle()}>
      {busy ? "Saving…" : saved ? "Remove model from wishlist" : "Add model to wishlist"}
    </button>
    <p>{saved ? "On your wishlist under “Models I’m looking for.”" : "Saves this release to “Models I’m looking for” in your wishlist."}</p>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}
