import { requireCollectorApi } from "@/lib/collector-auth";
import { getStoreInventoryProduct } from "@/lib/store-inventory-data";
import { routeError } from "@/lib/http";

export async function GET(request: Request) {
  const account = await requireCollectorApi(request);
  if (account instanceof Response) return account;
  if (!account.seller || account.seller.sellerType !== "professional") return Response.json({ error: "This account is not connected to a store." }, { status: 403 });
  try {
    const id = new URL(request.url).searchParams.get("product");
    const product = id ? await getStoreInventoryProduct(account.seller.id, id) : null;
    return product ? Response.json({ product }, { headers: { "Cache-Control": "private, no-store" } }) : Response.json({ error: "This inventory item could not be found. Refresh inventory and try again." }, { status: 404 });
  } catch (error) { return routeError(error, "This inventory item could not be loaded. Please retry."); }
}
