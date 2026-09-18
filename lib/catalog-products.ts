import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { getD1, getDb } from "@/db";
import { catalogProducts } from "@/db/schema";
import { cleanText, ValidationError } from "./validation";
import { CatalogMatchRequired, catalogListingSnapshot, manufacturerKey, parseCatalogProduct, type CatalogIdentity, type CatalogModel } from "./catalog-product-rules";

const visibleCatalog = and(ne(catalogProducts.catalogStatus, "archived"), isNull(catalogProducts.mergedIntoId));

export async function getCatalogProduct(id: string): Promise<CatalogModel | null> {
  const visited = new Set<string>();
  for (let depth = 0; depth < 10 && !visited.has(id); depth++) {
    visited.add(id);
    const [row] = await getDb().select().from(catalogProducts).where(eq(catalogProducts.id, id)).limit(1);
    if (!row) return null;
    if (row.mergedIntoId) { id = row.mergedIntoId; continue; }
    return row.catalogStatus === "archived" ? null : row;
  }
  return null;
}

export async function searchCatalogProducts(query: string) {
  const terms = cleanText(query, 200).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
  const conditions = terms.map((term) => {
    const needle = `%${term.replace(/[!%_]/g, (character) => `!${character}`)}%`;
    const makerNeedle = `%${manufacturerKey(term).replace(/[!%_]/g, (character) => `!${character}`)}%`;
    const textMatch = sql`lower(${catalogProducts.title} || ' ' || coalesce(${catalogProducts.manufacturerSku}, '') || ' ' || coalesce(${catalogProducts.upc}, '') || ' ' || coalesce(${catalogProducts.ean}, '') || ' ' || coalesce(${catalogProducts.gtinKey}, '') || ' ' || coalesce(${catalogProducts.livery}, '')) LIKE ${needle} ESCAPE '!'`;
    return manufacturerKey(term) ? or(textMatch, sql`${catalogProducts.manufacturerKey} LIKE ${makerNeedle} ESCAPE '!'`)! : textMatch;
  });
  return getDb().select().from(catalogProducts).where(and(visibleCatalog, ...conditions))
    .orderBy(desc(sql`CASE WHEN ${catalogProducts.skuKey} = ${query.trim().toLowerCase()} THEN 1 ELSE 0 END`), asc(catalogProducts.title), asc(catalogProducts.id)).limit(20);
}

async function exactCatalogMatch(identity: CatalogIdentity) {
  const identifiers = [];
  if (identity.skuKey) identifiers.push(and(eq(catalogProducts.manufacturerKey, identity.manufacturerKey), eq(catalogProducts.skuKey, identity.skuKey))!);
  if (identity.gtinKey) identifiers.push(eq(catalogProducts.gtinKey, identity.gtinKey));
  if (!identifiers.length) return null;
  const rows = await getDb().select().from(catalogProducts).where(or(...identifiers)).limit(100);
  const resolved = await Promise.all(rows.map((row) => getCatalogProduct(row.id)));
  if (resolved.some((row) => !row)) throw new ValidationError("This identifier belongs to an archived catalog model. Contact support.");
  const compatible = (row: CatalogModel) => (["scale","vehicleMake","vehicleModel","vehicleVariant","color","livery","edition","packagingVariant","versionKind","setContents"] as const)
    .every(field => String(row[field] ?? "").trim().toLowerCase() === String(identity[field] ?? "").trim().toLowerCase());
  // A supplier SKU may identify an assortment, several colors, or regular/chase
  // variants. Reuse requires matching the complete specified collectible identity.
  const candidates = resolved.filter((row): row is CatalogModel => row !== null);
  if (identity.gtinKey && candidates.some(row=>row.gtinKey===identity.gtinKey && !compatible(row))) throw new ValidationError("This barcode belongs to a different collectible variant. Check the identity or request a catalog correction.");
  const unique = [...new Map(candidates.filter(compatible).map((row) => [row.id, row])).values()];
  if (unique.length > 1) throw new ValidationError("The manufacturer SKU and barcode match different catalog models. Check the identifiers before continuing.");
  const match = unique[0] ?? null;
  if (match && identity.gtinKey && match.gtinKey && identity.gtinKey !== match.gtinKey) throw new ValidationError("This SKU has a different barcode in the catalog. Check the identifiers.");
  // A reused barcode must not silently override an explicitly different SKU.
  if (match && (match.manufacturerKey !== identity.manufacturerKey || (identity.skuKey && match.skuKey && identity.skuKey !== match.skuKey))) throw new ValidationError("This barcode belongs to a different manufacturer or SKU. Check the identifiers.");
  return match;
}

