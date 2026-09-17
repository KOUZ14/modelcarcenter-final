import { getCatalogListings } from "@/lib/catalog";
import { routeError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const result = await getCatalogListings((await params).id);
    return result ? Response.json(result, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Model not found." }, { status: 404 });
  } catch (error) { return routeError(error, "Seller listings are temporarily unavailable."); }
}
