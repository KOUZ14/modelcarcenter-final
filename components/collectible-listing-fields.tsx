import {
  coaStatuses,
  listingPhotoChecklist,
  modelConditions,
  originalBoxStatuses,
  packagingConditions,
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
}: {
  product?: CollectibleProduct | null;
}) {
  return (
    <fieldset className="collectible-fields">
      <legend>Collectible condition and identity</legend>
      <p className="field-note">
        Grade the model separately from its packaging. For disclosure fields,
        enter &ldquo;None known&rdquo; when there is nothing to report.
      </p>
      <div className="form-row">
        <label>
          Model condition
          <select
            name="modelCondition"
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
        </label>
        <label>
          Packaging condition
          <select
            name="packagingCondition"
            required
            defaultValue={initialSelectValue(
              product?.packagingCondition,
              packagingConditions,
            )}
          >
            <option value="" disabled>
              Select packaging condition
            </option>
            {packagingConditions.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Original box
          <select
            name="originalBoxStatus"
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
        </label>
        <label>
          Certificate of authenticity (COA)
          <select
            name="coaStatus"
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
        </label>
      </div>
      <div className="form-row">
        <label>
          Material
          <input
            name="material"
            required
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
      </div>
      <label>
        Edition or serial number
        <input
          name="editionSerial"
          maxLength={150}
          placeholder="Example: 147 of 500"
          defaultValue={String(product?.editionSerial ?? "")}
        />
      </label>
      <label>
        Missing parts
        <textarea
          name="missingParts"
          required
          maxLength={2000}
          rows={3}
          placeholder="List every missing part, or enter None known"
          defaultValue={String(product?.missingParts ?? "")}
        />
      </label>
      <label>
        Defects and wear
        <textarea
          name="defects"
          required
          maxLength={2000}
          rows={3}
          placeholder="Describe paint rash, chips, cracks, yellowing, shelf wear, or enter None known"
          defaultValue={String(product?.defects ?? "")}
        />
      </label>
      <label>
        Restoration or customization
        <textarea
          name="restorationCustomization"
          required
          maxLength={2000}
          rows={3}
          placeholder="Describe repairs, replacement parts, repainting, decals, or enter None known"
          defaultValue={String(product?.restorationCustomization ?? "")}
        />
      </label>
      <label>
        Included accessories
        <textarea
          name="accessories"
          required
          maxLength={2000}
          rows={3}
          placeholder="Display base, case, mirrors, tools, booklet, inserts, or None"
          defaultValue={String(product?.accessories ?? "")}
        />
      </label>
      <label>
        Provenance
        <textarea
          name="provenance"
          maxLength={2000}
          rows={3}
          placeholder="Optional ownership history, event, collection, or purchase documentation"
          defaultValue={String(product?.provenance ?? "")}
        />
      </label>
    </fieldset>
  );
}

export function RequiredPhotoChecklist({
  product,
}: {
  product?: CollectibleProduct | null;
}) {
  return (
    <fieldset className="photo-checklist">
      <legend>Required photo checklist</legend>
      <p className="field-note">
        A listing needs at least four original photos. Confirm every view before
        submitting or publishing; check the packaging and issue items when the
        listing accurately states that none are present.
      </p>
      {listingPhotoChecklist.map(({ key, label }) => (
        <label className="consent-check" key={key}>
          <input
            type="checkbox"
            name={key}
            defaultChecked={Boolean(product?.[key])}
          />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}
