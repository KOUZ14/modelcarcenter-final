import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import {
  collectorProfiles,
  conversationMessages,
  conversations,
  products,
  sellers,
} from "@/db/schema";
import {
  canAccessConversation,
  cleanMessageBody,
  isUnreadMessage,
  messagePreview,
} from "./messaging-rules";
import { ValidationError } from "./validation";

const conversationSelection = {
  id: conversations.id,
  buyerUserId: conversations.buyerUserId,
  sellerId: conversations.sellerId,
  sellerOwnerUserId: sellers.ownerUserId,
  sellerName: sellers.storeName,
  sellerSlug: sellers.slug,
  productId: conversations.productId,
  productSlug: conversations.productSlugSnapshot,
  productTitle: conversations.productTitleSnapshot,
  productImageUrl: conversations.productImageUrlSnapshot,
  lastMessagePreview: conversations.lastMessagePreview,
  lastMessageAt: conversations.lastMessageAt,
  buyerLastReadAt: conversations.buyerLastReadAt,
  sellerLastReadAt: conversations.sellerLastReadAt,
  createdAt: conversations.createdAt,
};

export async function getMessagingCenterData(
  userId: string,
  input: { conversationId?: string; productId?: string } = {},
) {
  const db = getDb();
  const rows = await db
    .select(conversationSelection)
    .from(conversations)
    .innerJoin(sellers, eq(conversations.sellerId, sellers.id))
    .where(
      or(
        eq(conversations.buyerUserId, userId),
        eq(sellers.ownerUserId, userId),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt));

  const buyerIds = [...new Set(rows.map((row) => row.buyerUserId))];
  const profileRows = buyerIds.length
    ? await db
        .select({
          userId: collectorProfiles.userId,
          displayName: collectorProfiles.displayName,
        })
        .from(collectorProfiles)
        .where(inArray(collectorProfiles.userId, buyerIds))
    : [];
  const buyerNames = new Map(
    profileRows.map((profile) => [profile.userId, profile.displayName]),
  );

  const conversationIds = rows.map((row) => row.id);
  const messageRows = conversationIds.length
    ? await db
        .select()
        .from(conversationMessages)
        .where(inArray(conversationMessages.conversationId, conversationIds))
        .orderBy(asc(conversationMessages.createdAt))
    : [];

  const summaries = rows.map((row) => {
    const viewerRole =
      row.buyerUserId === userId ? ("buyer" as const) : ("seller" as const);
    const lastReadAt =
      viewerRole === "buyer" ? row.buyerLastReadAt : row.sellerLastReadAt;
    const unreadCount = messageRows.filter(
      (message) =>
        message.conversationId === row.id &&
        isUnreadMessage({
          viewerUserId: userId,
          senderUserId: message.senderUserId,
          createdAt: message.createdAt,
          lastReadAt,
        }),
    ).length;
    return {
      id: row.id,
      viewerRole,
      otherPartyName:
        viewerRole === "buyer"
          ? row.sellerName
          : buyerNames.get(row.buyerUserId) || "Collector",
      sellerName: row.sellerName,
      sellerSlug: row.sellerSlug,
      productId: row.productId,
      productSlug: row.productSlug,
      productTitle: row.productTitle,
      productImageUrl: row.productImageUrl,
      lastMessagePreview: row.lastMessagePreview,
      lastMessageAt: row.lastMessageAt,
      unreadCount,
    };
  });

  let selectedId = input.conversationId;
  let newConversation: MessagingCenterData["newConversation"] = null;
  if (input.productId) {
    const product = await getMessageableProduct(input.productId);
    const existing = rows.find(
      (row) =>
        row.productId === product.id &&
        row.buyerUserId === userId &&
        row.sellerId === product.sellerId,
    );
    if (existing) selectedId = existing.id;
    else {
      newConversation = {
        productId: product.id,
        productSlug: product.slug,
        productTitle: product.title,
        productImageUrl: product.primaryImageUrl,
        sellerName: product.sellerName,
        sellerSlug: product.sellerSlug,
        canMessage: Boolean(
          product.sellerOwnerUserId && product.sellerOwnerUserId !== userId,
        ),
        unavailableReason:
          product.sellerOwnerUserId === userId
            ? "This is your own listing."
            : product.sellerOwnerUserId
              ? null
              : "This seller is not available for in-app messages yet.",
      };
    }
  }

  const selected =
    rows.find((row) => row.id === selectedId) ??
    (newConversation ? null : rows[0] ?? null);
  const activeConversation = selected
    ? {
        ...summaries.find((item) => item.id === selected.id)!,
        messages: messageRows
          .filter((message) => message.conversationId === selected.id)
          .map((message) => ({
            id: message.id,
            body: message.body,
            createdAt: message.createdAt,
            isOwn: message.senderUserId === userId,
            senderLabel:
              message.senderUserId === userId
                ? "You"
                : selected.buyerUserId === userId
                  ? selected.sellerName
                  : buyerNames.get(selected.buyerUserId) || "Collector",
          })),
      }
    : null;

  return {
    conversations: summaries,
    activeConversation,
    newConversation,
    totalUnread: summaries.reduce((sum, item) => sum + item.unreadCount, 0),
  };
}

