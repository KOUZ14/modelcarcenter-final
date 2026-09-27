export function additionalShippingPolicy(
  summary: string,
  handlingTimeBusinessDays: number,
) {
  // Only omit a complete sentence that repeats the structured dispatch time.
  // Keep delivery estimates, different timeframes, and carrier instructions.
  const repeatedDispatch = new RegExp(
    `^(?:ships?|dispatch(?:es)?) (?:in|within) ${handlingTimeBusinessDays} business days?[.!]?$`,
    "i",
  );

  return summary
    .split(/(?<=[.!?])\s+|[\r\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !repeatedDispatch.test(sentence))
    .join(" ");
}
