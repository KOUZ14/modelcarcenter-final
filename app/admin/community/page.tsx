import { requireAdminPage } from "@/lib/admin-auth";
import { SiteHeader } from "@/components/site-header";
import { CommunityModeration } from "@/components/community-moderation";
export const dynamic='force-dynamic';
export const metadata={title:'Community moderation',robots:{index:false,follow:false}};
export default async function CommunityAdmin(){await requireAdminPage();return <><SiteHeader/><main id="main-content" className="community-detail shell"><CommunityModeration/></main></>;}
