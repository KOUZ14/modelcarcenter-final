export function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

const utcDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const utcDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatUtcDateTime(value: string) {
  const parsed = parseUtcDate(value);
  return Number.isNaN(parsed.getTime()) ? value : utcDateTimeFormatter.format(parsed);
}

export function formatUtcDate(value: string) {
  const parsed = parseUtcDate(value);
  return Number.isNaN(parsed.getTime()) ? value : utcDateFormatter.format(parsed);
}

function parseUtcDate(value: string) {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`);
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(trimmed)) {
    const isoValue = trimmed.replace(" ", "T");
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoValue);
    return new Date(hasTimezone ? isoValue : `${isoValue}Z`);
  }

  return new Date(trimmed);
}

export function formatCondition(condition: string) {
  return (
    (
      {
        new: "New",
        new_sealed: "New / sealed",
        new_opened: "New / opened",
        displayed: "Displayed",
        used: "Used",
        used_excellent: "Used / excellent",
      used_good: "Used / good",
        used_fair: "Used / fair",
        preowned: "Pre-owned",
        other: "Other",
        not_specified: "Not specified",
        mint: "Mint",
        near_mint: "Near mint",
        excellent: "Excellent",
        good: "Good",
        fair: "Fair",
        poor: "Poor",
        sealed: "Factory sealed",
        included: "Included",
        not_included: "Not included",
        reproduction: "Reproduction box",
        not_applicable: "Not applicable",
      } as Record<string, string>
    )[condition] ?? condition.replaceAll("_", " ")
  );
}
