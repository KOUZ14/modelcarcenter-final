import { redirect } from "next/navigation";
import { getChatGPTUser, requireChatGPTUser } from "@/app/chatgpt-auth";
import { headers } from "next/headers";
import { getCollectorAuth } from "./auth";
import { verifiedAdminSession } from "./admin-session";

function allowedEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function hasLocalAdminBypass() {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_DEV_BYPASS === "true";
}

export async function getAdminIdentity() {
  if (hasLocalAdminBypass()) return { email: "local-admin@development.invalid", displayName: "Local admin", fullName: "Local admin" };
  const user = await getChatGPTUser();
  if (!user) return null;
  const session = await getCollectorAuth().api.getSession({ headers: await headers() });
  return verifiedAdminSession(user.email, session, allowedEmails()) ? user : null;
}

export async function requireAdminPage() {
  if (hasLocalAdminBypass()) return { email: "local-admin@development.invalid", displayName: "Local admin", fullName: "Local admin" };
  const user = await requireChatGPTUser("/admin");
  if (!allowedEmails().has(user.email.toLowerCase())) redirect("/admin/access-denied");
  const session = await getCollectorAuth().api.getSession({ headers: await headers() });
  if (!verifiedAdminSession(user.email, session, allowedEmails())) {
    redirect("/sign-in?returnTo=%2Fadmin&reauth=1");
  }
  return user;
}

export async function requireAdminApi() {
  const identity = await getAdminIdentity();
  if (!identity) {
    return Response.json(
      { error: "Admin access requires a recent verified sign-in with your authorized email. Sign in again to continue.", signInUrl: "/sign-in?returnTo=%2Fadmin&reauth=1" },
      { status: 403 },
    );
  }
  return identity;
}
