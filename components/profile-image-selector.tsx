"use client";

import { useRef, useState } from "react";
import type { ProfileImage } from "@/lib/profile-editor";

export function ProfileImageSelector({ kind, value, disabled, onChange, onBusyChange }: {
  kind: "avatar" | "cover"; value: ProfileImage; disabled: boolean;
  onChange(value: ProfileImage): void; onBusyChange(busy: boolean): void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  const label = kind === "avatar" ? "Avatar" : "Cover photo";
  const fieldId = `profile-${kind}`;

  return <div className={`profile-image-selector ${kind}`}>
    <h3>{label}</h3>
    <div className="profile-image-preview">{value ? <img src={value.url} alt={`${label} preview`} width={kind === "avatar" ? 96 : 480} height={kind === "avatar" ? 96 : 128}/> : <span>{kind === "avatar" ? "No avatar" : "No cover photo"}</span>}</div>
    <p id={`${fieldId}-help`}>{kind === "avatar" ? "Choose a square image with your face or model in the center. It appears in a circle." : "Choose a wide image, about 4:1. Keep the subject in the center; the edges may be cropped."}</p>
    <div className="profile-image-actions">
      <label className="profile-image-choose" htmlFor={fieldId}>{busy ? "Uploading…" : value ? `Replace ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}
        <input id={fieldId} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} aria-describedby={`${fieldId}-help ${fieldId}-metadata`} onChange={async event => {
          const input = event.currentTarget, file = input.files?.[0];
          if (!file || pending.current || disabled) return;
          pending.current = true; setBusy(true); onBusyChange(true); setError("");
          try {
            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
            if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image under 10 MB.");
            const bitmap = await createImageBitmap(file);
            const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
            try {
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Image conversion is unavailable. Please try again.");
              context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            } finally { bitmap.close(); }
            const photo = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not read this image.")), "image/jpeg", 0.85));
            const form = new FormData(); form.set("photo", photo, `${kind}.jpg`);
            const response = await fetch("/api/collectors/photos", { method: "POST", body: form });
            const data = await response.json();
            if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again before uploading." : data.error || "The image could not be uploaded. Please try again.");
            if (typeof data.id !== "string" || !data.id) throw new Error("The image could not be uploaded. Please try again.");
            onChange({ id: data.id, url: `/community/media/${encodeURIComponent(data.id)}` });
          } catch (reason) { setError(reason instanceof Error ? reason.message : "The image could not be uploaded. Please try again."); }
          finally { pending.current = false; input.value = ""; setBusy(false); onBusyChange(false); }
        }}/>
      </label>
      {value && <button type="button" className="profile-image-remove" disabled={disabled || busy} onClick={() => { setError(""); onChange(null); }}>Remove {label.toLowerCase()}</button>}
    </div>
    <p id={`${fieldId}-metadata`} className="profile-image-note">One image · JPG, PNG or WebP · up to 10 MB. Location metadata is removed.</p>
    {busy && <p role="status">Uploading {label.toLowerCase()}…</p>}
    {error && <p role="alert" className="form-error">{error} {value && "Your current image is unchanged."}</p>}
  </div>;
}
