import type { Piece } from "./community";

export type ProfileImage = { id?: string; url: string } | null;
export type EditableProfile = { handle: string | null; displayName: string; bio: string; avatarUrl?: string | null };
export type ProfilePreferences = { cover_id?: string | null; published: number; visibility: string; interests: string; region: string; contact: string; social_notifications: number; discovery_notifications: number };
export type ProfileValues = {
  displayName: string; handle: string; bio: string; interests: string; region: string;
  avatar: ProfileImage; cover: ProfileImage; published: boolean; visibility: string; contact: string;
  socialNotifications: boolean; discoveryNotifications: boolean;
};
export type PreviewPiece = Pick<Piece, "id" | "title" | "scale" | "maker" | "photos" | "availability">;

export function profileValues(profile: EditableProfile, settings: ProfilePreferences): ProfileValues {
  return {
    displayName: profile.displayName, handle: profile.handle || "", bio: profile.bio || "",
    interests: settings.interests || "", region: settings.region || "",
    avatar: profile.avatarUrl ? { url: profile.avatarUrl, ...(profile.avatarUrl.startsWith("/community/media/") ? { id: profile.avatarUrl.slice("/community/media/".length) } : {}) } : null,
    cover: settings.cover_id ? { id: settings.cover_id, url: `/community/media/${encodeURIComponent(settings.cover_id)}` } : null,
    published: Boolean(settings.published), visibility: settings.visibility === "public" ? "public" : "private",
    contact: ["requests", "everyone", "following", "existing"].includes(settings.contact) ? settings.contact : "requests",
    socialNotifications: Boolean(settings.social_notifications), discoveryNotifications: Boolean(settings.discovery_notifications),
  };
}

export function normalizedProfile(values: ProfileValues): ProfileValues {
  return { ...values, displayName: values.displayName.trim(), handle: values.handle.trim().toLowerCase(), bio: values.bio.trim(), interests: values.interests.trim(), region: values.region.trim() };
}

export function profilePayload(values: ProfileValues, confirmed: boolean) {
  const normalized = normalizedProfile(values);
  const { avatar, cover, ...fields } = normalized;
  return { action: "settings", ...fields, avatarId: avatar ? avatar.id : "", coverId: cover?.id || "", publishConfirmed: confirmed };
}

export function publicPreviewPieces(pieces: Piece[]): PreviewPiece[] {
  return pieces.filter(piece => piece.visibility === "public").map(({ id, title, scale, maker, photos, availability }) => ({ id, title, scale, maker, photos, availability }));
}

export const messagePreferences: Record<string, { label: string; explanation: string }> = {
  requests: { label: "Requests from new people", explanation: "Anyone can contact you. People you follow go straight to your inbox; other new people send a request you accept before the conversation continues." },
  everyone: { label: "Everyone · straight to inbox", explanation: "Anyone can start a conversation directly in your inbox, without waiting for you to accept a request." },
  following: { label: "Only people I follow", explanation: "Only people you follow can start a new conversation. Their messages go straight to your inbox." },
  existing: { label: "Existing conversations only", explanation: "New people cannot start a conversation. You can continue conversations you already have." },
};
