import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { products, sellers } from "@/db/schema";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = config.siteUrl;
  const staticRoutes = ["", "/sell", "/terms", "/privacy", "/returns", "/seller-terms", "/contact"].map((path) => ({ url: `${base}${path}`, changeFrequency: path ? "monthly" as const : "daily" as const, priority: path ? 0.5 : 1 }));
  try {
    const db = getDb();
    const [productRows, sellerRows] = await Promise.all([
      db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).innerJoin(sellers, eq(products.sellerId, sellers.id)).where(and(eq(products.status, "active"), eq(sellers.status, "active"))),
      db.select({ slug: sellers.slug, updatedAt: sellers.updatedAt }).from(sellers).where(eq(sellers.status, "active")),
    ]);
    return [...staticRoutes, ...productRows.map((row) => ({ url: `${base}/products/${row.slug}`, lastModified: row.updatedAt, changeFrequency: "weekly" as const, priority: .8 })), ...sellerRows.map((row) => ({ url: `${base}/sellers/${row.slug}`, lastModified: row.updatedAt, changeFrequency: "weekly" as const, priority: .7 }))];
  } catch { return staticRoutes; }
}
