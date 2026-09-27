import { requireCollectorApi } from "@/lib/collector-auth";
import { commitInventoryCsv, previewStoreInventoryCsv, updateStoreStock } from "@/lib/csv-import";
import { readJsonObject, routeError } from "@/lib/http";
import {
  acceptCurrentSellerTerms,
  connectStorePayments,
  archiveStoreProduct,
  saveStoreProduct,
  saveStoreProfile,
  setStoreProductStatus,
  shipOwnedStoreOrder,
} from "@/lib/store";
import { cleanText, requiredString, ValidationError } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const account = await requireCollectorApi(request);
  if (account instanceof Response) return account;
  const store = account.seller;
  if (!store || store.sellerType !== "professional")
    return Response.json(
      { error: "This account is not connected to a professional store." },
      { status: 403 },
    );
  try {
    const payload = await readJsonObject(request);
    const action = requiredString(payload.action, "action", 40);
    if (action === "accept_seller_terms") {
      return Response.json({
        ok: true,
        ...(await acceptCurrentSellerTerms(
          store,
          requiredString(payload.sellerTermsVersion, "sellerTermsVersion", 40),
        )),
      });
    }
    if (action === "preview_import") {
      const preview = await previewStoreInventoryCsv(store.id, requiredCsv(payload.csv));
      return Response.json({
        ok: true,
        preview: { ...preview, validCount: preview.valid.length },
      });
    }
    if (store.status === "suspended" && action !== "ship_order")
      throw new ValidationError(
        "This store is suspended. Contact Model Car Center support.",
      );
    if (action === "commit_import") {
      return Response.json({
        ok: true,
        ...(await commitInventoryCsv(store.id, requiredCsv(payload.csv))),
      });
    }
    if (action === "connect_payments" || action === "refresh_payments") return Response.json({ ok: true, ...(await connectStorePayments(store, action === "refresh_payments")) });
    if (action === "update_stock") return Response.json({ ok: true, ...(await updateStoreStock(store.id, payload.rows)) });
    if (action === "save_product")
      return Response.json({
        ok: true,
        ...(await saveStoreProduct(store, payload)),
      });
    if (action === "product_status")
      return Response.json({
        ok: true,
        ...(await setStoreProductStatus(
          store,
          requiredString(payload.productId, "productId", 100),
          requiredString(payload.status, "status", 20),
        )),
      });
    if (action === "archive_product")
      return Response.json({
        ok: true,
        ...(await archiveStoreProduct(
          store,
          requiredString(payload.productId, "productId", 100),
        )),
      });
    if (action === "ship_order")
      return Response.json({
        ok: true,
        ...(await shipOwnedStoreOrder(account.user.id, payload)),
      });
    if (action === "save_store")
      return Response.json({
        ok: true,
        ...(await saveStoreProfile(store, payload)),
      });
    throw new ValidationError("Unknown store action.");
  } catch (error) {
    return routeError(error, "The store change could not be saved.");
  }
}

function requiredCsv(value: unknown) {
  const csv = typeof value === "string" ? value : "";
  if (!cleanText(csv, 5_000_000))
    throw new ValidationError("Choose a CSV inventory file.");
  return csv;
}