export async function matchCatalogProduct(payload: Record<string, unknown>) {
  const identity = parseCatalogProduct(payload);
  const exact = await exactCatalogMatch(identity);
  if (exact) return { exact, similar: [] as CatalogModel[] };
  const rows = await getDb().select().from(catalogProducts).where(and(
    visibleCatalog,
    eq(catalogProducts.manufacturerKey, identity.manufacturerKey),
    eq(catalogProducts.scale, identity.scale),
    sql`lower(trim(${catalogProducts.vehicleMake})) = ${identity.vehicleMake.toLowerCase()}`,
    sql`lower(trim(${catalogProducts.vehicleModel})) = ${identity.vehicleModel.toLowerCase()}`,
  )).orderBy(asc(catalogProducts.title)).limit(50);
  // Attributes are suggestions only, including visually identical SKU-less editions.
  const similar = rows.filter((row) => !identity.skuKey || !row.skuKey || identity.skuKey === row.skuKey)
    .sort((a, b) => similarityScore(b, identity) - similarityScore(a, identity)).slice(0, 8);
  return { exact: null, similar };
}

function similarityScore(row: CatalogIdentity, identity: CatalogIdentity) {
  return (["vehicleVariant", "color", "livery", "vehicleYear", "releaseYear"] as const)
    .reduce((score, field) => score + Number((row[field] ?? "").toLowerCase() === (identity[field] ?? "").toLowerCase()), 0);
}

export async function prepareListingCatalog(payload: Record<string, unknown>, createdByUserId: string | null, existingCatalogId?: string | null) {
  const selectedId = cleanText(payload.catalogProductId, 100) || existingCatalogId;
  if (selectedId) {
    if (existingCatalogId && selectedId !== existingCatalogId) throw new ValidationError("An existing listing cannot be moved to another model. Create a new listing for a different model.");
    const model = await getCatalogProduct(selectedId);
    if (!model) throw new ValidationError("Choose an available catalog model.");
    return { model, createdByUserId, isNew: false };
  }
  const identity = parseCatalogProduct(payload);
  const matches = await matchCatalogProduct(payload);
  if (matches.exact) return { model: matches.exact, createdByUserId, isNew: false };
  if (matches.similar.length && payload.confirmDifferentModel !== true && payload.confirmDifferentModel !== "true") throw new CatalogMatchRequired(matches.similar);
  return { model: { ...identity, id: crypto.randomUUID(), primaryImageUrl: null, catalogStatus: "unverified" } satisfies CatalogModel, createdByUserId, isNew: true };
}

export function listingPayloadWithCatalog(payload: Record<string, unknown>, model: CatalogModel) {
  return { ...payload, ...catalogListingSnapshot(model), title: cleanText(payload.title, 200) || model.title.slice(0, 200) };
}

// Catalog creation and the listing write commit together. Unique indexes arbitrate
// concurrent SKU/barcode creates; the losing request retries against the winner.
export async function persistCatalogListing(
  prepared: Awaited<ReturnType<typeof prepareListingCatalog>>,
  listingWrite: (model: CatalogModel) => { sql: string; params: unknown[] },
  additionalWrites?: (model: CatalogModel) => Array<{ sql: string; params: unknown[] }>,
) {
  const d1 = getD1();
  const statement = (query: { sql: string; params: unknown[] }) => d1.prepare(query.sql).bind(...query.params);
  const writes = (model: CatalogModel) => [statement(listingWrite(model)), ...(additionalWrites?.(model) ?? []).map(statement)];
  if (!prepared.isNew) { await d1.batch(writes(prepared.model)); return prepared.model; }
  const model = prepared.model;
  const create = getDb().insert(catalogProducts).values({ ...model, catalogStatus: "unverified", createdByUserId: prepared.createdByUserId }).toSQL();
  try {
    await d1.batch([statement(create), ...writes(model)]);
    return model;
  } catch (error) {
    const message = String(error instanceof Error ? `${error.message} ${error.cause ?? ""}` : error);
    if (!message.includes("UNIQUE constraint failed") || (!message.includes("catalog_products.") && !message.includes("catalog_sku_identity_unique"))) throw error;
    const winner = await exactCatalogMatch(model);
    if (!winner) throw error;
    await d1.batch(writes(winner));
    return winner;
  }
}
