"use client";

import { useEffect, useRef, useState } from "react";
import { isFactorySealed, listingPhotoEvidence, photoViews, requiredPhotoViews, type EvidenceImage } from "@/lib/listing-evidence";
import { listingFieldProps, type ListingFieldErrors } from "@/lib/listing-form-validation";
import { ListingFieldError } from "./listing-field-error";
import {
  coaStatuses,
  modelConditions,
  originalBoxStatuses,
} from "@/lib/validation";

type CollectibleProduct = Partial<{
  modelCondition: unknown;
  packagingCondition: unknown;
  originalBoxStatus: unknown;
  missingParts: unknown;
  defects: unknown;
  restorationCustomization: unknown;
  material: unknown;
  productNumber: unknown;
  editionSerial: unknown;
  coaStatus: unknown;
  accessories: unknown;
  provenance: unknown;
  conditionNotes: unknown;
  photoFrontChecked: unknown;
  photoRearChecked: unknown;
  photoSidesChecked: unknown;
  photoBaseChecked: unknown;
  photoPackagingChecked: unknown;
  photoIssuesChecked: unknown;
}>;

const labels: Record<string, string> = {
  mint: "Mint",
  near_mint: "Near mint",
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  sealed: "Factory sealed",
  not_included: "Not included",
  included: "Included",
  reproduction: "Reproduction box",
  not_applicable: "Not applicable",
};

function initialSelectValue(value: unknown, options: readonly string[]) {
  const candidate = String(value ?? "");
  return options.includes(candidate) ? candidate : "";
}

