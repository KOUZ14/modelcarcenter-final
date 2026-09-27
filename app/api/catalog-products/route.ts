import { matchCatalogProduct, searchCatalogProducts } from "@/lib/catalog-products";
import { readJsonObject, routeError } from "@/lib/http";

export const dynamic = "force-dynamic";

// Catalog discovery includes models with no active listings. These endpoints are
// read-only; creation is authorized and committed with a seller's listing.
export async function GET(request: Request) {
  try {
    return Response.json({ products: await searchCatalogProducts(new URL(request.url).searchParams.get("q") ?? "") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error, "The model catalog is temporarily unavailable."); }
}

export async function POST(request: Request) {
  try {
    return Response.json(await matchCatalogProduct(await readJsonObject(request)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeError(error, "Catalog matching is temporarily unavailable."); }
}
