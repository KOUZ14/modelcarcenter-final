"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export type EditableProductImage = {
  id: string;
  url: string;
  alt: string;
};

export function ProductImageFields({
  images,
  primaryImageUrl,
  files,
  disabled = false,
  onFilesChange,
  onRemove,
}: {
  images: EditableProductImage[];
  primaryImageUrl?: string | null;
  files: File[];
  disabled?: boolean;
  onFilesChange(files: File[]): void;
  onRemove?(imageId: string): Promise<void>;
}) {
  const [removingId, setRemovingId] = useState("");
  const legacyPrimary =
    primaryImageUrl && !images.some((image) => image.url === primaryImageUrl)
      ? primaryImageUrl
      : null;
  const available = Math.max(0, 8 - images.length);

  async function remove(imageId: string) {
    if (!onRemove) return;
    setRemovingId(imageId);
    try {
      await onRemove(imageId);
    } finally {
      setRemovingId("");
    }
  }

  return (
    <div className="product-photo-fields">
      <div>
        <b>Product photos</b>
        <p>
          Upload up to 8 JPEG, PNG, or WebP photos, 10 MB each. The first new
          photo will be the primary image.
        </p>
      </div>
      {(images.length > 0 || legacyPrimary || files.length > 0) && (
        <div className="listing-images">
          {legacyPrimary && (
            <div>
              <Image
                src={legacyPrimary}
                alt="Current product image"
                width={220}
                height={180}
                unoptimized
              />
              <span>Current</span>
            </div>
          )}
          {images.map((image) => (
            <div key={image.id}>
              <Image
                src={image.url}
                alt={image.alt}
                width={220}
                height={180}
                unoptimized
              />
              {onRemove && (
                <button
                  type="button"
                  disabled={disabled || Boolean(removingId)}
                  onClick={() => void remove(image.id)}
                >
                  {removingId === image.id ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          ))}
          {files.map((file, index) => (
            <SelectedImagePreview
              key={`${file.name}-${file.size}-${file.lastModified}`}
              file={file}
              index={index}
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
          onChange={(event) =>
            onFilesChange(
              Array.from(event.target.files ?? []).slice(0, available),
            )
          }
        />
      </label>
      {files.length > 0 && (
        <p className="form-note">
          {files.length} photo{files.length === 1 ? "" : "s"} ready to upload
          when you save.
        </p>
      )}
    </div>
  );
}

function SelectedImagePreview({ file, index }: { file: File; index: number }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div>
      <Image
        src={url}
        alt={`Selected photo ${index + 1}`}
        width={220}
        height={180}
        unoptimized
      />
      <span>Ready to upload</span>
    </div>
  );
}
