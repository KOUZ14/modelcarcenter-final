export const DISPUTE_RELEASE_STATUSES = [
  "won",
  "prevented",
  "warning_closed",
] as const;

export const DISPUTE_TERMINAL_STATUSES = [
  ...DISPUTE_RELEASE_STATUSES,
  "lost",
] as const;

export function disputePayoutDisposition(status: string) {
  if (status === "lost") return "cancel" as const;
  if ((DISPUTE_RELEASE_STATUSES as readonly string[]).includes(status)) {
    return "release" as const;
  }
  return "hold" as const;
}

export function disputeIsTerminal(status: string) {
  return (DISPUTE_TERMINAL_STATUSES as readonly string[]).includes(status);
}
