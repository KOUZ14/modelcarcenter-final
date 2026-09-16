"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref, type KeyboardEvent } from "react";
import { addressFieldError, countryName, normalizeState, US_STATES, type Address, type AddressField, type AddressSuggestion } from "@/lib/address";

export type AddressFieldsHandle = { setErrors: (fields: Record<string, string>) => void };

export function AddressFields({
  ref, initialValues = {}, fieldNames = {}, includeName = false, includePhone = false,
  disabled = false, onChange, values: controlledValues,
}: {
  ref?: Ref<AddressFieldsHandle>;
  initialValues?: Partial<Address>;
  fieldNames?: Partial<Record<AddressField, string>>;
  includeName?: boolean;
  includePhone?: boolean;
  disabled?: boolean;
  values?: Partial<Address>;
  onChange?: (values: Address) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [storedValues, setValues] = useState<Address>(() => ({
    name: "", phone: "", street1: "", street2: "", city: "", zip: "", country: "US",
    ...initialValues, state: normalizeState(initialValues.state ?? ""),
  }));
  const values = { ...storedValues, ...controlledValues };
  values.state = values.country === "US" ? normalizeState(values.state) : values.state;
  const [errors, setErrors] = useState<Partial<Record<AddressField, string>>>({});
  const [showUnit, setShowUnit] = useState(Boolean(initialValues.street2));
  const [manual, setManual] = useState(initialValues.country != null && initialValues.country !== "US");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<AbortController | null>(null);
  const token = useRef("");
  const name = (field: AddressField) => fieldNames[field] ?? field;
  const isUS = values.country === "US";

  function cancelLookup() {
    if (timer.current) clearTimeout(timer.current);
    pending.current?.abort();
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    pending.current?.abort();
  }, []);

  useImperativeHandle(ref, () => ({
    setErrors(fields) {
      const next = Object.fromEntries((Object.keys(values) as AddressField[])
        .filter((field) => fields[name(field)]).map((field) => [field, fields[name(field)]]));
      setErrors(next);
      if (next.street2) setShowUnit(true);
      const first = Object.keys(next)[0];
      if (first) {
        const element = root.current?.querySelector<HTMLElement>(`[data-address-field="${first}"]`);
        requestAnimationFrame(() => { openDetails(element ?? null); element?.focus(); });
      }
    },
  }));

  function change(field: AddressField, value: string) {
    cancelLookup();
    setExpanded(false);
    setSuggestions([]);
    setStatus("");
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: current[field] ? addressFieldError(field, value, values.country) : "" }));
    onChange?.({ ...values, [field]: value });
    if (field !== "street1" || manual || value.trim().length < 3) return;
    const controller = new AbortController();
    pending.current = controller;
    timer.current = setTimeout(async () => {
      setStatus("Looking for addresses…");
      try {
        const data = await lookup({ query: value.trim() }, controller.signal);
        if (controller.signal.aborted) return;
        if (data.unavailable) throw new Error();
        setSuggestions(data.suggestions ?? []);
        setActive(-1);
        setExpanded(true);
        setStatus(data.suggestions?.length ? `${data.suggestions.length} suggestions available. Use the arrow keys to choose.` : "No addresses found. Enter your address manually below.");
      } catch {
        if (controller.signal.aborted) return;
        setManual(true);
        setStatus("Address suggestions are unavailable. Enter your address manually below.");
      }
    }, 300);
  }

  async function lookup(payload: { query?: string; placeId?: string }, signal: AbortSignal) {
    token.current ||= crypto.randomUUID();
    const response = await fetch("/api/addresses/autocomplete", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ ...payload, sessionToken: token.current }),
    });
    if (!response.ok) throw new Error();
    return await response.json() as { unavailable?: boolean; suggestions?: AddressSuggestion[]; address?: Partial<Address> };
  }

  async function select(suggestion: AddressSuggestion) {
    cancelLookup();
    const controller = new AbortController();
    pending.current = controller;
    setExpanded(false);
    setStatus("Filling in your address…");
    try {
      const data = await lookup({ placeId: suggestion.id }, controller.signal);
      if (controller.signal.aborted) return;
      token.current = "";
      if (!data.address || data.unavailable) throw new Error();
      const filled = Object.fromEntries(Object.entries(data.address).filter(([, value]) => Boolean(value))) as Partial<Address>;
      setValues((current) => ({ ...current, ...filled }));
      setErrors((current) => ({ ...current, ...Object.fromEntries(Object.keys(filled).map((field) =>
        [field, addressFieldError(field as AddressField, filled[field as AddressField] ?? "", values.country)],
      )) }));
      if (filled.street2) setShowUnit(true);
      setSuggestions([]);
      setStatus("Address filled in. Check the details and add an apartment or unit if needed.");
      onChange?.({ ...values, ...filled });
    } catch {
      if (controller.signal.aborted) return;
      token.current = "";
      setManual(true);
      setStatus("This address could not be filled in. Enter the details manually below.");
    }
  }

  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      cancelLookup(); setExpanded(false); setStatus("");
      return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setExpanded(true);
      setActive((current) => event.key === "ArrowDown" ? (current + 1) % suggestions.length : (current <= 0 ? suggestions.length : current) - 1);
    } else if (event.key === "Enter" && expanded && active >= 0) {
      event.preventDefault(); void select(suggestions[active]);
    }
  }

  const inputProps = {
    id, values, errors, fieldNames, disabled, showUnit, manual, active,
    expanded: expanded && suggestions.length > 0, onChange: change, onKeyDown: keyboard,
    onError: (field: AddressField, message: string) => setErrors((current) => ({ ...current, [field]: message })),
  };

  return <div className="address-fields" ref={root}>
    {includeName && <AddressInput {...inputProps} field="name" label="Full name" autoComplete="name" />}
    <div className="address-search" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) { cancelLookup(); setExpanded(false); }
    }}>
      <AddressInput {...inputProps} field="street1" label="Street address" autoComplete="address-line1" />
      {!manual && expanded && suggestions.length > 0 && <div className="address-suggestions">
        <ul id={`${id}-suggestions`} role="listbox" aria-label="Suggested addresses">
          {suggestions.map((suggestion, index) => <li key={suggestion.id} role="presentation">
            <button type="button" role="option" aria-selected={active === index} id={`${id}-suggestion-${index}`} tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()} onClick={() => void select(suggestion)}>{suggestion.label}</button>
          </li>)}
        </ul>
        <span className="address-attribution" translate="no">Google Maps</span>
      </div>}
      <p className="address-help" id={`${id}-status`} role="status">{status || (manual ? "Enter your address in the fields below." : "Start typing your street address to see suggestions.")}</p>
      {isUS && <button className="text-button address-link" type="button" disabled={disabled} onClick={() => {
        cancelLookup(); setManual(!manual); setSuggestions([]); setExpanded(false); setStatus(""); token.current = "";
        root.current?.querySelector<HTMLInputElement>('[data-address-field="street1"]')?.focus();
      }}>{manual ? "Use address autocomplete" : "Enter address manually"}</button>}
    </div>
    {!showUnit && <button type="button" className="text-button address-link" disabled={disabled} aria-expanded={false} aria-controls={`${id}-street2`} onClick={() => {
      setShowUnit(true);
      requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>('[data-address-field="street2"]')?.focus());
    }}>+ Add apartment, suite, or unit (optional)</button>}
    <AddressInput {...inputProps} field="street2" label="Apartment, suite, or unit (optional)" autoComplete="address-line2" />
    <AddressInput {...inputProps} field="city" label="City" autoComplete="address-level2" />
    <div className="address-row">
      <AddressInput {...inputProps} field="state" label={isUS ? "State" : "State or region"} autoComplete="address-level1" />
      <AddressInput {...inputProps} field="zip" label={isUS ? "ZIP code" : "Postal code"} autoComplete="postal-code" />
    </div>
    <div className="address-country"><span>Country</span><strong>{countryName(values.country)}</strong><input type="hidden" name={name("country")} value={values.country} />{errors.country && <p className="address-error" role="alert">{errors.country}</p>}</div>
    {includePhone && <AddressInput {...inputProps} field="phone" label="Carrier contact phone" autoComplete="tel" />}
    {!manual && <p className="address-help">Suggestions by <span translate="no">Google Maps</span>. <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">Terms</a> · <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy</a></p>}
  </div>;
}

