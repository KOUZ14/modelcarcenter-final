"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { trackEvent } from "@/lib/analytics-client";
import { coaStatuses, modelConditions, originalBoxStatuses, packagingConditions } from "@/lib/validation";
import { useTaskMeasurement } from "./use-task-measurement";
import "./seller-inventory-upload.css";

type ImportRow = { rowNumber: number; sellerSku: string; title: string; priceCents: number; inventoryQuantity: number; operation?: string };
type Preview = { valid: ImportRow[]; validCount: number; errors: Array<{ row: number; errors: string[] }> };
type Action = (payload: Record<string, unknown>, options?: { reload?: boolean; message?: string }) => Promise<Record<string, unknown>>;

export function SellerInventoryUpload({ disabled, action, expanded = false }: { disabled: boolean; action: Action; expanded?: boolean }) {
  const task = useTaskMeasurement("import");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState<"reading" | "checking" | "saving" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inFlight = useRef(false);
  const busy = pending !== null;
  const newCount = preview?.valid.filter(row => row.operation !== "update").length ?? 0;
  const updateCount = preview?.valid.filter(row => row.operation === "update").length ?? 0;
  const canSave = Boolean(preview?.valid.length && !preview.errors.length);
  const exampleRow = preview?.valid.some(row => row.sellerSku === "SKU-001" && row.title === "Example model");

  function change(value: string) {
    task.start();
    setCsv(value); setPreview(null); setSuccess(""); setError("");
  }
  async function check(value: string) {
    setPending("checking");
    const response = await action({ action: "preview_import", csv: value }, { message: "" });
    const result = response.preview as Preview;
    setPreview(result);
    trackEvent("inventory_import", { step: "preview", result: result.errors.length ? "errors" : "ready", count: result.valid.length });
  }
  async function read(file?: File) {
    if (!file || disabled || inFlight.current) return;
    change(""); setFileName("");
    if (!/\.csv$/i.test(file.name)) { setError("Choose a .csv file. In Excel or Google Sheets, save or download your spreadsheet as CSV first."); return; }
    if (file.size > 5_000_000) { setError("Choose a CSV smaller than 5 MB. Split larger spreadsheets into separate files."); return; }
    inFlight.current = true; setPending("reading");
    try {
      let value: string;
      try { value = await file.text(); }
      catch { throw new Error("We could not read this file. Try exporting it as UTF-8 CSV again."); }
      setFileName(file.name); setCsv(value);
      if (!value.trim()) throw new Error("This file is empty. Add your column headings and at least one model, then choose the file again.");
      await check(value);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The file could not be checked. Try again.");
    } finally { inFlight.current = false; setPending(null); }
  }
  async function validate() {
    if (disabled || inFlight.current || !csv.trim()) return;
    inFlight.current = true; setError(""); setPreview(null);
    try { await check(csv); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The preview could not be loaded. Try again."); }
    finally { inFlight.current = false; setPending(null); }
  }
  async function commit() {
    if (disabled || inFlight.current || !canSave) return;
    inFlight.current = true; setPending("saving"); setError("");
    try {
      const result = await action({ action: "commit_import", csv }, { message: "" });
      task.complete();
      const created = Number(result.created), updated = Number(result.updated);
      setSuccess([created ? `${created} new ${created === 1 ? "draft created" : "drafts created"}` : "", updated ? `${updated} existing ${updated === 1 ? "listing updated" : "listings updated"}` : ""].filter(Boolean).join(". ") + ".");
      setPreview(null); setCsv(""); setFileName("");
      trackEvent("inventory_import", { step: "saved", result: "success", count: Number(result.imported) });
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Inventory could not be saved. Review the file and try again."); trackEvent("inventory_import", { step: "saved", result: "error" }); }
    finally { inFlight.current = false; setPending(null); }
  }
  return <details className="store-panel store-importer seller-csv-import" id="inventory-upload" open={expanded || undefined}>
    <summary>Import inventory from a spreadsheet</summary>
    <p>Add several models at once or update listings using their seller SKU. You’ll review the changes before saving.</p>
    {success && <div className="csv-success" role="status">
      <h3>Import complete</h3><p>{success}</p>
      <p>Review your inventory next. New drafts need photos and condition checks before you can publish them.</p>
      <a className="button dark small" href="/store?view=inventory">Review saved inventory</a>
    </div>}
    <div className="csv-prepare-grid">
      <section className="csv-step" aria-labelledby="csv-prepare-heading">
        <h3 id="csv-prepare-heading"><span className="csv-step-number">1</span> Prepare your spreadsheet</h3>
        <p>Open the template in Excel or Google Sheets. Keep the column headings and replace the example row with your models, one per row.</p>
        <a className="button outline small" href="/api/store/inventory-template">Download CSV template</a>
        <p className="csv-hint">Includes one example model. Replace or delete it before importing.</p>
      </section>
      <section className="csv-step" aria-labelledby="csv-file-heading">
        <h3 id="csv-file-heading"><span className="csv-step-number">2</span> Choose your CSV</h3>
        <p>Save or download your spreadsheet as <b>CSV UTF-8</b>. We’ll check the file and show a preview automatically.</p>
        <label className="csv-file-picker">
          <span className="button dark small">{fileName ? "Choose a different CSV" : "Choose CSV file"}</span>
          <input aria-label="Choose inventory CSV" type="file" accept=".csv,text/csv" disabled={disabled || busy} onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void read(file);
          }} />
        </label>
        <p className="csv-hint" role="status">{pending === "reading" ? "Reading your file…" : pending === "checking" ? "Checking your inventory…" : fileName ? <>Selected: <b>{fileName}</b></> : "Up to 5 MB · 5,000 models per file"}</p>
      </section>
    </div>
    <details className="csv-guide">
      <summary>Column guide &amp; accepted values</summary>
      <p>Fill in every required column below. Use the exact values shown for condition and packaging fields.</p>
      <dl className="csv-column-guide">
        <div><dt>seller_sku</dt><dd>Your unique stock code, such as PORSCHE-911-01. Keep it the same on future uploads. Matching ignores letter casing.</dd></div>
        <div><dt>title, scale, model_manufacturer, vehicle_make, vehicle_model</dt><dd>For example: Porsche 911 Silver, 1:18, AUTOart, Porsche, 911.</dd></div>
        <div><dt>price, inventory_quantity</dt><dd>Price in USD, such as 249.95. Total stock as a whole number, such as 2. Include units reserved for buyers.</dd></div>
        <div><dt>model_condition</dt><dd>{modelConditions.join(", ")}</dd></div>
        <div><dt>packaging_condition</dt><dd>{packagingConditions.join(", ")}</dd></div>
        <div><dt>original_box</dt><dd>{originalBoxStatuses.join(", ")}</dd></div>
        <div><dt>coa</dt><dd>Certificate of authenticity: {coaStatuses.join(", ")}.</dd></div>
        <div><dt>missing_parts, defects, restoration_customization</dt><dd>Describe each honestly, or use “None known” when appropriate.</dd></div>
        <div><dt>material, accessories</dt><dd>For example: Die-cast metal and Display base. Use “None” if no accessories are included.</dd></div>
      </dl>
      <p><b>Optional:</b> description, vehicle_year, color, product_number, edition_serial, provenance, keywords. Keep availability_type as in_stock (or blank), and leave release_date blank. Use the listing form for preorders. Add photos after importing.</p>
    </details>
    {(fileName || csv) && <details className="csv-editor">
      <summary>Edit CSV text (advanced)</summary>
      <p>It’s usually easier to correct your spreadsheet and choose the exported file again. Text changes here must be checked again before saving.</p>
      <label className="seller-import-editor">CSV contents<textarea value={csv} onChange={event => change(event.target.value)} spellCheck={false} disabled={busy || disabled} /></label>
    </details>}
    {error && <div className="csv-errors" role="alert"><b>We couldn’t finish this import</b><p>{error}</p><p>Correct your spreadsheet and choose the file again.{csv && !preview ? " You can also retry the check below." : ""}</p></div>}
    {csv && !preview && <div className="csv-recheck"><button type="button" className="button outline small" disabled={disabled || busy || !csv.trim()} onClick={() => void validate()}>{pending === "checking" ? "Checking inventory…" : "Check file again"}</button><p>Check the current file to enable saving. Your inventory has not changed.</p></div>}
    <section className="csv-review csv-step" aria-labelledby="csv-review-heading" aria-busy={busy}>
      <h3 id="csv-review-heading"><span className="csv-step-number">3</span> Review &amp; save</h3>
      {!preview && <p className="csv-hint">{success ? "Choose another file to start a new import." : busy ? "Your preview will appear here when the check is complete." : "Your preview will appear here after you choose a CSV. Choosing a file does not save changes."}</p>}
      {preview && <>
        <div className="csv-counts" role="status">
          <div><strong>{newCount}</strong><span>New {newCount === 1 ? "draft" : "drafts"}</span></div>
          <div><strong>{updateCount}</strong><span>{updateCount === 1 ? "Listing to update" : "Listings to update"}</span></div>
          <div className={preview.errors.length ? "csv-count-errors" : ""}><strong>{preview.errors.length}</strong><span>{preview.errors.length === 1 ? "Row to fix" : "Rows to fix"}</span></div>
        </div>
        <p><b>{canSave ? "Ready to import." : "Fix the errors below before saving."}</b> Nothing has been saved yet.</p>
        {exampleRow && <p className="csv-notice"><b>This file contains the template’s example model.</b> Replace or delete the “SKU-001 / Example model” row in your spreadsheet unless you intended to import it.</p>}
        {preview.errors.length > 0 && <div className="csv-errors" role="alert">
          <p><b>Correct these rows in your spreadsheet, export it as CSV, then choose the file again.</b> No rows will be saved until every error is fixed.</p>
          <ul>{preview.errors.map(row => <li key={row.row}><b>Row {row.row}</b><ul>{row.errors.map((message, index) => <li key={index}>{message}</li>)}</ul></li>)}</ul>
        </div>}
        {preview.valid.length > 0 && <div className="csv-table-wrap">
          <table className="csv-preview-table">
            <caption>{preview.valid.length} {preview.valid.length === 1 ? "model" : "models"} checked successfully{preview.valid.length > 100 ? " · showing the first 100" : ""}</caption>
            <thead><tr><th scope="col">CSV row</th><th scope="col">Model / seller SKU</th><th scope="col">Price (USD)</th><th scope="col">Total stock</th><th scope="col">On save</th></tr></thead>
            <tbody>{preview.valid.slice(0, 100).map(row => <tr key={row.rowNumber}>
              <td data-label="CSV row">{row.rowNumber}</td>
              <th scope="row"><b>{row.title}</b><span className="csv-sku">{row.sellerSku}</span></th>
              <td data-label="Price (USD)" className="csv-numeric">{formatMoney(row.priceCents)}</td>
              <td data-label="Total stock" className="csv-numeric">{row.inventoryQuantity} {row.inventoryQuantity === 1 ? "unit" : "units"}</td>
              <td data-label="On save"><span className={`csv-operation ${row.operation === "update" ? "is-update" : "is-new"}`}>{row.operation === "update" ? "Update listing" : "Create draft"}</span></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {updateCount > 0 && <p className="csv-notice"><b>Matching SKUs update existing listings.</b> Imported details and prices replace the saved values, and blank optional fields can clear existing information. Total stock replaces the current quantity; it is not added to it. Photos stay in place. Published listings stay published, and sold-out listings may return to sale when restocked.</p>}
        <div className="csv-save-actions">
          <button type="button" className="button dark small" disabled={disabled || busy || !canSave} onClick={() => void commit()}>{pending === "saving" ? "Saving inventory…" : `Save ${preview.valid.length} ${preview.valid.length === 1 ? "model" : "models"} to inventory`}</button>
          <p>New models are saved as drafts. Add photos, check their condition details and complete <Link href="/store?view=settings">store setup</Link> before publishing.</p>
        </div>
      </>}
    </section>
    <p className="csv-manual-note"><b>Stock is managed manually.</b> CSV imports do not sync with other websites. If a model sells elsewhere, update its stock here.</p>
  </details>;
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
