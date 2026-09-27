import Link from "next/link";
import { Action } from "./community-ui";
import { Icon } from "./icons";
import "./notifications-page.css";

export type Notification = { id:string; label:string; href:string; category:string; readAt:number|null };

const categories = [
  { id: "transactional", title: "Transactions" },
  { id: "social", title: "Social" },
  { id: "discovery", title: "Discovery" },
] as const;

export function NotificationsInbox({ notifications, unreadCount }: { notifications:Notification[]; unreadCount:number }) {
  return <main id="main-content" tabIndex={-1} className="notifications-page shell">
    <header className="notifications-heading">
      <div><h1>Notifications</h1>{notifications.length > 0 && <p className="notifications-count" role="status">{unreadCount ? `${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}` : "All notifications are read."}</p>}</div>
      <div className="notifications-actions">
        <Link className="notification-preferences" href="/profile?edit=1#profile-messages" aria-label="Notification preferences"><Icon name="filters"/><span>Preferences</span></Link>
        {unreadCount > 0 && <Action className="notifications-mark-read" payload={{action:'read_notifications'}}><Icon name="check"/><span>Mark all read</span></Action>}
      </div>
    </header>

    {notifications.length === 0 ? <section className="notifications-empty" aria-labelledby="notifications-empty-title">
      <span className="notifications-empty-icon" aria-hidden="true"><Icon name="check"/></span>
      <h2 id="notifications-empty-title">You’re all caught up</h2>
      <p>Updates about your orders, replies and new followers will appear here.</p>
    </section> : <div className="notification-groups">
      {categories.map(category => {
        const items = notifications.filter(notification => notification.category === category.id);
        if (!items.length) return null;
        return <section className="notifications-category" key={category.id} aria-labelledby={`notifications-${category.id}`}>
          <h2 id={`notifications-${category.id}`}>{category.title}</h2>
          <ul>{items.map(notification => <li key={notification.id} className={notification.readAt === null ? "notification-unread" : undefined}>
            <Link href={notification.href}><span>{notification.label}</span>{notification.readAt === null && <span className="notification-unread-label">Unread</span>}<Icon name="arrow"/></Link>
          </li>)}</ul>
        </section>;
      })}
    </div>}

    <div className="notifications-orders"><Link href="/account?view=orders"><span>Marketplace orders &amp; updates</span><Icon name="arrow"/></Link></div>
  </main>;
}
