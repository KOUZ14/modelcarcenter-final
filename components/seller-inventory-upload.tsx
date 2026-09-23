"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { trackEvent } from "@/lib/analytics-client";
import { useTaskMeasurement } from "./use-task-measurement";

type ImportRow = { rowNumber: number; sellerSku: string; title: string; priceCents: number; inventoryQuantity: number; operation?: string };
type Preview = { valid: ImportRow[]; validCount: number; errors: Array<{ row: number; errors: string[] }> };
type Action = (payload: Record<string, unknown>, options?: { reload?: boolean; message?: string }) => Promise<Record<string, unknown>>;

export function SellerInventoryUpload({ disabled, action, expanded = false }: { disabled: boolean; action: Action; expanded?: boolean }) {
  const task = useTaskMeasurement("import");
  const [csv, setCsv] = useState(""); const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  function change(value: string) { task.start(); setCsv(value); setPreview(null); setSuccess(""); setError(""); }
  async function read(file?: File) {
    if (!file) { change(""); return; }
    if (file.size > 5_000_000) { setError("Choose a CSV smaller than 5 MB."); return; }
    try { change(await file.text()); } catch { setError("We could not read this file. Try exporting it as UTF-8 CSV again."); }
  }
  async function validate() {
    setBusy(true); setError("");
    try { const response = await action({ action: "preview_import", csv }, { message: "Preview ready. No inventory has changed yet." }); const result = response.preview as Preview; setPreview(result); trackEvent("inventory_import", { step: "preview", result: result.errors.length ? "errors" : "ready", count: result.valid.length }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The preview could not be loaded. Try again."); }
    finally { setBusy(false); }
  }
  async function commit() {
    setBusy(true); setError("");
    try { const result = await action({ action: "commit_import", csv }, { message: "Inventory saved." }); task.complete(); const message = `${result.created} new drafts created; ${result.updated} existing listings updated. Add photos and check each draft before publishing.`; setSuccess(message); setPreview(null); setCsv(""); trackEvent("inventory_import", { step: "saved", result: "success", count: Number(result.imported) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Inventory could not be saved. Review the file and try again."); trackEvent("inventory_import", { step: "saved", result: "error" }); }
    finally { setBusy(false); }
  }
  return <details className="store-panel store-importer" id="inventory-upload" open={expanded || undefined}><summary>Upload inventory from a spreadsheet</summary><p>Export your spreadsheet as UTF-8 CSV, up to 5 MB and 5,000 rows. New seller SKUs create drafts. Reusing the same SKU updates that item in your store, including when letter casing changes. Keep SKUs stable to avoid duplicate listings.</p><p><b>Stock is updated manually.</b> Uploads do not synchronize stock with other websites. If an item sells elsewhere, reduce its quantity here immediately. Upload quantity is your total stock, including reserved units.</p><div className="store-import-controls"><a className="button outline small" href="/api/store/inventory-template">Download template with example row</a><label className="button outline small">Choose CSV<input type="file" accept=".csv,text/csv" disabled={disabled || busy} onChange={event => void read(event.target.files?.[0])} /></label></div><details><summary>Required columns and example</summary><p>seller_sku, title, scale, model_manufacturer, vehicle_make, vehicle_model, model_condition, packaging_condition, original_box, missing_parts, defects, restoration_customization, material, coa, accessories, price, inventory_quantity.</p><p>For example: SKU-001 · Porsche 911 · 1:18 · AUTOart · $249.95 · 2 units. The downloaded template includes every field and valid condition values. Prices use dollars without currency symbols. Quantity is a whole number. Use the listing form for preorders.</p></details>{csv && <label className="seller-import-editor">Review or correct your CSV before saving<textarea value={csv} onChange={event => change(event.target.value)} spellCheck={false} disabled={busy || disabled} /></label>}<button className="button dark small" disabled={disabled || busy || !csv.trim()} onClick={() => void validate()}>{busy ? "Working…" : "Preview inventory"}</button>{!csv && !success && <p>Choose a CSV to enable preview. Nothing is published by this upload.</p>}{error && <p className="form-error" role="alert">{error}</p>}{success && <div role="status"><p>{success}</p><a className="button outline small" href="/store?view=inventory">Review saved inventory</a></div>}{preview && <div className="import-preview"><p><b>{preview.valid.length} valid rows</b> · {preview.errors.length} rows need changes. Nothing has been saved yet.</p>{preview.errors.length > 0 && <div role="alert">{preview.errors.map(row => <p className="form-error" key={row.row}><b>Row {row.row}:</b> {row.errors.join("; ")}</p>)}<p>Correct the CSV above or upload a corrected file, then preview again.</p></div>}{preview.valid.length > 0 && <div className="admin-table-wrap"><table><thead><tr><th>Row</th><th>Seller SKU</th><th>Model</th><th>Price</th><th>Total stock</th><th>Result</th></tr></thead><tbody>{preview.valid.slice(0, 100).map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.sellerSku}</td><td>{row.title}</td><td>{formatMoney(row.priceCents)}</td><td>{row.inventoryQuantity}</td><td>{row.operation === "update" ? "Update existing listing" : "Create draft"}</td></tr>)}</tbody></table>{preview.valid.length > 100 && <p>Showing the first 100 valid rows. All {preview.valid.length} rows will be saved.</p>}</div>}<button className="button dark small" disabled={disabled || busy || preview.errors.length > 0 || preview.valid.length < 1} onClick={() => void commit()}>Save {preview.valid.length} inventory rows</button>{preview.errors.length > 0 && <p>Fix every row error to enable saving.</p>}<p>New drafts need photos, condition checks, and <Link href="/store">store setup</Link> before publishing. Existing listings keep their publication status.</p></div>}</details>;
}

export function SellerBulkStock({ products, disabled, action, expanded = false }: { products: Array<{ id: string; sellerSku: string; title: string; priceCents: number; inventoryQuantity: number; reservedQuantity: number; availabilityType: string }>; disabled: boolean; action: Action; expanded?: boolean }) {
  const [changes, setChanges] = useState<Record<string, { price: string; inventoryQuantity: string }>>({}); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const rows = products.filter(product => product.availabilityType !== "preorder");
  async function save() {
    setBusy(true); setError("");
    try { await action({ action: "update_stock", rows: Object.entries(changes).map(([id, values]) => ({ id, ...values })) }, { reload: true, message: "Stock and prices updated." }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Stock could not be saved. Try again."); }
    finally { setBusy(false); }
  }
  return <details className="store-panel seller-bulk-stock" open={expanded || undefined}><summary>Update stock &amp; price</summary><p>Sold a model elsewhere? Reduce its stock here. There is no automatic stock synchronization. Total stock includes reserved units and cannot be lower than those reservations. New changes apply to future purchases.</p>{rows.length ? <><div className="admin-table-wrap"><table><thead><tr><th>Model / SKU</th><th>Price (USD)</th><th>Total stock</th><th>Reserved</th></tr></thead><tbody>{rows.map(product => { const value = changes[product.id] ?? { price: (product.priceCents / 100).toFixed(2), inventoryQuantity: String(product.inventoryQuantity) }; return <tr key={product.id}><td><b>{product.title}</b><small>{product.sellerSku}</small></td><td data-label="Price (USD)"><input aria-label={`Price for ${product.sellerSku}`} type="number" min="0" step="0.01" disabled={disabled || busy} value={value.price} onChange={event => setChanges(previous => ({ ...previous, [product.id]: { ...value, price: event.target.value } }))} /></td><td data-label="Total stock"><input aria-label={`Total stock for ${product.sellerSku}`} type="number" min={product.reservedQuantity} step="1" disabled={disabled || busy} value={value.inventoryQuantity} onChange={event => setChanges(previous => ({ ...previous, [product.id]: { ...value, inventoryQuantity: event.target.value } }))} /></td><td data-label="Reserved">{product.reservedQuantity}</td></tr>; })}</tbody></table></div><button className="button dark small" disabled={disabled || busy || !Object.keys(changes).length} onClick={() => void save()}>{busy ? "Saving…" : `Save ${Object.keys(changes).length} changed items`}</button>{!Object.keys(changes).length && <p>Change a price or stock quantity to enable saving.</p>}</> : <p>Add or upload in-stock models first. Preorder quantities are managed in Preorders.</p>}{error && <p className="form-error" role="alert">{error}</p>}</details>;
}
