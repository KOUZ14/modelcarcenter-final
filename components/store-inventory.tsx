"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Product, StoreData } from "./store-dashboard";
import { StoreProductEditor } from "./store-product-editor";
import { SellerInventoryUpload, SellerBulkStock } from "./seller-inventory-upload";
import { SellerThumbnail } from "./seller-setup";
import { SellerFeeDisclosure } from "./seller-fee-disclosure";
import { StoreSetupNotice } from "./store-setup-notice";
import { inventoryStatusLabel, storeListingIssues } from "@/lib/store-listing-readiness";
import { formatMoney } from "@/lib/format";
import { storeRequest } from "@/lib/store-client";
import { matchesInventoryView } from "@/lib/seller-hub";
import { PreorderSeller } from "./preorder-seller";
import { useDialogFocus } from "./use-dialog-focus";
import "./store-inventory.css";

export type InventoryPage = { page: number; pageSize: number; total: number; totalInventory: number; counts: Record<string, number>; search: string; filter: string; stock: string };
export type StoreAction = (payload: Record<string, unknown>, options?: { reload?: boolean; message?: string }) => Promise<Record<string, unknown>>;
const tabs = [["all", "All items"], ["draft", "Drafts"], ["listed", "Listed"], ["inactive", "Unpublished"], ["attention", "Needs attention"]] as const;

