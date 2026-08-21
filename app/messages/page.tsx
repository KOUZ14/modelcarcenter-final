import type { Metadata } from "next";
import { MessageCenter } from "@/components/message-center";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireCollector } from "@/lib/collector-auth";
import { getMessagingCenterData } from "@/lib/messaging";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Messages",
  description: "Private buyer and seller conversations.",
  robots: { index: false, follow: false },
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string; product?: string }>;
}) {
  const query = await searchParams;
  const returnTo = query.product
    ? `/messages?product=${encodeURIComponent(query.product)}`
    : query.conversation
      ? `/messages?conversation=${encodeURIComponent(query.conversation)}`
      : "/messages";
  const collector = await requireCollector(returnTo);
  const data = await getMessagingCenterData(collector.user.id, {
    conversationId: query.conversation,
    productId: query.product,
  });
  return (
    <main className="messages-page">
      <SiteHeader />
      <section className="messages-hero">
        <div className="shell messages-hero-layout">
          <div>
            <p className="eyebrow">Buyer · Seller</p>
            <h1>Collector conversations.</h1>
          </div>
          <p>
            Ask about condition, shipping, or anything else you need
            before a model joins your collection.
          </p>
        </div>
      </section>
      <div className="shell messages-shell">
        <MessageCenter initialData={data} />
      </div>
      <SiteFooter />
    </main>
  );
}
