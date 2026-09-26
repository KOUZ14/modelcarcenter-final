import { getMessagingCenterData } from "@/lib/messaging";
import { collectorInbox, threadMessages } from "@/lib/collector-messaging";
import { getCollectionOffers } from "@/lib/collection-offers";
import { MessageCenter } from "./message-center";
import { CollectorInbox } from "./collector-inbox";
import { CombinedShippingRequests } from "./combined-shipping-requests";
import { SellerInboxNavigation } from "./seller-inbox-navigation";

export async function SellerMessages({ userId, conversation, thread, tab }: { userId: string; conversation?: string; thread?: string; tab?: string }) {
  const [data, threads, offers] = await Promise.all([getMessagingCenterData(userId, { conversationId: conversation, sellerOnly: true }), collectorInbox(userId), getCollectionOffers(userId)]);
  const selectedTab = tab === "shipping" ? "shipping" : tab === "requests" ? "requests" : tab === "offers" ? "offers" : thread || tab === "messages" || !data.conversations.length ? "messages" : "orders";
  const selectedId = thread ?? threads.find(item => selectedTab === "requests" ? item.status === "request" : item.status === "accepted")?.id;
  const messages = ["messages", "requests"].includes(selectedTab) && selectedId ? await threadMessages(userId, selectedId) : [];
  const tabs = [...(data.conversations.length ? [["orders", "Listing enquiries"]] : []), ["messages", "Messages"], ["requests", "Requests"], ["offers", "Offers"], ["shipping", "Shipping requests"]];
  return <div className="store-stack seller-messages"><header className="store-page-heading"><div><h2>Buyer messages</h2><p>Reply to enquiries and manage shipping quotes from your Seller Hub.</p></div></header><SellerInboxNavigation tabs={tabs} selected={selectedTab}/>
    {selectedTab === "shipping" ? <CombinedShippingRequests sellerContext/> : selectedTab === "orders" ? <MessageCenter key={conversation ?? "seller-inbox"} initialData={data} sellerContext/> : <CollectorInbox userId={userId} threads={threads} messages={messages} offers={offers} selectedId={selectedId} tab={selectedTab} basePath="/store?view=messages" hideNavigation/>}
  </div>;
}
