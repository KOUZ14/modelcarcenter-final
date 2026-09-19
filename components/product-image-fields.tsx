"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getSelectedPhotoViews, photoViews, photoViewsFromAlt, setSelectedPhotoViews, type PhotoView } from "@/lib/listing-evidence";
import styles from "./purchase-info.module.css";

export type EditableProductImage = {
  id: string;
  url: string;
  alt: string;
  sortOrder?: number;
};

export function ProductImageFields({
  images,
  primaryImageUrl,
  files,
  disabled = false,
  onFilesChange,
  onRemove,
  onRemoveLegacy,
  onReorder,
  productId,
}: {
  images: EditableProductImage[];
  primaryImageUrl?: string | null;
  files: File[];
  disabled?: boolean;
  onFilesChange(files: File[]): void;
  onRemove?(imageId: string): Promise<void>;
  onRemoveLegacy?(): Promise<void>;
  onReorder?(imageIds: string[]): Promise<void>;
  productId?: string;
}) {
  const [removingId, setRemovingId] = useState("");
  const [reordering, setReordering] = useState(false);
  const legacyPrimary =
    primaryImageUrl && !images.some((image) => image.url === primaryImageUrl)
      ? primaryImageUrl
      : null;
  const available = Math.max(0, 8 - images.length - files.length);

  async function remove(imageId: string) {
    if (!onRemove) return;
    setRemovingId(imageId);
    try {
      await onRemove(imageId);
    } finally {
      setRemovingId("");
    }
  }

  async function removeLegacy() {
    if (!onRemoveLegacy) return;
    setRemovingId("legacy-primary");
    try {
      await onRemoveLegacy();
    } finally {
      setRemovingId("");
    }
  }

  async function moveSavedPhoto(index: number, offset: -1 | 1) {
    if (!onReorder) return;
    const next = moveItem(images, index, index + offset);
    setReordering(true);
    try {
      await onReorder(next.map((image) => image.id));
    } finally {
      setReordering(false);
    }
  }

  function moveSelectedPhoto(index: number, offset: -1 | 1) {
    onFilesChange(moveItem(files, index, index + offset));
  }

  return (
    <div className="product-photo-fields">
      <div>
        <b>Product photos</b>
        <p>
          Upload up to 8 JPEG, PNG, or WebP photos, 10 MB each. The first photo
          is the primary image. Use the arrow controls to set the display order.
        </p>
      </div>
      {(images.length > 0 || legacyPrimary || files.length > 0) && (
        <div className="listing-images">
          {legacyPrimary && (
            <div className="listing-image-card">
              <Image
                src={legacyPrimary}
                alt="Current product image"
                width={220}
                height={180}
                unoptimized
              />
              <span className="listing-image-badge">Current primary</span>
              {onRemoveLegacy && (
                <div className="listing-image-actions">
                  <button
                    type="button"
                    disabled={disabled || Boolean(removingId) || reordering}
                    onClick={() => void removeLegacy()}
                  >
                    {removingId === "legacy-primary" ? "Removing…" : "Remove"}
                  </button>
                </div>
              )}
            </div>
          )}
          {images.map((image, index) => (
            <div className="listing-image-card" key={image.id}>
              <Image
                src={image.url}
                alt={image.alt}
                width={220}
                height={180}
                unoptimized
              />
              <span className="listing-image-badge">
                {index === 0 ? "Primary" : `Photo ${index + 1}`}
              </span>
              {productId && <PhotoViewLabels initial={photoViewsFromAlt(image.alt)} disabled={disabled} save={async (views) => {
                const response = await fetch("/api/listings/images", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, imageId: image.id, views }) });
                const body = await response.json() as { error?: string };
                if (!response.ok) throw new Error(body.error || "Photo labels could not be saved.");
              }}/>}
              {(onRemove || onReorder) && (
                <div className="listing-image-actions">
                  {onReorder && (
                    <>
                      <button
                        type="button"
                        aria-label={`Move photo ${index + 1} earlier`}
                        title="Move earlier"
                        disabled={
                          disabled ||
                          Boolean(removingId) ||
                          reordering ||
                          index === 0
                        }
                        onClick={() => void moveSavedPhoto(index, -1)}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        aria-label={`Move photo ${index + 1} later`}
                        title="Move later"
                        disabled={
                          disabled ||
                          Boolean(removingId) ||
                          reordering ||
                          index === images.length - 1
                        }
                        onClick={() => void moveSavedPhoto(index, 1)}
                      >
                        →
                      </button>
                    </>
                  )}
                  {onRemove && (
                    <button
                      type="button"
                      disabled={
                        disabled || Boolean(removingId) || reordering
                      }
                      onClick={() => void remove(image.id)}
                    >
                      {removingId === image.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {files.map((file, index) => (
            <SelectedImagePreview
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              file={file}
              index={index}
              isPrimary={index === 0 && images.length === 0}
              disabled={disabled || Boolean(removingId) || reordering}
              onMoveEarlier={() => moveSelectedPhoto(index, -1)}
              onMoveLater={() => moveSelectedPhoto(index, 1)}
              onRemove={() =>
                onFilesChange(files.filter((_, fileIndex) => fileIndex !== index))
              }
              canMoveEarlier={index > 0}
              canMoveLater={index < files.length - 1}
            />
          ))}
        </div>
      )}
      <label className="file-input">
        {available ? "Choose photos" : "Photo limit reached"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled || available === 0}
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []).slice(
              0,
              available,
            );
            onFilesChange([...files, ...selected]);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <p className="form-note">
          {files.length} photo{files.length === 1 ? "" : "s"} ready to upload
          in this order when you save.
        </p>
      )}
      {(removingId || reordering) && (
        <p className="form-note" role="status">
          {reordering ? "Saving photo order…" : "Removing photo…"}
        </p>
      )}
    </div>
  );
}

function SelectedImagePreview({
  file,
  index,
  isPrimary,
  disabled,
  canMoveEarlier,
  canMoveLater,
  onMoveEarlier,
  onMoveLater,
  onRemove,
}: {
  file: File;
  index: number;
  isPrimary: boolean;
  disabled: boolean;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onMoveEarlier(): void;
  onMoveLater(): void;
  onRemove(): void;
}) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="listing-image-card">
      <Image
        src={url}
        alt={`Selected photo ${index + 1}`}
        width={220}
        height={180}
        unoptimized
      />
      <span className="listing-image-badge">
        {isPrimary ? "New primary" : `New photo ${index + 1}`}
      </span>
      <PhotoViewLabels initial={getSelectedPhotoViews(file)} disabled={disabled} save={async (views) => setSelectedPhotoViews(file, views)}/>
      <div className="listing-image-actions">
        <button
          type="button"
          aria-label={`Move selected photo ${index + 1} earlier`}
          title="Move earlier"
          disabled={disabled || !canMoveEarlier}
          onClick={onMoveEarlier}
        >
          ←
        </button>
        <button
          type="button"
          aria-label={`Move selected photo ${index + 1} later`}
          title="Move later"
          disabled={disabled || !canMoveLater}
          onClick={onMoveLater}
        >
          →
        </button>
        <button type="button" disabled={disabled} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function moveItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function PhotoViewLabels({ initial, disabled, save }: { initial: PhotoView[]; disabled: boolean; save(views: PhotoView[]): Promise<void> }) {
  const [selected, setSelected] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <fieldset className={styles.photoLabels} disabled={disabled || busy}>
    <legend>What does this actual-item photo show?</legend>
    {photoViews.map(view => <label key={view.key}><input type="checkbox" checked={selected.includes(view.key)} onChange={async (event) => {
      const next = event.target.checked ? [...selected, view.key] : selected.filter(key => key !== view.key);
      setBusy(true); setError("");
      try { await save(next); setSelected(next); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save photo labels."); } finally { setBusy(false); }
    }}/>{view.label}</label>)}
    {busy && <small role="status">Saving labels…</small>}{error && <small role="alert">{error}</small>}
  </fieldset>;
}
