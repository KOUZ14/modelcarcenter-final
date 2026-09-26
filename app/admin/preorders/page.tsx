import { requireAdminPage } from "@/lib/admin-auth";
import { PreorderAdmin } from "@/components/preorder-admin";
import { AdminFrame } from "@/components/admin-frame";
import { adminEnvironment } from "@/lib/admin-environment";
export const dynamic = "force-dynamic";
export const metadata = { title: "Preorder operations", robots: { index: false, follow: false } };
export default async function Page() {
  const user = await requireAdminPage();
  return <AdminFrame adminEmail={user.email} environment={adminEnvironment()}><h1>Preorder operations</h1><PreorderAdmin/></AdminFrame>;
}
