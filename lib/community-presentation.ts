import type { Post } from "./community";

// Shared by server pages and client components; keep labels outside the client boundary.
export const availabilityLabel: Record<string, string> = {
  not_for_sale: "Not for sale",
  open_to_offers: "Open to offers",
  for_sale: "For sale",
  reserved: "Reserved · pending payment",
  previously_owned: "Previously owned",
};

export function pieceAvailabilityLabel(value: string | null | undefined) {
  return value && Object.hasOwn(availabilityLabel, value) ? availabilityLabel[value] : "Availability not specified";
}

export function taggedModel(post: Pick<Post, "modelTitle" | "itemTitle" | "modelColor">) {
  const title = post.modelTitle || post.itemTitle || "Tagged model";
  const suffix = post.modelColor ? ` · ${post.modelColor}` : "";
  return suffix && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

export function commentTime(createdAt: number, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - createdAt) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(createdAt);
}

export function addressComment(body: string, handle: string) {
  const mention = `@${handle}`;
  return body.startsWith(`${mention} `) || body === mention ? body : `${mention} ${body}`;
}

export const COMMENT_DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function readCommentDraft(value: string | null, viewerId: string | null, now = Date.now()) {
  if (!value) return "";
  try {
    const draft = JSON.parse(value) as { body?: unknown; viewerId?: unknown; updatedAt?: unknown };
    if (typeof draft.body !== "string" || draft.body.length > 2000 || typeof draft.updatedAt !== "number"
      || now - draft.updatedAt > COMMENT_DRAFT_MAX_AGE || draft.updatedAt > now
      || (draft.viewerId && draft.viewerId !== viewerId)) return "";
    return draft.body;
  } catch { return ""; }
}

export function profileDiscussionReturn(value?: string) {
  if (!value) return undefined;
  if (value.startsWith("/collection?edit=")) return value;
  return /^\/(?:community\/posts|collection)\/[a-zA-Z0-9_-]+#comment-composer$/.test(value) ? value : undefined;
}