export function StoreInventory({ data, initialProductId, initialFilter, initialPreorderId, action }: {
  data: StoreData; initialProductId?: string; initialFilter?: string; initialPreorderId?: string; action: StoreAction;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const page = data.inventoryPage;
  const disabled = data.store.status === "suspended";
  const initial = data.inventoryEditor ?? data.inventory.find(row => row.id === initialProductId);
  const [editing, setEditing] = useState<Product | "new" | null>(disabled ? null : initialProductId === "new" ? "new" : initial && initial.detailsLoaded !== false ? initial : null);
  const [preorder, setPreorder] = useState<Product | null>(data.inventoryPreorder ?? data.inventory.find(row => row.id === initialPreorderId) ?? null);
  const [search, setSearch] = useState(page?.search ?? "");
  const [filter, setFilter] = useState(page?.filter ?? (tabs.some(([key]) => key === initialFilter) ? initialFilter! : "all"));
  const [stock, setStock] = useState(page?.stock ?? (["slow", "low", "out", "preorders"].includes(initialFilter ?? "") ? initialFilter! : "all"));
  const [chosenTool, setTool] = useState<string | null>(initialFilter === "import" || initialFilter === "bulk" ? initialFilter : null);
  const hash = useSyncExternalStore(onChange => { window.addEventListener("hashchange", onChange); return () => window.removeEventListener("hashchange", onChange); }, () => window.location.hash, () => "");
  const tool = chosenTool ?? (hash === "#inventory-upload" ? "import" : "");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const operation = useRef(false);
  const loadedKey = page ? `${page.page}-${page.search}-${page.filter}-${page.stock}` : "local";
  function navigate(next: { filter?: string; stock?: string; search?: string; page?: number }) {
    if (operation.current) return;
    const query = new URLSearchParams({ view: "inventory", filter: next.filter ?? filter, stock: next.stock ?? stock });
    const term = next.search ?? search;
    if (term) query.set("q", term);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    setFilter(next.filter ?? filter); setStock(next.stock ?? stock); setSelected([]); setTool("");
    router.push(`/store?${query}`, { scroll: false });
  }
  const issueMap = new Map(data.inventory.map(row => [row.id, row.issues ?? storeListingIssues({ ...row, preorderCapacity: row.preorder?.capacity }, row.images)]));
  const localMatch = (row: Product, view: string) => view === "all" || (view === "listed" ? ["active", "sold_out"].includes(row.status) : view === "attention" ? Object.keys(issueMap.get(row.id) ?? {}).length > 0 || row.status === "rejected" : view === "draft" ? ["draft", "pending_review"].includes(row.status) : row.status === view);
  const visible = page ? data.inventory : data.inventory.filter(row => localMatch(row, filter) && `${row.title} ${row.sellerSku} ${row.vehicleMake} ${row.vehicleModel}`.toLowerCase().includes(search.toLowerCase()) && matchesInventoryView(row, stock, data.hub.slowIds));
  const selectedRows = visible.filter(row => selected.includes(row.id) && row.availabilityType !== "preorder");
  async function openEditor(product: Product) {
    if (disabled || operation.current) return;
    if (product.detailsLoaded !== false) { setEditing(product); return; }
    operation.current = true; setBusy(product.id); setErrors({});
    try { const result = await storeRequest(`/api/store/inventory?product=${encodeURIComponent(product.id)}`); setEditing(result.product as Product); }
    catch (reason) { setErrors({ [product.id]: reason instanceof Error ? reason.message : "Could not load this item. Retry." }); }
    finally { operation.current = false; setBusy(""); }
  }
  async function setStatus(product: Product, status: "active" | "inactive") {
    if (operation.current) return;
    operation.current = true; setBusy(product.id); setErrors({});
    try { await action({ action: "product_status", productId: product.id, status }, { reload: true, message: status === "active" ? `${product.title} is listed for sale.` : `${product.title} is unpublished.` }); }
    catch (reason) { setErrors({ [product.id]: reason instanceof Error ? reason.message : "Could not update this item. Retry." }); }
    finally { operation.current = false; setBusy(""); }
  }
  function closeEditor() {
    setEditing(null);
    if (params.has("edit")) { const query = new URLSearchParams(params.toString()); query.delete("edit"); router.replace(`/store?${query}`, { scroll: false }); }
    router.refresh();
  }
  return <div className="store-stack inventory-workspace">
    <header className="store-page-heading"><div><h2>Inventory</h2><p>Manage your stock and list models for sale.</p></div><button className="button dark" disabled={disabled || Boolean(busy)} onClick={() => setEditing("new")}>Add item</button></header>
    {!editing && <StoreSetupNotice setup={data.setup} storeStatus={data.store.status} />}
    {initialProductId && initialProductId !== "new" && !initial && <p className="form-error" role="alert">This item could not be found in your store. Search inventory below.</p>}
    <div className="seller-inventory-toolbar"><button className="button outline small" disabled={disabled} aria-expanded={tool === "import"} onClick={() => setTool(tool === "import" ? "" : "import")}>Import CSV</button><button className="button outline small" disabled={disabled} aria-expanded={tool === "bulk"} onClick={() => setTool(tool === "bulk" ? "" : "bulk")}>Update stock &amp; price</button></div>
    {tool === "import" && <SellerInventoryUpload disabled={disabled} action={action} expanded onSaved={() => router.refresh()} />}
    <nav className="hub-filters" aria-label="Inventory views">{tabs.map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => navigate({ filter: key })}>{label}<span>{page?.counts[key] ?? data.inventory.filter(row => localMatch(row, key)).length}</span></button>)}</nav>
    <form className="inventory-search" onSubmit={event => { event.preventDefault(); navigate({ search }); }}><label>Search inventory<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, SKU, make, or model" /></label><button className="button outline small">Search</button><label>Stock filter<select value={stock} onChange={event => navigate({ stock: event.target.value })}><option value="all">All stock</option><option value="low">Low stock (1–2 available)</option><option value="out">Out of stock</option><option value="preorders">Preorders</option><option value="slow">No recent sales</option></select></label>{(search || filter !== "all" || stock !== "all") && <button type="button" className="text-action" onClick={() => { setSearch(""); navigate({ search: "", filter: "all", stock: "all" }); }}>Clear filters</button>}</form>
    {tool === "bulk" && <section className="store-panel"><h3>Update selected items</h3><SellerBulkStock key={loadedKey} products={selectedRows} disabled={disabled} action={action} expanded /></section>}
    {selectedRows.length > 0 && tool !== "bulk" && <div className="inventory-selection"><span>{selectedRows.length} selected</span><button className="button outline small" onClick={() => setTool("bulk")}>Edit stock &amp; price</button><button className="text-action" onClick={() => setSelected([])}>Clear selection</button></div>}
    <section className="store-panel store-inventory-panel"><div className="store-inventory-meta"><b>{page?.total ?? visible.length} items</b><span>Total stock includes units reserved for buyers.</span></div>
      <div className="admin-table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all in-stock items on this page" disabled={disabled || !visible.some(row => row.availabilityType !== "preorder")} checked={visible.some(row => row.availabilityType !== "preorder") && visible.filter(row => row.availabilityType !== "preorder").every(row => selected.includes(row.id))} onChange={event => setSelected(event.target.checked ? visible.filter(row => row.availabilityType !== "preorder").map(row => row.id) : [])} /></th><th>Item</th><th>Price</th><th>Stock</th><th>Listing</th><th>Actions</th></tr></thead><tbody>
        {visible.map(product => { const issues = issueMap.get(product.id) ?? {}; const listed = ["active", "sold_out"].includes(product.status); const ready = !Object.keys(issues).length; return <tr key={product.id} className="seller-inventory-item"><td><input type="checkbox" aria-label={`Select ${product.sellerSku}`} disabled={disabled || product.availabilityType === "preorder"} checked={selected.includes(product.id)} onChange={event => setSelected(current => event.target.checked ? [...current, product.id] : current.filter(id => id !== product.id))} /></td>
          <td className="seller-product-cell"><SellerThumbnail src={product.primaryImageUrl} title={product.title}/><div><b>{product.title}</b><small>{product.scale} · {product.modelManufacturer} · SKU {product.sellerSku}</small>{!ready && <button className="seller-photo-status" disabled={disabled || Boolean(busy)} onClick={() => void openEditor(product)}>{issues.images ? "Photos incomplete · Review" : "Listing details needed · Review"}</button>}{!ready && <small>{issues.images && Object.keys(issues).length === 1 ? "Add required photos and view labels." : Object.values(issues)[0]}</small>}</div></td>
          <td data-label="Price" className="seller-money">{product.priceCents ? formatMoney(product.priceCents, product.currency) : "Price needed"}</td>
          <td data-label="Stock">{product.availabilityType === "preorder" ? <span>{product.preorder?.capacity ?? 0} preorder units</span> : <><strong>{Math.max(0, product.inventoryQuantity - product.reservedQuantity)} available</strong><small>{product.inventoryQuantity} total · {product.reservedQuantity} reserved</small></>}</td>
          <td data-label="Listing"><span className={`status ${product.status}`}>{inventoryStatusLabel(product.status)}</span></td>
          <td className="seller-inventory-actions"><div className="row-actions">{!listed && ready && data.setup.readyToPublish ? <><button className="button dark small" disabled={disabled || Boolean(busy)} onClick={() => void setStatus(product, "active")}>{busy === product.id ? "Working…" : "List for sale"}</button><button className="text-action" disabled={disabled || Boolean(busy)} onClick={() => void openEditor(product)}>Edit</button></> : <button className="button dark small" disabled={disabled || Boolean(busy)} onClick={() => void openEditor(product)}>{busy === product.id ? "Loading…" : listed ? "Edit" : "Finish listing"}</button>}
            {listed && product.slug && <Link href={`/products/${product.slug}`} target="_blank" rel="noopener noreferrer">View listing ↗</Link>}
            <details><summary>More actions</summary><div className="seller-item-more">{product.availabilityType === "preorder" ? <button onClick={() => setPreorder(product)}>Manage preorder</button> : <button disabled={disabled} onClick={() => { setSelected([product.id]); setTool("bulk"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit stock &amp; price</button>}{listed && <button disabled={disabled || Boolean(busy)} onClick={() => void setStatus(product, "inactive")}>Unpublish</button>}{product.status === "active" && product.availabilityType !== "preorder" && <Link href={`/store?view=growth&filter=promoted&promotion_product=${encodeURIComponent(product.id)}`}>Promote</Link>}</div></details>
          </div>{errors[product.id] && <div role="alert" className="form-error"><p>{errors[product.id]}</p><button className="text-action" onClick={() => void openEditor(product)}>Review item</button></div>}</td></tr>; })}
      </tbody></table></div>
      {!visible.length && <div className="store-empty">{(page?.totalInventory ?? data.inventory.length) === 0 ? <><h3>Add your first inventory item</h3><p>Save a draft, add photos, then list it for sale when ready.</p><button className="button dark" disabled={disabled} onClick={() => setEditing("new")}>Add item</button></> : <><p>No items match these filters.</p><button className="button outline" onClick={() => { setSearch(""); navigate({ search: "", filter: "all", stock: "all" }); }}>Clear filters</button></>}</div>}
      {page && page.total > page.pageSize && <nav className="inventory-pagination" aria-label="Inventory pages"><button disabled={page.page === 1} onClick={() => navigate({ page: page.page - 1 })}>Previous</button><span>Page {page.page} of {Math.ceil(page.total / page.pageSize)}</span><button disabled={page.page * page.pageSize >= page.total} onClick={() => navigate({ page: page.page + 1 })}>Next</button></nav>}
    </section>
    <details className="store-panel"><summary>Selling fees</summary><SellerFeeDisclosure marketplaceFeeBps={data.fee.marketplaceFeeBps}/></details>
    {editing && <StoreProductEditor key={editing === "new" ? "new" : editing.id} marketplaceFeeBps={data.fee.marketplaceFeeBps} product={editing === "new" ? null : editing} store={data.store} setup={data.setup} action={action} onClose={closeEditor}/>}
    {preorder && <PreorderDialog product={preorder} onClose={() => setPreorder(null)}/>}
  </div>;
}

function PreorderDialog({ product, onClose }: { product: Product; onClose(): void }) {
  const dialog = useDialogFocus(onClose);
  return <div className="store-editor-backdrop"><section ref={dialog} role="dialog" aria-modal="true" aria-label={`Manage preorder: ${product.title}`} className="store-editor"><button onClick={onClose}>Close</button><PreorderSeller listingId={product.id}/></section></div>;
}
