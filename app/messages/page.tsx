import Link from "next/link";
import { CombinedShippingRequests } from "@/components/combined-shipping-requests";
import { CollectorInbox } from "@/components/collector-inbox";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { requireCollector } from "@/lib/collector-auth";
import { getMessagingCenterData } from "@/lib/messaging";
import { collectorInbox,threadMessages } from "@/lib/collector-messaging";
import { getCollectionOffers } from "@/lib/collection-offers";
export const dynamic='force-dynamic';
export const metadata={title:'Inbox',description:'Private collector and marketplace conversations.',robots:{index:false,follow:false}};
export default async function MessagesPage({searchParams}:{searchParams:Promise<Record<string,string>>}) {
  const q = await searchParams;
  const c = await requireCollector(`/messages?${new URLSearchParams(q)}`);
  const [data, threads, offers] = await Promise.all([
    getMessagingCenterData(c.user.id, { conversationId: q.conversation, productId: q.product, sellerId: q.seller }),
    collectorInbox(c.user.id), getCollectionOffers(c.user.id),
  ]);
  const composing = !!(q.seller || q.product);
  const requestedThread = threads.find(thread => thread.id === q.thread);
  const tab = q.tab === "shipping" || q.tab === "offers" ? q.tab
    : composing || q.conversation || q.collector ? "messages"
    : requestedThread ? requestedThread.status === "request" ? "requests" : "messages"
    : q.tab === "requests" ? "requests" : "messages";
  const latestThread = threads.find(thread => thread.status !== "request");
  const latestMarketplace = data.activeConversation;
  const marketplaceActive = tab === "messages" && !q.collector && (composing || !!q.conversation ||
    (!q.thread && !!latestMarketplace && (!latestThread || Date.parse(latestMarketplace.lastMessageAt) > latestThread.updatedAt)));
  const selectedId = tab === "offers" || tab === "shipping" || marketplaceActive || q.collector ? undefined
    : requestedThread?.id ?? (q.thread ? undefined : tab === "requests" ? threads.find(thread => thread.status === "request")?.id : latestThread?.id);
  const messages = selectedId ? await threadMessages(c.user.id, selectedId) : [];
  const requestCount = threads.filter(thread => thread.status === "request" && thread.recipientId === c.user.id).length;
  return <><SiteHeader/><main id="main-content" className="messages-shell shell">
    <div className="community-title"><div><p className="eyebrow">Collectors &amp; marketplace</p><h1>Inbox</h1></div></div>
    <nav className="inbox-navigation" aria-label="Inbox">
      <Link href="/messages" aria-current={tab === "messages" ? "page" : undefined}>Messages</Link>
      <Link href="/messages?tab=requests" aria-current={tab === "requests" ? "page" : undefined}>Requests {requestCount > 0 && <span>{requestCount}</span>}</Link>
      <Link href="/messages?tab=offers" aria-current={tab === "offers" ? "page" : undefined}>Offers</Link>
      <Link href="/messages?tab=shipping" aria-current={tab === "shipping" ? "page" : undefined}>Shipping</Link>
    </nav>
    {tab === "shipping" ? <div className="inbox-shipping"><CombinedShippingRequests/></div> :
      <CollectorInbox key={`${tab}:${selectedId || q.collector || q.seller || q.product || data.activeConversation?.id || "empty"}`}
        userId={c.user.id} threads={threads.map(thread => thread.id === selectedId ? { ...thread, unread: 0 } : thread)}
        messages={messages} offers={offers} selectedId={selectedId} recipient={q.collector} itemId={q.item} tab={tab}
        hideNavigation marketplaceData={data} marketplaceActive={marketplaceActive}/>}
  </main><SiteFooter/></>;
}
