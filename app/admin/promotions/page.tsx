import { requireAdminPage } from "@/lib/admin-auth";
import { PromotionAdmin } from "@/components/promotion-admin";
import { AdminFrame } from "@/components/admin-frame";
import { adminEnvironment } from "@/lib/admin-environment";
export const dynamic = "force-dynamic";
export const metadata = { title: "Promoted listings", robots: { index: false, follow: false } };
export default async function Page() {
  const user = await requireAdminPage();
  return <AdminFrame adminEmail={user.email} environment={adminEnvironment()}><h1>Promoted listings</h1><PromotionAdmin/></AdminFrame>;
}
