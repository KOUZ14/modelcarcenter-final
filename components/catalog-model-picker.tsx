"use client";

import { useId, useRef, useState } from "react";
import { catalogManufacturers, catalogScales, type CatalogModel } from "@/lib/catalog-product-rules";

type InitialModel = {
  catalogProductId?: unknown; modelManufacturer?: unknown; vehicleMake?: unknown;
  vehicleModel?: unknown; scale?: unknown; color?: unknown; productNumber?: unknown;
};

export function CatalogModelPicker({ initial, disabled, listingSaved, initialQuery = "", onReady }: {
  initial?: InitialModel | null;
  disabled?: boolean;
  listingSaved?: boolean;
  initialQuery?: string;
  onReady(ready: boolean): void;
}) {
  const makerListId = useId();
  const fields = useRef<HTMLFieldSetElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CatalogModel[]>([]);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<CatalogModel | null>(null);
  const [newModel, setNewModel] = useState<Record<string, string> | null>(null);
  const [similar, setSimilar] = useState<CatalogModel[]>([]);
  const [candidate, setCandidate] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requestSequence = useRef(0);

  function choose(model: CatalogModel) {
    setSelected(model); setCreating(false); setNewModel(null); setSimilar([]); setError(""); onReady(true);
  }

  async function search() {
    const sequence = ++requestSequence.current;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/catalog-products?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const body = await response.json() as { products?: CatalogModel[]; error?: string };
      if (sequence !== requestSequence.current) return;
      if (!response.ok) throw new Error(body.error || "Catalog search failed.");
      setResults(body.products ?? []); setSearched(true);
    } catch (reason) {
      if (sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : "Catalog search failed.");
    } finally { if (sequence === requestSequence.current) setBusy(false); }
  }

  async function checkModel() {
    const inputs = fields.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input[name], select[name], textarea[name]");
    if (!inputs) return;
    for (const input of inputs) if (!input.reportValidity()) return;
    const values = Object.fromEntries([...inputs].map((input) => [input.name, input.value]));
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/catalog-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const body = await response.json() as { exact?: CatalogModel; similar?: CatalogModel[]; error?: string };
      if (!response.ok) throw new Error(body.error || "The model could not be checked.");
      if (body.exact) { choose(body.exact); return; }
      if (body.similar?.length) { setCandidate(values); setSimilar(body.similar); return; }
      setNewModel(values); setCreating(false); onReady(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The model could not be checked."); }
    finally { setBusy(false); }
  }

  const lockedId = typeof initial?.catalogProductId === "string" ? initial.catalogProductId : "";
  const summary = selected ?? (lockedId ? initial : newModel);
  const summaryTitle = summary ? [summary.modelManufacturer, summary.vehicleMake, summary.vehicleModel, "vehicleVariant" in summary ? summary.vehicleVariant : ""].filter(Boolean).join(" ") : "";
  function modelRows(models: CatalogModel[]) {
    return <ul className="catalog-model-results">{models.map((model) => <li key={model.id}>
      <div><strong>{model.title}</strong><p>{model.scale} · {model.color || "Color not specified"} · SKU {model.manufacturerSku || "unknown"}{model.livery ? ` · ${model.livery}` : ""}{model.releaseYear ? ` · Release ${model.releaseYear}` : ""}</p></div>
      <button className="button outline small" type="button" disabled={disabled || busy} onClick={() => choose(model)}>Use this model</button>
    </li>)}</ul>;
  }

  return <section className="catalog-model-picker" aria-label="Find your model">
    <p className="step-label">Model catalog</p>
    {summary ? <>
      <h2>{summaryTitle}</h2>
      <p>{String(summary.scale ?? "")} · {String(summary.color || "Color not specified")} · SKU {String(selected?.manufacturerSku || newModel?.manufacturerSku || initial?.productNumber || "unknown")}</p>
      <p>{newModel && !listingSaved ? "This model will be added to the shared MCC catalog when you save your listing." : "Your listing uses this shared catalog model. Add your price, quantity and condition below."}</p>
      {(lockedId || selected) && <input type="hidden" name="catalogProductId" value={lockedId || selected!.id} />}
      {newModel && Object.entries(newModel).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      {!lockedId && !listingSaved && <button className="text-action" type="button" disabled={disabled} onClick={() => { setSelected(null); setNewModel(null); setCandidate(null); setSimilar([]); onReady(false); }}>Change model</button>}
    </> : <>
      <h2>Find your model</h2>
      <p>Search the MCC catalog first. Models added by other sellers are available to use even when sold out.</p>
      <div className="catalog-search-row">
        <label>Manufacturer SKU, product name, manufacturer, make or model<input value={query} disabled={disabled || busy} maxLength={200} onChange={(event) => { ++requestSequence.current; setSearched(false); setResults([]); setQuery(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="76001 or AUTOart McLaren F1 Silver" /></label>
        <button className="button dark small" type="button" disabled={disabled || busy} onClick={() => void search()}>{busy ? "Checking…" : "Search catalog"}</button>
      </div>
      {searched && !results.length && <p role="status">No models found. Try another search or add the missing model.</p>}
      {modelRows(results)}
      {!creating && <button className="text-action" type="button" disabled={disabled || busy} onClick={() => setCreating(true)}>Can&apos;t find your model? Create it</button>}
      {creating && <fieldset ref={fields} disabled={disabled || busy} className="catalog-create-fields" onChange={() => { setSimilar([]); setCandidate(null); }} onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); void checkModel(); } }}>
        <legend>Add a missing catalog model</legend>
        <div className="form-row">
          <label>Model-car manufacturer<input name="modelManufacturer" required maxLength={100} list={makerListId} placeholder="AUTOart" /><datalist id={makerListId}>{catalogManufacturers.map((maker) => <option key={maker} value={maker} />)}</datalist></label>
          <label>Manufacturer SKU (strongly recommended)<input name="manufacturerSku" maxLength={150} placeholder="76001" /><span className="field-note">Use the manufacturer&apos;s number, not your store SKU. Leave blank only if unknown.</span></label>
        </div>
        <div className="form-row">
          <label>Scale<select name="scale" defaultValue="1:18">{catalogScales.map((scale) => <option key={scale}>{scale}</option>)}</select></label>
          <label>Vehicle make<input name="vehicleMake" required maxLength={100} placeholder="McLaren" /></label>
        </div>
        <div className="form-row">
          <label>Vehicle model<input name="vehicleModel" required maxLength={120} placeholder="F1" /></label>
          <label>Variant / edition<input name="vehicleVariant" maxLength={150} placeholder="Road Car" /></label>
        </div>
        <div className="form-row"><label>Color<input name="color" maxLength={80} /></label><label>Livery<input name="livery" maxLength={150} /></label></div>
        <div className="form-row"><label>Vehicle year<input name="vehicleYear" maxLength={20} /></label><label>Model release year<input name="releaseYear" maxLength={20} /></label></div>
        <div className="form-row"><label>UPC<input name="upc" inputMode="numeric" maxLength={12} /></label><label>EAN<input name="ean" inputMode="numeric" maxLength={13} /></label></div>
        <label>Material (optional)<input name="material" maxLength={120} /></label>
        <label>Catalog description (optional)<textarea name="catalogDescription" maxLength={4000} rows={3} placeholder="General details about this model. Describe the condition of your copy in the listing." /></label>
        <button className="button dark small" type="button" onClick={() => void checkModel()}>Check model and continue</button>
      </fieldset>}
      {similar.length > 0 && <div role="status"><h3>We found a similar model</h3><p>Check the color, livery, edition and year before choosing.</p>{modelRows(similar)}<button className="button outline small" type="button" disabled={disabled || busy} onClick={() => { if (candidate) { setNewModel({ ...candidate, confirmDifferentModel: "true" }); setCreating(false); setSimilar([]); onReady(true); } }}>This is a different model</button></div>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
