import { requireAdminApi } from "@/lib/admin-auth";
import { inventoryCsvTemplate } from "@/lib/csv-import";

export async function GET() {
  const identity = await requireAdminApi();
  if (identity instanceof Response) return identity;
  return new Response(inventoryCsvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=model-car-center-inventory-template.csv",
    },
  });
}
