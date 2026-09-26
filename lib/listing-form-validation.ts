export type ListingFieldErrors = Record<string, string>;

const labels: Record<string, string> = {
  packagingGrade: "Packaging condition", modelCondition: "Model condition", packagingCondition: "Packaging condition",
  originalBoxStatus: "Original box", coaStatus: "Certificate of authenticity (COA)",
  missingParts: "Missing parts", defects: "Defects and wear",
  restorationCustomization: "Restoration or customization", accessories: "Included accessories",
  price: "Price (USD)", quantity: "Quantity", packageLength: "Length (in)",
  packageWidth: "Width (in)", packageHeight: "Height (in)", packageWeight: "Weight (lb)",
  sellerDisplayName: "Seller display name", sellerDescription: "Short seller description",
  sellerSpecialty: "Specialty", sellerPackingApproach: "How you pack models",
  shippingOriginStreet1: "Street address", shippingOriginCity: "City",
  shippingOriginRegion: "State or region", shippingOriginPostalCode: "ZIP or postal code",
  shippingOriginCountry: "Country", shippingOriginPhone: "Carrier contact phone",
  shipFromAddressId: "Ship-from address", sellerTermsVersion: "Seller Terms",
  images: "Photos", catalogProductId: "Catalog model",
};

export function listingFieldLabel(name: string) {
  return labels[name] ?? name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function requiredListingFieldMessage(name: string) {
  const disclosures: Record<string, string> = {
    missingParts: 'Choose “None known”, “Not sure”, or describe the missing parts.',
    defects: 'Choose “None known”, “Not sure”, or describe the defects and wear.',
    restorationCustomization: 'Choose “None known”, “Not sure”, or describe the repairs or customization.',
    accessories: 'List the included accessories, or enter “None included”.',
  };
  return disclosures[name] ?? `${listingFieldLabel(name)} is required.`;
}

export function listingFieldProps(errors: ListingFieldErrors, name: string) {
  return {
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `listing-error-${name}` : undefined,
  };
}

type ListingInput = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function listingInputError(field: ListingInput) {
  if (!field.willValidate) return "";
  if (field.required && (field.validity.valueMissing || !field.value.trim())) return requiredListingFieldMessage(field.name);
  if (!field.validity.valid) return field.validationMessage;
  if (field.name === "price" && !/^\$?\d+(\.\d{1,2})?$/.test(field.value.trim())) return "Enter a price with no more than two decimal places.";
  if (field.name === "price" && Number(field.value.trim().replace(/^\$/, "")) > 1_000_000) return "Enter a price no greater than $1,000,000.";
  if (["packageLength", "packageWidth", "packageHeight", "packageWeight"].includes(field.name)) {
    const max = field.name === "packageWeight" ? 150 : 108;
    if (!/^\d+(\.\d{1,2})?$/.test(field.value.trim()) || Number(field.value) <= 0 || Number(field.value) > max) {
      return `Enter a value greater than 0 and no more than ${max}, with up to two decimal places.`;
    }
  }
  return "";
}

export function listingFormErrors(form: HTMLFormElement) {
  const errors: ListingFieldErrors = {};
  for (const field of form.querySelectorAll<ListingInput>("input[name], select[name], textarea[name]")) {
    const message = listingInputError(field);
    if (message) errors[field.name] = message;
  }
  return errors;
}

export function focusListingError(form: HTMLFormElement, errors: ListingFieldErrors, name?: string) {
  // Walk in document order, including controls inside closed and nested details.
  const target = [...form.querySelectorAll<HTMLElement>("[name], [data-listing-field]")].find((element) => {
    const key = element.getAttribute("data-listing-field") || element.getAttribute("name") || "";
    return (name ? key === name : Boolean(errors[key])) && element.getAttribute("type") !== "hidden" && !element.matches(":disabled");
  });
  if (!target) return;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === "DETAILS") (parent as HTMLDetailsElement).open = true;
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center", behavior: "instant" });
}
