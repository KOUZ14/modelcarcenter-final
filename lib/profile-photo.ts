export type ProfilePhotoKind = "avatar" | "cover";
export type PhotoCrop = { x: number; y: number; zoom: number };
export type SavedPhotoCrop = PhotoCrop & { kind: ProfilePhotoKind };

export const defaultPhotoCrop: PhotoCrop = { x: 0.5, y: 0.5, zoom: 1 };
export const profilePhotoAspect = { avatar: 1, cover: 15 / 4 };

export function parsePhotoCrop(value: unknown): SavedPhotoCrop | null {
  if (!value || typeof value !== "object") return null;
  const { kind, x, y, zoom } = value as Record<string, unknown>;
  if (kind !== "avatar" && kind !== "cover") return null;
  if (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1
    || typeof y !== "number" || !Number.isFinite(y) || y < 0 || y > 1
    || typeof zoom !== "number" || !Number.isFinite(zoom) || zoom < 1 || zoom > 3) return null;
  return { kind, x, y, zoom };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// The same source rectangle drives the preview and the exported image.
export function photoCropRect(width: number, height: number, kind: ProfilePhotoKind, crop: PhotoCrop) {
  const cropWidth = Math.min(width, height * profilePhotoAspect[kind]) / clamp(crop.zoom, 1, 3);
  const cropHeight = cropWidth / profilePhotoAspect[kind];
  return { x: Math.max(0, width - cropWidth) * clamp(crop.x, 0, 1), y: Math.max(0, height - cropHeight) * clamp(crop.y, 0, 1), width: cropWidth, height: cropHeight };
}

export function movePhotoCrop(width: number, height: number, kind: ProfilePhotoKind, crop: PhotoCrop, dx: number, dy: number, frameWidth: number): PhotoCrop {
  const rect = photoCropRect(width, height, kind, crop);
  const scale = rect.width / frameWidth;
  return {
    ...crop,
    x: width - rect.width > 0.001 ? clamp(crop.x - dx * scale / (width - rect.width), 0, 1) : crop.x,
    y: height - rect.height > 0.001 ? clamp(crop.y - dy * scale / (height - rect.height), 0, 1) : crop.y,
  };
}
