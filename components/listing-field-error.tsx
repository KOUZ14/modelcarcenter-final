import type { ListingFieldErrors } from "@/lib/listing-form-validation";

export function ListingFieldError({ errors, name }: { errors: ListingFieldErrors; name: string }) {
  return errors[name] ? <span className="listing-field-error" id={`listing-error-${name}`}>{errors[name]}</span> : null;
}
