import { requireAdminPage } from "@/lib/admin-auth";
import { CommunityModeration } from "@/components/community-moderation";
import { AdminFrame } from "@/components/admin-frame";
import { adminEnvironment } from "@/lib/admin-environment";
export const dynamic = "force-dynamic";
export const metadata = { title: "Community moderation", robots: { index: false, follow: false } };
export default async function Page() {
  const user = await requireAdminPage();
  return <AdminFrame adminEmail={user.email} environment={adminEnvironment()}><CommunityModeration/></AdminFrame>;
}
