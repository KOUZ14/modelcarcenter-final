import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ProfileEditor } from "@/components/collector-profile";
import { requireCollector } from "@/lib/collector-auth";
import { settings } from "@/lib/community";
export const dynamic="force-dynamic";
export const metadata={title:'Profile',robots:{index:false,follow:false}};
export default async function ProfilePage({searchParams}:{searchParams:Promise<{edit?:string;returnTo?:string}>}){const q=await searchParams,c=await requireCollector(q.edit?'/profile?edit=1'+(q.returnTo?'&returnTo='+encodeURIComponent(q.returnTo):''):'/profile'),s=await settings(c.user.id);if(!q.edit&&c.profile.handle&&s.published)redirect(`/collectors/${c.profile.handle}`);return <><SiteHeader/><main id="main-content" className="community-detail shell"><ProfileEditor profile={c.profile} settings={s} returnTo={q.returnTo?.startsWith('/collection?edit=')?q.returnTo:undefined}/></main></>;}
