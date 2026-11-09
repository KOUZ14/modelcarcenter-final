export async function storeRequest(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try { response = await fetch(url, init); }
  catch { throw new Error("Connection lost. Your edits are still here. Check your connection and retry; if you were saving a new item, check inventory for your SKU first."); }
  const body = await response.json().catch(() => null) as (Record<string, unknown> & { error?: string; fields?: Record<string, string> }) | null;
  if (!response.ok || !body) {
    const message = response.status === 401 ? "Your session expired. Sign in again in another tab, then retry. Your edits are still here." : body?.error || "We could not confirm this change. Check inventory before retrying.";
    throw Object.assign(new Error(message), { fields: body?.fields, status: response.status });
  }
  return body;
}
