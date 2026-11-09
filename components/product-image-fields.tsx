"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ambiguousPhotoLabels, getSelectedPhotoViews, photoAltForViews, photoViews, photoViewsFromAlt, setSelectedPhotoViews, type PhotoView } from "@/lib/listing-evidence";
import { MAX_LISTING_IMAGES, MAX_LISTING_IMAGE_BYTES } from "@/lib/listing-images";

export type EditableProductImage = { id: string; url: string; alt: string; sortOrder?: number };

type Props = {
  images: EditableProductImage[];
  primaryImageUrl?: string | null;
  files: File[];
  disabled?: boolean;
  onFilesChange(files: File[]): void;
  onRemove?(imageId: string): Promise<void>;
  onRemoveLegacy?(): Promise<void>;
  onReorder?(imageIds: string[]): Promise<void>;
  onImagesChange?(images: EditableProductImage[]): void;
  onLabelsChange?(): void;
  onBusyChange?(busy: boolean): void;
  onCoverFileChange?(file: File): void;
  pendingCover?: File | null;
  productId?: string;
};

export function ProductImageFields({ images, primaryImageUrl, files, disabled = false, onFilesChange, onRemove, onRemoveLegacy, onReorder, onImagesChange, onLabelsChange, onBusyChange, onCoverFileChange, pendingCover, productId }: Props) {
  const [selected, setSelected] = useState<string | File | null>(null);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [labelOverrides, setLabelOverrides] = useState<Record<string, PhotoView[]>>({});
  const [legacyReview, setLegacyReview] = useState<Record<string, PhotoView[]>>({});
  const labelsRef = useRef<HTMLFieldSetElement>(null);
  const overflowRef = useRef<HTMLDetailsElement>(null);
  const previewRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const menu = overflowRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  function closeActions() { if (overflowRef.current) overflowRef.current.open = false; }
  const legacyPrimary = primaryImageUrl && !images.some(image => image.url === primaryImageUrl) ? primaryImageUrl : null;
  const photos = [
    ...(legacyPrimary ? [{ key: "legacy", url: legacyPrimary, alt: "Existing cover photo", file: undefined as File | undefined, image: undefined as EditableProductImage | undefined }] : []),
    ...images.map(image => ({ key: image.id, url: image.url, alt: image.alt, image, file: undefined as File | undefined })),
    ...files.map(file => ({ key: file, file, url: "", alt: file.name, image: undefined as EditableProductImage | undefined })),
  ];
  const active = photos.find(photo => photo.key === selected) ?? photos[0];
  const index = active ? photos.indexOf(active) : -1;
  const legacyLabels = active?.image && !Object.hasOwn(labelOverrides, active.image.id) ? ambiguousPhotoLabels(active.image.alt) : [];
  const needsConfirmation = legacyLabels.length > 0;
  const views = active?.file ? getSelectedPhotoViews(active.file) : active?.image ? labelOverrides[active.image.id] ?? legacyReview[active.image.id] ?? photoViewsFromAlt(active.image.alt) : [];
  const locked = disabled || busy;
  const available = Math.max(0, MAX_LISTING_IMAGES - photos.length);
  const isCover = (photo: typeof active) => pendingCover ? photo?.file === pendingCover : photo === photos[0];

  async function run(task: () => Promise<void>, success: string) {
    if (operation.current) return;
    operation.current = true; setBusy(true); onBusyChange?.(true); setError(""); setNotice("");
    try { await task(); setNotice(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Photo changes could not be saved. Try again."); }
    finally { operation.current = false; setBusy(false); onBusyChange?.(false); }
  }

  async function label(next: PhotoView[]) {
    if (!active) return;
    if (active.file) {
      setSelectedPhotoViews(active.file, next);
      onFilesChange([...files]); onLabelsChange?.();
      setNotice("Labels will be saved with this photo.");
      return;
    }
    if (!productId || !active.image) return;
    const image = active.image;
    await run(async () => {
      const response = await fetch("/api/listings/images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, imageId: image.id, views: next }) });
      const body = await response.json() as { error?: string; image?: EditableProductImage };
      if (!response.ok) throw new Error(body.error || "Photo labels could not be saved.");
      setLabelOverrides(current => ({ ...current, [image.id]: next }));
      onImagesChange?.(images.map(item => item.id === image.id ? { ...item, alt: body.image?.alt ?? photoAltForViews(next, "Actual item") } : item));
      onLabelsChange?.();
    }, "Photo labels saved.");
  }

  function move(to: number) {
    if (!active) return;
    closeActions();
    if (active.file) {
      const from = files.indexOf(active.file);
      onFilesChange(moveItem(files, from, to));
    } else if (active.image && onReorder) {
      const next = moveItem(images, images.indexOf(active.image), to);
      void run(() => onReorder(next.map(image => image.id)), "Photo order saved.");
    }
  }
  const ownIndex = active?.file ? files.indexOf(active.file) : active?.image ? images.indexOf(active.image) : 0;
  const ownCount = active?.file ? files.length : images.length;
  return <div className="product-photo-fields compact-photo-editor">
    <label className="file-input">{available ? "Add photos" : "Photo limit reached"}
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={locked || available === 0} onChange={event => {
        const chosen = Array.from(event.target.files ?? []);
        const valid = chosen.filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size > 0 && file.size <= MAX_LISTING_IMAGE_BYTES);
        setError(valid.length !== chosen.length ? "Use JPEG, PNG, or WebP photos of 10 MB or less." : chosen.length > available ? `Only ${available} more photos fit. Extra files were not added.` : "");
        const next = valid.slice(0, available);
        onFilesChange([...files, ...next]); if (next[0]) setSelected(next[0]);
        event.currentTarget.value = "";
      }} />
    </label>
    <p className="field-note">{photos.length} of {MAX_LISTING_IMAGES} photos · JPEG, PNG or WebP · 10 MB each. Include extra close-ups of details, defects and repairs.</p>
    <div className="photo-thumbnail-grid" aria-label="Listing photos">
      {photos.map((photo, i) => <button key={photo.image?.id ?? (photo.file ? `${photo.file.name}-${photo.file.lastModified}-${i}` : "legacy")} type="button" className="photo-thumbnail" aria-pressed={active === photo} aria-label={`Edit labels for photo ${i + 1}${isCover(photo) ? ", cover" : ""}`} disabled={locked} onClick={() => { setSelected(photo.key); setNotice(""); }}>
        <PhotoImage url={photo.url} file={photo.file} alt={`Photo ${i + 1}`} />
        <span>{isCover(photo) ? "Cover" : `Photo ${i + 1}`}{photo.file ? " · New" : ""}{photo.image && !Object.hasOwn(labelOverrides, photo.image.id) && ambiguousPhotoLabels(photo.alt).length > 0 ? " · Review labels" : ""}</span>
      </button>)}
    </div>
    {active && <div className="selected-photo-editor">
      <div className="selected-photo-heading"><strong>Photo {index + 1}{isCover(active) ? " · Cover" : ""}</strong><span>{active.file ? "Pending upload" : "Uploaded"}</span></div>
      <button type="button" className="selected-photo-preview" onClick={() => previewRef.current?.showModal()} aria-label={`Enlarge photo ${index + 1}`}>
        <PhotoImage url={active.url} file={active.file} alt={`Selected photo ${index + 1}`} />
        <span>View full screen</span>
      </button>
      <dialog ref={previewRef} className="photo-preview-dialog" aria-label={`Photo ${index + 1} full-screen preview`}>
        <div className="photo-preview-dialog-header"><strong>Photo {index + 1}</strong><button type="button" className="button outline small" onClick={() => previewRef.current?.close()}>Close preview</button></div>
        <PhotoImage url={active.url} file={active.file} alt={`Photo ${index + 1}, enlarged`} />
      </dialog>
      <div className="photo-editor-actions">
        <button type="button" className="text-action" disabled={locked || active.key === "legacy"} onClick={() => labelsRef.current?.focus()}>Edit labels</button>
        <button type="button" className="text-action" disabled={locked || isCover(active) || (Boolean(active.file) && images.length > 0 && !onCoverFileChange) || (!active.file && !onReorder)} onClick={() => {
          if (active.file && onCoverFileChange) onCoverFileChange(active.file);
          else move(0);
        }}>Set as cover</button>
        <details ref={overflowRef} className="photo-overflow" key={String(index)} onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); closeActions(); event.currentTarget.querySelector("summary")?.focus(); }
        }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) closeActions(); }}><summary>More actions</summary><div>
          {(active.file || (active.image && onReorder)) && <><button type="button" disabled={locked || ownIndex === 0} onClick={() => move(ownIndex - 1)}>Move earlier</button><button type="button" disabled={locked || ownIndex === ownCount - 1} onClick={() => move(ownIndex + 1)}>Move later</button></>}
          {(active.file || onRemove || (active.key === "legacy" && onRemoveLegacy)) && <button type="button" className="photo-remove-action" disabled={locked} onClick={() => {
            closeActions();
            if (active.file) onFilesChange(files.filter(file => file !== active.file));
            else if (active.image && onRemove) void run(() => onRemove(active.image!.id), "Photo removed.");
            else if (onRemoveLegacy) void run(onRemoveLegacy, "Photo removed.");
          }}>Remove photo</button>}
        </div></details>
      </div>
      {active.key === "legacy" ? <p>Add labeled actual-item photos to replace this older cover.</p> : <fieldset ref={labelsRef} tabIndex={-1} className="photo-view-labels" disabled={locked || (!active.file && !productId)}>
        <legend>What does photo {index + 1} show?</legend>
        {needsConfirmation && <p className="photo-label-review" role="status">Review needed: this photo was labeled “{legacyLabels.join("” and “")}”. These grouped labels do not count toward coverage. Inspect the photo, select only the views it shows, then confirm.</p>}
        <div>{photoViews.map(view => <label key={view.key}><input type="checkbox" checked={views.includes(view.key)} onChange={event => {
          const next = event.target.checked ? [...views, view.key] : views.filter(key => key !== view.key);
          if (needsConfirmation && active.image) setLegacyReview(current => ({ ...current, [active.image!.id]: next }));
          else void label(next);
        }} /><span>{view.label}{view.key === "details" ? " (optional)" : ""}</span></label>)}</div>
        {needsConfirmation && <button type="button" className="button outline small" onClick={() => void label(views)}>Confirm photo labels</button>}
      </fieldset>}
    </div>}
    {files.length > 0 && <p className="field-note">{files.length} new photo{files.length === 1 ? "" : "s"} will upload when you save.</p>}
    {(busy || notice) && <p className="field-note" role="status">{busy ? "Saving photo changes…" : notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

export function PhotoImage({ url, file, alt }: { url?: string; file?: File; alt: string }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    // Object URLs belong to the mounted preview and are released on replacement.
    queueMicrotask(() => setPreview(objectUrl));
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  const src = file ? preview : url;
  return src ? <Image src={src} alt={alt} width={440} height={330} unoptimized /> : <span className="photo-placeholder">Photo preview</span>;
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
}