function AddressInput({ id, field, label, autoComplete, values, fieldNames, errors, disabled, showUnit, manual, expanded, active, onChange, onError, onKeyDown }: {
  id: string; field: Exclude<AddressField, "country">; label: string; autoComplete: string;
  values: Address; fieldNames: Partial<Record<AddressField, string>>; errors: Partial<Record<AddressField, string>>;
  disabled: boolean; showUnit: boolean; manual: boolean; expanded: boolean; active: number;
  onChange: (field: AddressField, value: string) => void;
  onError: (field: AddressField, error: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const isUS = values.country === "US";
  const errorId = `${id}-${field}-error`;
  const props = {
    id: `${id}-${field}`, name: fieldNames[field] ?? field, value: values[field], disabled,
    "data-address-field": field, required: field !== "street2" && (field !== "state" || ["US", "CA"].includes(values.country)),
    autoComplete: `shipping ${autoComplete}`, "aria-invalid": Boolean(errors[field]),
    "aria-describedby": [errors[field] ? errorId : "", field === "street1" ? `${id}-status` : ""].filter(Boolean).join(" ") || undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(field, event.target.value),
    onInvalid: (event: React.InvalidEvent<HTMLInputElement | HTMLSelectElement>) => {
      event.preventDefault();
      const element = event.currentTarget;
      onError(field, addressFieldError(field, element.value, values.country) || element.validationMessage);
      if (element.form?.querySelector(":invalid") === element) { openDetails(element); element.focus(); }
    },
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (event.target.value || errors[field]) onError(field, addressFieldError(field, event.target.value, values.country));
    },
  };
  return <div className="address-field" hidden={field === "street2" && !showUnit}>
    <label htmlFor={props.id}>{label}{props.required && <span className="address-required"> (required)</span>}</label>
    {field === "state" && isUS ? <select {...props} value={US_STATES.some(([code]) => code === values.state) ? values.state : ""}>
      <option value="">Select a state</option>
      {US_STATES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
    </select> : <input {...props}
      type={field === "phone" ? "tel" : "text"}
      maxLength={field === "zip" ? 20 : field === "phone" ? 50 : field === "city" ? 120 : 200}
      pattern={field === "zip" && isUS ? "[0-9]{5}(-[0-9]{4})?" : props.required ? ".*\\S.*" : undefined}
      inputMode={field === "zip" && isUS ? "numeric" : undefined}
      {...(field === "street1" && !manual ? {
        role: "combobox", "aria-autocomplete": "list" as const,
        "aria-expanded": expanded, "aria-controls": expanded ? `${id}-suggestions` : undefined,
        "aria-activedescendant": expanded && active >= 0 ? `${id}-suggestion-${active}` : undefined,
        onKeyDown,
      } : {})}
    />}
    {errors[field] && <p className="address-error" id={errorId} role="alert">{errors[field]}</p>}
  </div>;
}

function openDetails(element: HTMLElement | null) {
  for (let parent = element?.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
}
