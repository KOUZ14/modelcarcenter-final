import { MessageCenter } from "@/components/message-center";
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
export default async function MessagesPage({searchParams}:{searchParams:Promise<Record<string,string>>}){const q=await searchParams,c=await requireCollector(`/messages?${new URLSearchParams(q)}`),[data,threads,messages,offers]=await Promise.all([getMessagingCenterData(c.user.id,{conversationId:q.conversation,productId:q.product}),collectorInbox(c.user.id),q.thread?threadMessages(c.user.id,q.thread):[],getCollectionOffers(c.user.id)]);return <><SiteHeader/><main id="main-content" className="messages-shell shell"><div className="community-title"><div><p className="eyebrow">Collectors & marketplace</p><h1>Inbox</h1></div></div><CollectorInbox userId={c.user.id} threads={threads} messages={messages} offers={offers} selectedId={q.thread} recipient={q.collector} itemId={q.item} tab={q.tab||'messages'}/>{(!q.tab||q.tab==='messages')&&<section className="marketplace-conversations"><h2>Marketplace conversations</h2><CombinedShippingRequests/><MessageCenter initialData={data}/></section>}</main><SiteFooter/></>;}
