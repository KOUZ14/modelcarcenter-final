import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin-auth";
import { AdminFrame } from "@/components/admin-frame";
import { adminEnvironment } from "@/lib/admin-environment";
import { AdminDashboard } from "@/components/admin-dashboard";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export default async function AdminPage() { const user = await requireAdminPage(); return <AdminFrame adminEmail={user.email} environment={adminEnvironment()}><AdminDashboard/></AdminFrame>; }
