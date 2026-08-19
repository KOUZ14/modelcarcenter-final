import { catalogErrorMessage, searchCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const sortParam = url.searchParams.get("sort");
    const result = await searchCatalog({
      q: url.searchParams.get("q") ?? "",
      scale: url.searchParams.get("scale") ?? "",
      manufacturer: url.searchParams.get("manufacturer") ?? "",
      seller: url.searchParams.get("seller") ?? "",
      condition: url.searchParams.get("condition") ?? "",
      sort: sortParam === "price_asc" || sortParam === "price_desc" ? sortParam : "newest",
      page: Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
      pageSize: Number.parseInt(url.searchParams.get("pageSize") ?? "12", 10) || 12,
    });
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: catalogErrorMessage(error) }, { status: 503 });
  }
}
