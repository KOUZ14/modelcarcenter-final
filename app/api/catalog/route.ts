import { catalogErrorMessage, searchCatalog } from "@/lib/catalog";
import { readMarketplaceFilters } from "@/lib/discovery";
import { ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const result = await searchCatalog({
      ...readMarketplaceFilters(url.searchParams),
      pageSize: Number.parseInt(url.searchParams.get("pageSize") ?? "12", 10) || 12,
    });
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) {
    if (error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
    console.error(error);
    return Response.json({ error: catalogErrorMessage(error) }, { status: 503 });
  }
}
