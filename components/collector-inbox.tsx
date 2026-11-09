"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Thread } from "@/lib/collector-messaging";
import type { CollectionOffer } from "@/lib/collection-offers";
import type { MessagingCenterData } from "@/lib/messaging";
import { formatUtcDate, formatUtcDateTime } from "@/lib/format";
import { Action, PhotoUpload, ReportButton, communityRequest, photoUrl } from "./community-ui";
import { OfferCard } from "./collection-offers";
import { CollectorAvatar } from "./collector-avatar";
import { Icon } from "./icons";
import { MessageCenter } from "./message-center";
import "./collector-inbox.css";

type Message = { id: string; ownerId: string; body: string; photoId: string | null; offerId: string | null; createdAt: number };
const endpoint = "/api/collectors/messages";

export function CollectorInbox({
  userId, threads, messages, offers, selectedId, recipient, itemId, tab: requestedTab, basePath = "/messages", hideNavigation = false,
  marketplaceData, marketplaceActive = false,
}: {
  userId: string; threads: Thread[]; messages: Message[]; offers: CollectionOffer[];
  selectedId?: string; recipient?: string; itemId?: string; tab: string; basePath?: string; hideNavigation?: boolean;
  marketplaceData?: MessagingCenterData; marketplaceActive?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [marketplace, setMarketplace] = useState(marketplaceData);
  const router = useRouter();
  const history = useRef<HTMLDivElement>(null);
  const selected = threads.find(thread => thread.id === selectedId);
  // Accepted requests can still be opened from an older request URL.
  const tab = requestedTab === "offers" || !selected ? requestedTab : selected.status === "request" ? "requests" : "messages";
  const refresh = () => router.refresh();
  const inboxHref = (params: string) => `${basePath}${basePath.includes("?") ? "&" : "?"}${params}`;
  const visibleThreads = [
    ...threads.filter(thread => tab === "requests" ? thread.status === "request" : thread.status !== "request").map(thread => ({
      key: `collector:${thread.id}`, name: thread.otherName, avatar: thread.otherAvatarUrl,
      reference: thread.reference || "Collector conversation", unread: thread.unread, updatedAt: thread.updatedAt,
      selected: !marketplaceActive && thread.id === selectedId,
      href: inboxHref(`thread=${encodeURIComponent(thread.id)}&tab=${thread.status === "request" ? "requests" : "messages"}`),
      subtitle: thread.status === "request" ? "Awaiting acceptance" : thread.status === "declined" ? "Request declined" : "Private conversation",
    })),
    ...(tab === "messages" ? marketplace?.conversations ?? [] : []).map(conversation => ({
      key: `marketplace:${conversation.id}`, name: conversation.otherPartyName, avatar: conversation.otherPartyAvatarUrl,
      reference: conversation.productTitle, unread: conversation.unreadCount, updatedAt: Date.parse(conversation.lastMessageAt),
      selected: marketplaceActive && !marketplace?.newConversation && marketplace?.activeConversation?.id === conversation.id,
      href: inboxHref(`conversation=${encodeURIComponent(conversation.id)}&tab=messages`),
      subtitle: conversation.lastMessagePreview || "Marketplace conversation",
    })),
  ].filter(thread => `${thread.name} ${thread.reference}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const requestCount = threads.filter(thread => thread.status === "request" && thread.recipientId === userId).length;

  useEffect(() => {
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [selectedId, messages.length, tab]);

  return <section className="collector-inbox">
    {!hideNavigation && <nav className="community-tabs" aria-label="Inbox">
      <Link aria-current={tab === "messages" ? "page" : undefined} href={basePath}>Messages</Link>
      <Link aria-current={tab === "offers" ? "page" : undefined} href={inboxHref("tab=offers")}>Offers</Link>
      <Link aria-current={tab === "requests" ? "page" : undefined} href={inboxHref("tab=requests")}>Requests {requestCount || ""}</Link>
    </nav>}

    {tab === "offers" ? <div className="offer-grid">
      {offers.length ? offers.map(offer => <OfferCard key={offer.id} offer={offer} userId={userId} onChange={refresh}/>) :
        <p>No offers yet. Explore public collections for pieces marked Open to offers.</p>}
    </div> : <div className="collector-conversations">
      <aside className="collector-conversation-sidebar">
        <div className="collector-conversation-search">
          <div className="collector-conversation-title"><h2>{tab === "requests" ? "Message requests" : "Conversations"}</h2><span>{visibleThreads.length}</span></div>
          <label>
            <span className="sr-only">Search conversations</span>
            <Icon name="search"/>
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Collector or item"/>
          </label>
        </div>
        <nav className="collector-conversation-list" aria-label="Conversations">
          {visibleThreads.map(thread => <Link key={thread.key} aria-current={thread.selected ? "page" : undefined} href={thread.href}>
            <CollectorAvatar name={thread.name} src={thread.avatar}/>
            <span className="collector-conversation-copy">
              <strong>{thread.name}</strong>
              <span>{thread.reference}</span>
              <small>{thread.subtitle}</small>
            </span>
            {thread.unread > 0 && <span className="collector-unread" aria-label={`${thread.unread} unread messages`}>{thread.unread}</span>}
          </Link>)}
          {!visibleThreads.length && <div className="collector-list-empty" role="status">
            <Icon name={query ? "search" : "message"}/>
            <strong>{query ? "No conversations found" : tab === "requests" ? "No message requests" : "No conversations yet"}</strong>
            <p>{query ? "Try another collector name or item." : tab === "requests" ? "New message requests will appear here." : "Start a conversation from a collector’s profile or collection."}</p>
            {query && <button type="button" className="collector-text-button" onClick={() => setQuery("")}>Clear search</button>}
          </div>}
        </nav>
      </aside>

      <section className="collector-thread" key={selected?.id || recipient || "empty"} aria-label={selected ? `Conversation with ${selected.otherName}` : "Conversation"}>
        {marketplaceActive && marketplaceData ? <MessageCenter embedded initialData={marketplaceData} onDataChange={setMarketplace}/> : recipient && !selected ? <>
          <header className="collector-new-thread"><Icon name="message"/><h2>Start a conversation</h2><p>Send a private message about a model or collection. Some collectors may need to accept your request before you can send more.</p></header>
          <CollectorMessageComposer label="Send message request" onSend={async body => {
            const result = await communityRequest({ action: "start", recipientId: recipient, itemId, body }, endpoint);
            router.push(inboxHref(`thread=${encodeURIComponent(result.id)}&tab=requests`));
            refresh();
          }}/>
        </> : selected ? <>
          <header className="collector-thread-heading">
            <CollectorAvatar name={selected.otherName} src={selected.otherAvatarUrl}/>
            <div className="collector-thread-title"><h2>{selected.otherName}</h2><p>Private conversation</p></div>
            <details className="collector-thread-options">
              <summary>Options <span aria-hidden="true">⌄</span></summary>
              <div><Action className="collector-text-button" payload={{ action: "relationship", kind: "block", targetId: selected.senderId === userId ? selected.recipientId : selected.senderId }} onDone={refresh}>Block collector</Action></div>
            </details>
          </header>
          {selected.reference && <div className="collector-item-reference"><div><span>About this piece</span><strong>{selected.reference}</strong></div>
            {selected.itemId && <Link href={`/collection/${selected.itemId}`}>View piece <Icon name="arrow"/></Link>}
          </div>}
          {selected.status === "request" && <div className="collector-request-notice">
            <p>{selected.recipientId === userId ? "Accept this request to reply and share photos." : "Your message request has been sent. You can reply when it’s accepted."}</p>
            {selected.recipientId === userId && <div className="community-buttons">
              <Action className="button dark" endpoint={endpoint} payload={{ action: "accept_request", id: selected.id }} onDone={() => { router.push(inboxHref(`thread=${encodeURIComponent(selected.id)}&tab=messages`)); refresh(); }}>Accept request</Action>
              <Action endpoint={endpoint} payload={{ action: "decline_request", id: selected.id }} onDone={refresh}>Decline</Action>
            </div>}
          </div>}
          <div className="collector-message-history" ref={history} role="log" aria-label="Messages" aria-relevant="additions text" tabIndex={0}>
            {messages.map((message, index) => {
              const date = new Date(message.createdAt).toISOString();
              const own = message.ownerId === userId;
              const offer = message.offerId ? offers.find(offer => offer.id === message.offerId) : undefined;
              const startsDay = index === 0 || date.slice(0, 10) !== new Date(messages[index - 1].createdAt).toISOString().slice(0, 10);
              return <div className="collector-message-group" key={message.id}>
                {startsDay && <p className="collector-message-date">{formatUtcDate(date)}</p>}
                <article className={`collector-message${own ? " own-message" : ""}`}>
                  <div className="collector-message-meta"><strong>{own ? "You" : selected.otherName}</strong><time dateTime={date} title={formatUtcDateTime(date)}>{date.slice(11, 16)} UTC</time></div>
                  <p>{message.body}</p>
                  {message.photoId && <img src={photoUrl(message.photoId)} alt="Private conversation photo" width={400} height={300} onLoad={() => {
                    if (history.current && history.current.scrollHeight - history.current.scrollTop - history.current.clientHeight < 350) history.current.scrollTop = history.current.scrollHeight;
                  }}/>}
                  {offer && <OfferCard offer={offer} userId={userId} onChange={refresh}/>}
                  {!own && <div className="collector-message-report"><ReportButton type="message" id={message.id}/></div>}
                </article>
              </div>;
            })}
            {!messages.length && <p className="collector-history-empty">No messages yet. Say hello to start the conversation.</p>}
          </div>
          {selected.status === "accepted" && <CollectorMessageComposer allowPhoto onSend={async (body, photoId) => {
            await communityRequest({ action: "send", id: selected.id, body, photoId }, endpoint);
            refresh();
          }}/>}</> : <div className="collector-thread-empty"><span><Icon name="message"/></span><h2>Your conversations, in one place</h2><p>Select a conversation to read messages, share photos, and talk about your next model.</p><Link href="/community?view=collectors">Explore collectors <Icon name="arrow"/></Link></div>}
      </section>
    </div>}
    <p className="collector-inbox-privacy">Private messages stay out of public search and notification previews. <Link href="/resolution">Order support and disputes</Link> remain available.</p>
  </section>;
}

function CollectorMessageComposer({ onSend, allowPhoto = false, label = "Send message" }: {
  onSend: (body: string, photoId?: string) => Promise<void>; allowPhoto?: boolean; label?: string;
}) {
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const attachment = useRef<HTMLDetailsElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || uploading || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await onSend(body.trim(), photos[0]);
      setBody("");
      setPhotos([]);
      if (attachment.current) attachment.current.open = false;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your message could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="collector-message-composer" onSubmit={submit} aria-busy={busy || uploading}>
    <label><span>Message <small>{body.length}/2000</small></span><textarea name="body" rows={3} required maxLength={2000} value={body} disabled={busy} placeholder="Write a message…" onChange={event => setBody(event.target.value)} onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
    }}/></label>
    <div className="collector-composer-actions">
      {allowPhoto && <details className="collector-attachment" ref={attachment}>
        <summary><span aria-hidden="true">＋</span> {photos.length ? "1 photo attached" : "Attach a private photo"}</summary>
        <fieldset disabled={busy}><PhotoUpload value={photos} onChange={setPhotos} maxPhotos={1} onBusyChange={setUploading}/></fieldset>
      </details>}
      <button type="submit" className="button dark" disabled={busy || uploading || !body.trim()}>{busy ? "Sending…" : label}<Icon name="arrow"/></button>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
  </form>;
}
