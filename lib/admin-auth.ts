import { redirect } from "next/navigation";
import { getChatGPTUser, requireChatGPTUser } from "@/app/chatgpt-auth";

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
  return allowedEmails().has(user.email.toLowerCase()) ? user : null;
}

export async function requireAdminPage() {
  if (hasLocalAdminBypass()) return { email: "local-admin@development.invalid", displayName: "Local admin", fullName: "Local admin" };
  const user = await requireChatGPTUser("/admin");
  if (!allowedEmails().has(user.email.toLowerCase())) redirect("/admin/access-denied");
  return user;
}

export async function requireAdminApi() {
  const identity = await getAdminIdentity();
  if (!identity) {
    return Response.json(
      { error: "Admin access requires ChatGPT sign-in and an email listed in ADMIN_EMAILS." },
      { status: 403 },
    );
  }
  return identity;
}
