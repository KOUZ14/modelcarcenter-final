"use client";

import { useRef, useState } from "react";
import Image from "next/image";

export function StoreLogoUpload({ initialUrl, disabled, onBusy }: { initialUrl: string | null; disabled: boolean; onBusy(busy: boolean): void }) {
  const [url, setUrl] = useState(initialUrl ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  return <div className="seller-logo-upload"><h3>Store logo</h3><div className="seller-logo-preview">{url ? <Image unoptimized src={url} alt="Store logo preview" width={112} height={112}/> : <span>No logo</span>}</div><input type="hidden" name="logoUrl" value={url}/><p>Choose one square JPG, PNG, or WebP, up to 5 MB. The full logo fits within its frame. Location metadata is removed.</p><div className="seller-inline-actions"><label className="button outline small">{busy ? "Uploading…" : url ? "Replace logo" : "Choose logo"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={async event => {
    const input = event.currentTarget, file = input.files?.[0];
    if (!file || pending.current) return;
    setError(""); setBusy(true); onBusy(true); pending.current = true;
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPG, PNG, or WebP up to 5 MB.");
      const bitmap = await createImageBitmap(file), ratio = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      try { const context = canvas.getContext("2d"); if (!context) throw new Error("Image conversion is unavailable."); context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); } finally { bitmap.close(); }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not read the image.")), "image/jpeg", .9));
      const form = new FormData(); form.set("photo", blob, "logo.jpg");
      const response = await fetch("/api/store/logo", { method: "POST", body: form }); const body = await response.json();
      if (!response.ok || typeof body.url !== "string") throw new Error(body.error || "The upload failed. Try again.");
      setUrl(body.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The upload failed."); }
    finally { input.value = ""; setBusy(false); onBusy(false); pending.current = false; }
  }}/></label>{url && <button type="button" className="text-button" disabled={disabled || busy} onClick={() => setUrl("")}>Remove logo</button>}</div><p className="form-note">Save store introduction to apply this change.</p>{error && <p role="alert" className="form-error">{error}</p>}</div>;
}
