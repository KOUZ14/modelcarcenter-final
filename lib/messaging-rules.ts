export const MAX_MESSAGE_LENGTH = 2_000;

export function cleanMessageBody(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, MAX_MESSAGE_LENGTH);
}

export function canAccessConversation(
  userId: string,
  conversation: { buyerUserId: string; sellerOwnerUserId: string | null },
) {
  return (
    conversation.buyerUserId === userId ||
    conversation.sellerOwnerUserId === userId
  );
}

export function isUnreadMessage(input: {
  viewerUserId: string;
  senderUserId: string | null;
  createdAt: string;
  lastReadAt: string | null;
}) {
  return (
    input.senderUserId !== input.viewerUserId &&
    (!input.lastReadAt || input.createdAt > input.lastReadAt)
  );
}

export function messagePreview(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 180);
}
