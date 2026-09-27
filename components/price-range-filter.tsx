"use client";

import { type FormEvent, useId, useState } from "react";
import { parsePriceRange } from "@/lib/price-range";

export function PriceRangeFilter({ id, minPrice, maxPrice, onApply, onShowResults }: {
  id: string;
  minPrice: string;
  maxPrice: string;
  onApply: (range: { minPrice: string; maxPrice: string }) => void;
  onShowResults: () => void;
}) {
  const [minimum, setMinimum] = useState(minPrice);
  const [maximum, setMaximum] = useState(maxPrice);
  const [error, setError] = useState("");
  const noteId = useId();
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const { minCents, maxCents } = parsePriceRange({ minPrice: minimum, maxPrice: maximum });
      setError("");
      onApply({ minPrice: minCents === null ? "" : String(minCents / 100), maxPrice: maxCents === null ? "" : String(maxCents / 100) });
      if ((event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "show") onShowResults();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Check your price range.");
    }
  }
  return <form id={id} className="price-range-filter" onSubmit={apply}>
    <fieldset aria-describedby={noteId}>
      <legend>Price (USD)</legend>
      <div className="price-range-inputs">
        <label>Minimum<input name="minPrice" type="number" inputMode="decimal" min="0" max="1000000" step="0.01" placeholder="No min" value={minimum} onChange={event => { setMinimum(event.target.value); setError(""); }} /></label>
        <label>Maximum<input name="maxPrice" type="number" inputMode="decimal" min="0" max="1000000" step="0.01" placeholder="No max" value={maximum} onChange={event => { setMaximum(event.target.value); setError(""); }} /></label>
      </div>
      <p id={noteId}>Listing price before shipping and tax.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button outline" type="submit">Apply price range</button>
    </fieldset>
  </form>;
}