export function CollectibleListingFields({
  product,
  includeIdentity = true,
  includeLegacyNotes = false,
  errors = {},
}: {
  product?: CollectibleProduct | null;
  includeIdentity?: boolean;
  includeLegacyNotes?: boolean;
  errors?: ListingFieldErrors;
}) {
  const root = useRef<HTMLFieldSetElement>(null);
  const initialPackaging = String(product?.packagingCondition ?? "");
  const [sealed, setSealed] = useState(isFactorySealed(initialPackaging));
  const [packagingGrade, setPackagingGrade] = useState(initialPackaging === "sealed" ? "" : initialPackaging.replace(/^sealed_/, ""));
  const packagingValue = sealed ? (packagingGrade ? `sealed_${packagingGrade}` : "sealed") : packagingGrade;
  useEffect(() => { root.current?.dispatchEvent(new Event("listing-details-change", { bubbles: true })); }, [packagingValue]);
  return (
    <fieldset className="collectible-fields" ref={root}>
      <legend>Condition of your copy</legend>
      <p className="field-note">
        Grade the model and packaging separately. Disclose what you know; choose “Not sure” when you cannot inspect a detail.
      </p>
      <div className="form-row">
        <label>
          Model condition
          <select
            name="modelCondition" {...listingFieldProps(errors, "modelCondition")}
            required
            defaultValue={initialSelectValue(
              product?.modelCondition,
              modelConditions,
            )}
          >
            <option value="" disabled>
              Select model condition
            </option>
            {modelConditions.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
          <ListingFieldError errors={errors} name="modelCondition" />
        </label>
        <div data-listing-field="packagingCondition" tabIndex={-1}>
          <label>Packaging condition
            <select name="packagingGrade" value={packagingGrade} required {...listingFieldProps(errors, errors.packagingGrade ? "packagingGrade" : "packagingCondition")} onChange={event => { setPackagingGrade(event.target.value); if (event.target.value === "not_included") setSealed(false); }}>
              <option value="" disabled>Select physical condition</option>
              {["mint", "excellent", "good", "fair", "poor", "not_included"].map(value => <option key={value} value={value}>{labels[value]}</option>)}
            </select>
          </label>
          <input type="hidden" name="packagingCondition" value={packagingValue} />
          <ListingFieldError errors={errors} name="packagingGrade" />
          <ListingFieldError errors={errors} name="packagingCondition" />
          <label className="consent-check compact-check"><input type="checkbox" checked={sealed} disabled={packagingGrade === "not_included"} onChange={event => setSealed(event.target.checked)} /><span>Factory seal intact</span></label>
          <p className="field-note">A sealed box can still have wear or damage. Grade its physical condition above; keep sealed contents sealed.</p>
        </div>
      </div>
      <details className="grading-guide"><summary>How to grade condition</summary><p><b>Mint:</b> no visible flaws. <b>Near mint:</b> very minor imperfections visible on close inspection. <b>Excellent:</b> light wear, with all major features intact. <b>Good:</b> noticeable wear. <b>Fair / Poor:</b> significant wear or damage. Describe every known issue regardless of grade.</p><p>For sealed models, assess only what is visible and use “Not sure” for hidden details.</p></details>
      <div className="form-row">
        <label>
          Original box
          <select
            name="originalBoxStatus" {...listingFieldProps(errors, "originalBoxStatus")}
            required
            defaultValue={initialSelectValue(
              product?.originalBoxStatus,
              originalBoxStatuses,
            )}
          >
            <option value="" disabled>
              Select box status
            </option>
            {originalBoxStatuses.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
          <ListingFieldError errors={errors} name="originalBoxStatus" />
        </label>
        <label>
          Certificate of authenticity (COA)
          <select
            name="coaStatus" {...listingFieldProps(errors, "coaStatus")}
            required
            defaultValue={initialSelectValue(product?.coaStatus, coaStatuses)}
          >
            <option value="" disabled>
              Select COA status
            </option>
            {coaStatuses.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
          <ListingFieldError errors={errors} name="coaStatus" />
        </label>
      </div>
      {includeIdentity && <div className="form-row">
        <label>
          Material (optional)
          <input
            name="material"
            maxLength={120}
            placeholder="Die-cast metal with plastic details"
            defaultValue={String(product?.material ?? "")}
          />
        </label>
        <label>
          Product number
          <input
            name="productNumber"
            maxLength={150}
            placeholder="Manufacturer catalog number"
            defaultValue={String(product?.productNumber ?? "")}
          />
        </label>
      </div>}
      <label>
        Edition or serial number
        <input
          name="editionSerial"
          maxLength={150}
          placeholder="Example: 147 of 500"
          defaultValue={String(product?.editionSerial ?? "")}
        />
      </label>
      <DisclosureField name="missingParts" label="Missing parts" initial={product?.missingParts} errors={errors} />
      <DisclosureField name="defects" label="Defects and wear" initial={product?.defects} errors={errors} />
      <DisclosureField name="restorationCustomization" label="Restoration or customization" initial={product?.restorationCustomization} errors={errors} />
      <label>
        Included accessories (optional)
        <textarea
          name="accessories" {...listingFieldProps(errors, "accessories")}
          maxLength={2000}
          rows={3}
          placeholder="Display base, case, mirrors, tools, booklet, inserts, or None"
          defaultValue={String(product?.accessories ?? "")}
        />
        <ListingFieldError errors={errors} name="accessories" />
      </label>
      <label>
        Ownership history (optional)
        <textarea
          name="provenance"
          maxLength={2000}
          rows={3}
          placeholder="Optional ownership history, event, collection, or purchase documentation"
          defaultValue={String(product?.provenance ?? "")}
        />
      </label>
      {includeLegacyNotes && Boolean(product?.conditionNotes) && <label>Additional condition notes from this draft<textarea name="conditionNotes" maxLength={2000} rows={3} defaultValue={String(product?.conditionNotes)} /><span className="field-note">Your earlier notes are preserved. Keep defect, missing-part, and repair details in the answers above.</span></label>}
    </fieldset>
  );
}

function DisclosureField({ name, label, initial, errors }: { name: string; label: string; initial: unknown; errors: ListingFieldErrors }) {
  const value = String(initial ?? "");
  const initialMode = !value ? "" : /^(none(?: known)?|no(?:ne)? (?:known )?(?:defects|issues|damage|missing parts|repairs)|n\/a|not applicable)[.!]?$/i.test(value) ? "None known" : value === "Not sure" ? "Not sure" : "describe";
  const [mode, setMode] = useState(initialMode);
  const [description, setDescription] = useState(initialMode === "describe" ? value : "");
  return <div className="disclosure-field" data-listing-field={name} tabIndex={-1}>
    <label>{label}<select name={mode === "describe" ? undefined : name} required value={mode} {...listingFieldProps(errors, name)} onChange={event => setMode(event.target.value)}>
      <option value="" disabled>Choose an answer</option><option>None known</option><option value="describe">Yes, describe</option><option>Not sure</option>
    </select></label>
    {mode === "describe" && <label>Describe {label.toLowerCase()}<textarea name={name} required maxLength={2000} rows={3} value={description} {...listingFieldProps(errors, name)} onChange={event => setDescription(event.target.value)} /></label>}
    {mode === "Not sure" && <p className="field-note">Buyers will see “Not sure” for this disclosure.</p>}
    <ListingFieldError errors={errors} name={name} />
  </div>;
}

export function RequiredPhotoChecklist({ product, images }: { product?: CollectibleProduct | null; images?: EvidenceImage[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [details, setDetails] = useState(product ?? {});
  useEffect(() => {
    const form = container.current?.closest("form");
    if (!form) return;
    const update = () => queueMicrotask(() => setDetails(Object.fromEntries(new FormData(form))));
    update();
    form.addEventListener("change", update);
    form.addEventListener("listing-details-change", update);
    return () => { form.removeEventListener("change", update); form.removeEventListener("listing-details-change", update); };
  }, []);
  const required = requiredPhotoViews(details);
  const evidence = listingPhotoEvidence(details, images);
  return <div className="photo-checklist photo-coverage" ref={container}>
    <h3>Views buyers need</h3>
    <p className="field-note">Use original photos of this item. Label only what each photo shows; one photo can cover several views.</p>
    <p>{isFactorySealed(details.packagingCondition) ? "Keep factory-sealed models sealed. Add at least two exterior photos showing the box and seal." : "Add at least four photos. Include all six model views, plus packaging and accessories when included."}</p>
    <ul>{required.map(key => { const label = photoViews.find(view => view.key === key)!.label; const covered = images !== undefined && !evidence.missing.includes(label); return <li key={key} data-covered={covered}>{covered ? "✓" : "○"} {label}{images !== undefined && !covered ? " — missing" : ""}</li>; })}</ul>
    {images !== undefined && <p role="status">{evidence.complete ? "Required photo coverage complete" : evidence.missing.join(" · ")}</p>}
  </div>;
}