export type MessagingCenterData = {
  conversations: Array<{
    id: string;
    viewerRole: "buyer" | "seller";
    otherPartyName: string;
    sellerName: string;
    sellerSlug: string;
    productId: string | null;
    productSlug: string;
    productTitle: string;
    productImageUrl: string | null;
    lastMessagePreview: string;
    lastMessageAt: string;
    unreadCount: number;
  }>;
  activeConversation: (MessagingCenterData["conversations"][number] & {
    messages: Array<{
      id: string;
      body: string;
      createdAt: string;
      isOwn: boolean;
      senderLabel: string;
    }>;
  }) | null;
  newConversation: {
    productId: string;
    productSlug: string;
    productTitle: string;
    productImageUrl: string | null;
    sellerName: string;
    sellerSlug: string;
    canMessage: boolean;
    unavailableReason: string | null;
  } | null;
  totalUnread: number;
};

export async function startConversation(
  userId: string,
  productId: string,
  rawBody: unknown,
) {
  const body = requireMessageBody(rawBody);
  const product = await getMessageableProduct(productId);
  if (!product.sellerOwnerUserId)
    throw new ValidationError(
      "This seller is not available for in-app messages yet.",
    );
  if (product.sellerOwnerUserId === userId)
    throw new ValidationError("You cannot message your own listing.");

  const now = new Date().toISOString();
  const candidateId = crypto.randomUUID();
  await getD1()
    .prepare(
      `INSERT OR IGNORE INTO conversations
      (id, buyer_user_id, seller_id, product_id, product_title_snapshot,
       product_slug_snapshot, product_image_url_snapshot, last_message_at,
       buyer_last_read_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      candidateId,
      userId,
      product.sellerId,
      product.id,
      product.title,
      product.slug,
      product.primaryImageUrl,
      now,
      now,
      now,
      now,
    )
    .run();
  const existing = await getDb()
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.buyerUserId, userId),
        eq(conversations.sellerId, product.sellerId),
        eq(conversations.productId, product.id),
      ),
    )
    .limit(1);
  if (!existing[0]) throw new Error("The conversation could not be created.");
  await insertMessage(existing[0].id, userId, body, "buyer");
  return { conversationId: existing[0].id };
}

export async function sendConversationMessage(
  userId: string,
  conversationId: string,
  rawBody: unknown,
) {
  const body = requireMessageBody(rawBody);
  const access = await requireConversationAccess(userId, conversationId);
  await insertMessage(conversationId, userId, body, access.role);
  return { conversationId };
}

export async function markConversationRead(
  userId: string,
  conversationId: string,
) {
  const access = await requireConversationAccess(userId, conversationId);
  const now = new Date().toISOString();
  await getDb()
    .update(conversations)
    .set(
      access.role === "buyer"
        ? { buyerLastReadAt: now, updatedAt: now }
        : { sellerLastReadAt: now, updatedAt: now },
    )
    .where(eq(conversations.id, conversationId));
  return { conversationId };
}

async function insertMessage(
  conversationId: string,
  senderUserId: string,
  body: string,
  senderRole: "buyer" | "seller",
) {
  const now = new Date().toISOString();
  const d1 = getD1();
  await d1.batch([
    d1
      .prepare(
        `INSERT INTO conversation_messages
        (id, conversation_id, sender_user_id, body, created_at)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), conversationId, senderUserId, body, now),
    d1
      .prepare(
        `UPDATE conversations SET last_message_preview = ?, last_message_at = ?,
        ${senderRole === "buyer" ? "buyer_last_read_at" : "seller_last_read_at"} = ?,
        updated_at = ? WHERE id = ?`,
      )
      .bind(messagePreview(body), now, now, now, conversationId),
  ]);
}

async function requireConversationAccess(userId: string, conversationId: string) {
  const rows = await getDb()
    .select({
      buyerUserId: conversations.buyerUserId,
      sellerOwnerUserId: sellers.ownerUserId,
    })
    .from(conversations)
    .innerJoin(sellers, eq(conversations.sellerId, sellers.id))
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const row = rows[0];
  if (!row || !canAccessConversation(userId, row))
    throw new ValidationError("Conversation not found or unavailable.");
  return {
    ...row,
    role: row.buyerUserId === userId ? ("buyer" as const) : ("seller" as const),
  };
}

async function getMessageableProduct(productId: string) {
  const rows = await getDb()
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      primaryImageUrl: products.primaryImageUrl,
      sellerId: sellers.id,
      sellerName: sellers.storeName,
      sellerSlug: sellers.slug,
      sellerOwnerUserId: sellers.ownerUserId,
    })
    .from(products)
    .innerJoin(sellers, eq(products.sellerId, sellers.id))
    .where(
      and(
        eq(products.id, productId),
        eq(products.status, "active"),
        eq(sellers.status, "active"),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new ValidationError("This listing is no longer available.");
  return rows[0];
}

function requireMessageBody(value: unknown) {
  const body = cleanMessageBody(value);
  if (!body) throw new ValidationError("Write a message before sending.");
  return body;
}
