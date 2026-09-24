"use client";

import { useEffect, useRef, useState } from "react";
import type { ProfileImage } from "@/lib/profile-editor";
import { defaultPhotoCrop, parsePhotoCrop, type PhotoCrop } from "@/lib/profile-photo";
import { cropProfilePhoto, prepareProfilePhoto, ProfilePhotoCropper, type ProfilePhotoSource } from "./profile-photo-cropper";

export function ProfileImageSelector({ kind, value, disabled, onChange, onBusyChange }: {
  kind: "avatar" | "cover"; value: ProfileImage; disabled: boolean;
  onChange(value: ProfileImage): void; onBusyChange(busy: boolean): void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [source, setSource] = useState<ProfilePhotoSource | null>(null);
  const pending = useRef(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const label = kind === "avatar" ? "Avatar" : "Cover photo";
  const fieldId = `profile-${kind}`;

  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);

  async function openCrop(file?: File) {
    if (pending.current || disabled || source) return;
    setOpener(document.activeElement as HTMLElement | null);
    pending.current = true; setBusy(true); onBusyChange(true); setError("");
    try {
      let photo: Blob;
      let crop: PhotoCrop = defaultPhotoCrop;
      if (file) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
        if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image under 10 MB.");
        photo = file;
      } else {
        if (!value) throw new Error("Choose a photo first.");
        const response = await fetch(value.id ? `/community/media/${encodeURIComponent(value.id)}?original=1` : value.url);
        if (!response.ok) throw new Error("This photo could not be opened. Try again or choose a replacement.");
        photo = await response.blob();
        const metadata = response.headers.get("X-Profile-Crop");
        if (metadata) {
          const saved = parsePhotoCrop(JSON.parse(metadata));
          if (saved?.kind === kind) crop = saved;
        }
      }
      setSource(await prepareProfilePhoto(photo, crop, !file && !!value?.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This photo could not be opened. Choose a replacement and try again.");
      onBusyChange(false);
    } finally { pending.current = false; setBusy(false); }
  }

  async function applyCrop(crop: PhotoCrop) {
    if (!source || pending.current || disabled) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const photo = await cropProfilePhoto(source, kind, crop);
      const form = new FormData();
      form.set("photo", photo, `${kind}.jpg`);
      form.set("original", source.blob, `${kind}-original.jpg`);
      form.set("crop", JSON.stringify({ kind, ...crop }));
      const response = await fetch("/api/collectors/photos", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again before uploading." : data.error || "The image could not be uploaded. Please try again.");
      if (typeof data.id !== "string" || !data.id) throw new Error("The image could not be uploaded. Please try again.");
      onChange({ id: data.id, url: `/community/media/${encodeURIComponent(data.id)}` });
      setSource(null); onBusyChange(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The image could not be uploaded. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <div className={`profile-image-selector ${kind}`}>
    <h3>{label}</h3>
    <div className="profile-image-preview">{value ? <img src={value.url} alt={`${label} preview`} width={kind === "avatar" ? 96 : 480} height={kind === "avatar" ? 96 : 128}/> : <span>{kind === "avatar" ? "No avatar" : "No cover photo"}</span>}</div>
    <p id={`${fieldId}-help`}>{kind === "avatar" ? "Choose a photo, then drag and zoom to frame it in the circle." : "Choose a photo, then drag and zoom to frame it in the cover."}</p>
    <div className="profile-image-actions">
      {value && <button type="button" className="profile-image-reposition" disabled={disabled || busy || !!source} onClick={() => openCrop()}>Reposition {label.toLowerCase()}</button>}
      <label className="profile-image-choose" htmlFor={fieldId}>{busy && !source ? "Opening…" : value ? `Replace ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}
        <input id={fieldId} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy || !!source} aria-describedby={`${fieldId}-help ${fieldId}-metadata`} onChange={async event => {
          const input = event.currentTarget, file = input.files?.[0];
          if (!file) return;
          input.value = "";
          await openCrop(file);
        }}/>
      </label>
      {value && <button type="button" className="profile-image-remove" disabled={disabled || busy || !!source} onClick={() => { setError(""); onChange(null); }}>Remove {label.toLowerCase()}</button>}
    </div>
    <p id={`${fieldId}-metadata`} className="profile-image-note">One image · JPG, PNG or WebP · up to 10 MB. Location metadata is removed.</p>
    {busy && !source && <p role="status">Opening {label.toLowerCase()}…</p>}
    {error && !source && <p role="alert" className="form-error">{error} {value && "Your current image is unchanged."}</p>}
    {source && <ProfilePhotoCropper kind={kind} source={source} busy={busy} error={error} returnFocus={opener} onApply={applyCrop} onCancel={() => { if (pending.current) return; setSource(null); setError(""); onBusyChange(false); }}/>}
  </div>;
}
