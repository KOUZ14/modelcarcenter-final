import { requireAdminPage } from "@/lib/admin-auth";
import { PromotionAdmin } from "@/components/promotion-admin";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export const dynamic = "force-dynamic";
export const metadata = { title: "Promoted listings administration", robots: { index: false, follow: false } };
export default async function Page() {
  await requireAdminPage();
  return <main><SiteHeader/><div className="inner-page shell" id="main-content" tabIndex={-1}><h1>Promoted listings</h1><PromotionAdmin/></div><SiteFooter/></main>;
}
