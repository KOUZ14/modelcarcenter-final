export function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
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
