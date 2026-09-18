import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Action } from "@/components/community-ui";
import { requireCollector } from "@/lib/collector-auth";
import { rows,blockSQL } from "@/lib/community";
export const dynamic='force-dynamic';
export const metadata={title:'Notifications',robots:{index:false,follow:false}};
export default async function NotificationsPage(){const c=await requireCollector('/notifications'),notifications=await rows<{id:string;label:string;href:string;category:string;readAt:number|null}>(`SELECT n.id,n.label,n.href,n.category,n.read_at readAt FROM community_notifications n WHERE n.owner_id=? AND ${blockSQL('n.actor_id')} ORDER BY n.created_at DESC LIMIT 100`,c.user.id,c.user.id,c.user.id);return <><SiteHeader/><main id="main-content" className="community-detail shell"><h1>Notifications</h1><Link href="/profile?edit=1">Notification preferences</Link><Action payload={{action:'read_notifications'}}>Mark all read</Action>{['transactional','social','discovery'].map(category=><section className="notification-group" key={category}><h2>{category==='transactional'?'Transactions':category==='social'?'Social':'Discovery'}</h2>{notifications.filter(n=>n.category===category).map(n=><p key={n.id}><Link href={n.href}>{n.label}</Link>{!n.readAt&&<small> · Unread</small>}</p>)}{!notifications.some(n=>n.category===category)&&<p>No new notifications.</p>}</section>)}<Link href="/account?view=orders">Marketplace orders & updates</Link></main></>;}
