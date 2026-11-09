export const ADMIN_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

// Gateway headers are not sufficient proof of identity. Require an independently
// verified, revocable application session for the same allowlisted email.
export function verifiedAdminSession(
  gatewayEmail: string,
  session: { user: { email: string; emailVerified: boolean }; session: { createdAt: Date | string; expiresAt: Date | string } } | null,
  allowlist: ReadonlySet<string>,
  now = Date.now(),
) {
  const email = gatewayEmail.trim().toLowerCase();
  if (!session?.user.emailVerified || !allowlist.has(email) || session.user.email.trim().toLowerCase() !== email) return false;
  const createdAt = new Date(session.session.createdAt).getTime();
  const expiresAt = new Date(session.session.expiresAt).getTime();
  return Number.isFinite(createdAt) && createdAt <= now && now - createdAt < ADMIN_SESSION_MAX_AGE_MS && expiresAt > now;
}
