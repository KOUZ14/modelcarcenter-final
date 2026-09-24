"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { defaultPhotoCrop, movePhotoCrop, photoCropRect, type PhotoCrop, type ProfilePhotoKind } from "@/lib/profile-photo";

export type ProfilePhotoSource = { blob: Blob; url: string; width: number; height: number; crop: PhotoCrop };

export async function encodePhoto(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not read this image. Please choose another photo.")), "image/jpeg", 0.9));
}

export async function prepareProfilePhoto(blob: Blob, crop: PhotoCrop = defaultPhotoCrop, preserveSource = false): Promise<ProfilePhotoSource> {
  const bitmap = await createImageBitmap(blob);
  // Reusing our sanitized original avoids recompressing it on every reposition.
  if (preserveSource && blob.type === "image/jpeg" && Math.max(bitmap.width, bitmap.height) <= 1600) {
    const { width, height } = bitmap;
    bitmap.close();
    return { blob, url: URL.createObjectURL(blob), width, height, crop };
  }
  const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image editing is unavailable. Please try again.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally { bitmap.close(); }
  const photo = await encodePhoto(canvas);
  return { blob: photo, url: URL.createObjectURL(photo), width: canvas.width, height: canvas.height, crop };
}

export async function cropProfilePhoto(source: ProfilePhotoSource, kind: ProfilePhotoKind, crop: PhotoCrop) {
  const bitmap = await createImageBitmap(source.blob);
  try {
    const rect = photoCropRect(bitmap.width, bitmap.height, kind, crop);
    const canvas = document.createElement("canvas");
    // Keep the exact display ratio, including for small source images.
    const unit = kind === "avatar" ? 1 : 15;
    canvas.width = Math.max(unit, Math.floor(Math.min(kind === "avatar" ? 512 : 1200, rect.width) / unit) * unit);
    canvas.height = kind === "avatar" ? canvas.width : canvas.width / 15 * 4;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image editing is unavailable. Please try again.");
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
    return await encodePhoto(canvas);
  } finally { bitmap.close(); }
}

export function ProfilePhotoCropper({ kind, source, busy, error, returnFocus, onApply, onCancel }: {
  kind: ProfilePhotoKind; source: ProfilePhotoSource; busy: boolean; error: string;
  returnFocus?: HTMLElement | null;
  onApply(crop: PhotoCrop): void; onCancel(): void;
}) {
  const [crop, setCrop] = useState(source.crop);
  const [dragging, setDragging] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; width: number; crop: PhotoCrop } | null>(null);
  const label = kind === "avatar" ? "avatar" : "cover photo";
  const fieldId = `crop-${kind}`;
  const rect = photoCropRect(source.width, source.height, kind, crop);

  useEffect(() => {
    const opener = returnFocus || document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const modal = dialog.current;
    modal?.showModal();
    document.body.style.overflow = "hidden";
    cancel.current?.focus({ preventScroll: true });
    return () => { modal?.close(); document.body.style.overflow = overflow; opener?.focus(); };
  }, [returnFocus]);

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <dialog ref={dialog} className="profile-crop-dialog" aria-labelledby={`${fieldId}-title`} aria-describedby={`${fieldId}-help`} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={`${fieldId}-title`}>Reposition {label}</h2>
    <p id={`${fieldId}-help`}>Drag the photo to choose what shows. Use the sliders to zoom or adjust its position.</p>
    <div className={`profile-crop-stage ${kind}${dragging ? " is-dragging" : ""}`} role="group" aria-label={`${label} crop preview`} onPointerDown={event => {
      if (busy || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: event.currentTarget.getBoundingClientRect().width, crop };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }} onPointerMove={event => {
      const start = drag.current;
      if (busy || !start || start.id !== event.pointerId) return;
      setCrop(movePhotoCrop(source.width, source.height, kind, start.crop, event.clientX - start.x, event.clientY - start.y, start.width));
    }} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={() => { drag.current = null; setDragging(false); }}>
      <img src={source.url} alt={`${label} crop preview`} draggable={false} style={{ width: `${source.width / rect.width * 100}%`, height: `${source.height / rect.height * 100}%`, left: `${-rect.x / rect.width * 100}%`, top: `${-rect.y / rect.height * 100}%` }}/>
    </div>
    <div className="profile-crop-controls">
      <label htmlFor={`${fieldId}-zoom`}>Zoom <span>{crop.zoom.toFixed(2)}×</span></label>
      <input id={`${fieldId}-zoom`} type="range" min={1} max={3} step={0.01} value={crop.zoom} disabled={busy} onChange={event => setCrop(current => ({ ...current, zoom: Number(event.target.value) }))}/>
      <label htmlFor={`${fieldId}-x`}>Horizontal position</label>
      <input id={`${fieldId}-x`} type="range" min={0} max={100} step={1} value={crop.x * 100} disabled={busy || source.width - rect.width < 0.001} onChange={event => setCrop(current => ({ ...current, x: Number(event.target.value) / 100 }))}/>
      <label htmlFor={`${fieldId}-y`}>Vertical position</label>
      <input id={`${fieldId}-y`} type="range" min={0} max={100} step={1} value={crop.y * 100} disabled={busy || source.height - rect.height < 0.001} onChange={event => setCrop(current => ({ ...current, y: Number(event.target.value) / 100 }))}/>
    </div>
    <button type="button" className="profile-crop-reset" disabled={busy} onClick={() => setCrop({ ...defaultPhotoCrop })}>Reset position and zoom</button>
    <p>Your changes will appear on your profile after you save it.</p>
    {error && <p role="alert" className="form-error">{error} Your current photo is unchanged.</p>}
    {busy && <p role="status">Preparing and uploading {label}…</p>}
    <div className="profile-crop-actions"><button ref={cancel} type="button" className="button outline" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="button dark" disabled={busy} onClick={() => onApply(crop)}>{busy ? "Uploading…" : "Use photo"}</button></div>
  </dialog>;
}
