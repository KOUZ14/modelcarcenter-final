import { requireCollectorApi } from "@/lib/collector-auth";
import { inventoryCsvTemplate } from "@/lib/csv-import";

export async function GET(request: Request) {
  const account = await requireCollectorApi(request);
  if (account instanceof Response) return account;
  if (account.seller?.sellerType !== "professional")
    return Response.json(
      { error: "This account is not connected to a professional store." },
      { status: 403 },
    );
  return new Response(inventoryCsvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="model-car-center-inventory-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
