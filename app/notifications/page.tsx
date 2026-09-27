import { SiteHeader } from "@/components/site-header";
import { NotificationsInbox, type Notification } from "@/components/notifications-inbox";
import { requireCollector } from "@/lib/collector-auth";
import { rows, one, blockSQL } from "@/lib/community";
export const dynamic='force-dynamic';
export const metadata={title:'Notifications',robots:{index:false,follow:false}};
export default async function NotificationsPage() {
  const collector = await requireCollector('/notifications');
  const visible = `n.owner_id=? AND ${blockSQL('n.actor_id')}`;
  const bindings = [collector.user.id, collector.user.id, collector.user.id];
  const [notifications, unread] = await Promise.all([
    rows<Notification>(`SELECT n.id,n.label,n.href,n.category,n.read_at readAt FROM community_notifications n WHERE ${visible} ORDER BY n.created_at DESC,n.id DESC LIMIT 100`, ...bindings),
    // Include older unread updates beyond the most recent 100 displayed here.
    one<{count:number}>(`SELECT count(*) count FROM community_notifications n WHERE ${visible} AND n.read_at IS NULL`, ...bindings),
  ]);
  return <><SiteHeader searchDisplay="compact"/><NotificationsInbox notifications={notifications} unreadCount={unread?.count ?? 0}/></>;
}
