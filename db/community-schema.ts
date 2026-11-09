import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, check, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema.generated";
import { catalogProducts, products } from "./schema";

const owner = () => text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" });
const created = () => integer("created_at").notNull();
export const communitySettings = sqliteTable("community_settings", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  published: integer("published").notNull().default(0), visibility: text("visibility").notNull().default("private"),
  interests: text("interests").notNull().default(""), region: text("region").notNull().default(""),
  coverId: text("cover_id"), contact: text("contact").notNull().default("requests"),
  socialNotifications: integer("social_notifications").notNull().default(1), discoveryNotifications: integer("discovery_notifications").notNull().default(0),
}, t => [check("community_visibility", sql`${t.visibility} IN ('private','public')`), check("community_contact", sql`${t.contact} IN ('requests','everyone','following','existing')`)]);
export const collectionItems = sqliteTable("collection_items", {
  id: text("id").primaryKey(), ownerId: owner(), catalogId: text("catalog_id").references((): AnySQLiteColumn => catalogProducts.id),
  listingId: text("listing_id").unique().references((): AnySQLiteColumn => products.id),
  title: text("title").notNull(), scale: text("scale").notNull(), maker: text("maker").notNull(), carMake: text("car_make").notNull().default(""), color: text("color").notNull().default(""),
  story: text("story").notNull().default(""), condition: text("condition").notNull().default(""),
  visibility: text("visibility").notNull().default("private"), availability: text("availability").notNull().default("not_for_sale"),
  photos: text("photos").notNull().default("[]"), privateNotes: text("private_notes").notNull().default(""), purchaseCost: text("purchase_cost").notNull().default(""),
  minimumCents: integer("minimum_cents").notNull().default(0), commentsEnabled: integer("comments_enabled").notNull().default(1), pinned: integer("pinned").notNull().default(0),
  version: integer("version").notNull().default(1), createdAt: created(),
}, t => [index("collection_owner").on(t.ownerId, t.visibility, t.availability), check("collection_visibility", sql`${t.visibility} IN ('private','public')`), check("collection_availability", sql`${t.availability} IN ('not_for_sale','open_to_offers','for_sale','reserved','previously_owned')`)]);
export const collectionShelves = sqliteTable("collection_shelves", { id: text("id").primaryKey(), ownerId: owner(), name: text("name").notNull(), createdAt: created() });
export const shelfMembers = sqliteTable("shelf_members", { id: text("id").primaryKey(), shelfId: text("shelf_id").notNull().references(() => collectionShelves.id, { onDelete: "cascade" }), itemId: text("item_id").notNull().references(() => collectionItems.id, { onDelete: "cascade" }) }, t => [uniqueIndex("shelf_piece").on(t.shelfId, t.itemId)]);
export const collectorRelationships = sqliteTable("collector_relationships", { id: text("id").primaryKey(), ownerId: owner(), targetId: text("target_id").notNull().references(() => user.id, { onDelete: "cascade" }), kind: text("kind").notNull(), createdAt: created() }, t => [uniqueIndex("collector_relationship").on(t.ownerId,t.targetId,t.kind), check("relationship_kind", sql`${t.kind} IN ('follow','mute','block')`)]);
export const communityPosts = sqliteTable("community_posts", {
  id: text("id").primaryKey(), ownerId: owner(), body: text("body").notNull(), photos: text("photos").notNull().default("[]"), topic: text("topic").notNull().default(""), prompt: text("prompt").notNull().default(""),
  catalogId: text("catalog_id").references((): AnySQLiteColumn => catalogProducts.id), itemId: text("item_id").references(() => collectionItems.id, { onDelete: "set null" }),
  commercial: integer("commercial").notNull().default(0), status: text("status").notNull().default("public"), createdAt: created(),
}, t => [index("community_feed").on(t.status,t.createdAt),index("community_model_posts").on(t.catalogId,t.status)]);
export const communityComments = sqliteTable("community_comments", { id: text("id").primaryKey(), ownerId: owner(), postId: text("post_id").references(() => communityPosts.id,{onDelete:"cascade"}), itemId: text("item_id").references(() => collectionItems.id,{onDelete:"cascade"}), body: text("body").notNull(), status: text("status").notNull().default("public"), createdAt: created() });
export const communityPostActions = sqliteTable("community_post_actions", { id: text("id").primaryKey(), ownerId: owner(), postId: text("post_id").notNull().references(() => communityPosts.id,{onDelete:"cascade"}), kind:text("kind").notNull(),createdAt:created() },t=>[uniqueIndex("post_action").on(t.ownerId,t.postId,t.kind),check("post_action_kind",sql`${t.kind} IN ('like','save','hide')`)]);
export const modelWishlist = sqliteTable("model_wishlist",{id:text("id").primaryKey(),ownerId:owner(),catalogId:text("catalog_id").notNull().references(():AnySQLiteColumn=>catalogProducts.id),createdAt:created()},t=>[uniqueIndex("model_wishlist_entry").on(t.ownerId,t.catalogId)]);
export const collectorThreads = sqliteTable("collector_threads",{id:text("id").primaryKey(),senderId:text("sender_id").notNull().references(()=>user.id,{onDelete:"cascade"}),recipientId:text("recipient_id").notNull().references(()=>user.id,{onDelete:"cascade"}),itemId:text("item_id").references(()=>collectionItems.id,{onDelete:"set null"}),reference:text("reference").notNull().default(""),status:text("status").notNull().default("request"),senderReadAt:integer("sender_read_at").notNull().default(0),recipientReadAt:integer("recipient_read_at").notNull().default(0),createdAt:created(),updatedAt:integer("updated_at").notNull()},t=>[index("collector_inbox").on(t.recipientId,t.updatedAt)]);
export const collectorMessages = sqliteTable("collector_messages",{id:text("id").primaryKey(),threadId:text("thread_id").notNull().references(()=>collectorThreads.id,{onDelete:"cascade"}),ownerId:owner(),body:text("body").notNull(),photoId:text("photo_id"),offerId:text("offer_id"),createdAt:created()},t=>[index("collector_thread_messages").on(t.threadId,t.createdAt)]);
export const communityMedia = sqliteTable("community_media",{id:text("id").primaryKey(),ownerId:owner(),itemId:text("item_id").references(()=>collectionItems.id,{onDelete:"cascade"}),postId:text("post_id").references(()=>communityPosts.id,{onDelete:"cascade"}),threadId:text("thread_id").references(()=>collectorThreads.id,{onDelete:"cascade"}),createdAt:created()});
export const communityNotifications = sqliteTable("community_notifications",{id:text("id").primaryKey(),ownerId:owner(),actorId:text("actor_id").references(()=>user.id,{onDelete:"cascade"}),category:text("category").notNull(),label:text("label").notNull(),href:text("href").notNull(),readAt:integer("read_at"),createdAt:created()},t=>[index("community_notification_owner").on(t.ownerId,t.createdAt)]);
export const communityReports = sqliteTable("community_reports",{id:text("id").primaryKey(),ownerId:owner(),targetType:text("target_type").notNull(),targetId:text("target_id").notNull(),reason:text("reason").notNull(),status:text("status").notNull().default("open"),reviewedBy:text("reviewed_by"),resolution:text("resolution").notNull().default(""),createdAt:created()});
export const communityEditorial = sqliteTable("community_editorial",{id:text("id").primaryKey(),title:text("title").notNull(),body:text("body").notNull(),topic:text("topic").notNull(),spotlightId:text("spotlight_id").references(()=>user.id,{onDelete:"set null"}),author:text("author").notNull(),createdAt:created()});
export const collectionOffers = sqliteTable("collection_offers",{
  id:text("id").primaryKey(),rootId:text("root_id").notNull(),itemId:text("item_id").references(()=>collectionItems.id,{onDelete:"set null"}),
  buyerId:text("buyer_id").notNull(),ownerId:text("owner_id").notNull(),proposerId:text("proposer_id").notNull(),threadId:text("thread_id").references(()=>collectorThreads.id,{onDelete:"set null"}),
  status:text("status").notNull().default("proposed"),priceCents:integer("price_cents").notNull(),currency:text("currency").notNull(),terms:text("terms").notNull(),itemVersion:integer("item_version").notNull(),destination:text("destination").notNull(),
  expiresAt:integer("expires_at").notNull(),paymentDeadline:integer("payment_deadline"),checkoutId:text("checkout_id"),createdAt:created(),
},t=>[uniqueIndex("one_buyer_offer").on(t.buyerId,t.itemId).where(sql`${t.status} IN ('proposed','reserved')`),uniqueIndex("one_piece_reservation").on(t.itemId).where(sql`${t.status}='reserved'`),check("offer_status",sql`${t.status} IN ('proposed','reserved','completed','withdrawn','declined','superseded','expired')`),check("offer_amount",sql`${t.priceCents}>=50`),index("offer_expiry").on(t.status,t.expiresAt)]);
export const collectionOfferCheckouts=sqliteTable("collection_offer_checkouts",{checkoutId:text("checkout_id").primaryKey(),offerId:text("offer_id").notNull().references(()=>collectionOffers.id,{onDelete:"restrict"})});
export const communityPaymentExceptions=sqliteTable("community_payment_exceptions",{sessionId:text("session_id").primaryKey(),offerId:text("offer_id").notNull(),reason:text("reason").notNull(),status:text("status").notNull().default("open"),createdAt:created()});
