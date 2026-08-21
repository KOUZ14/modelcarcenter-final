"use client";

import Link from "next/link";
import Image from "next/image";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { MessagingCenterData } from "@/lib/messaging";
import { MAX_MESSAGE_LENGTH } from "@/lib/messaging-rules";

export function MessageCenter({
  initialData,
}: {
  initialData: MessagingCenterData;
}) {
  const [data, setData] = useState(initialData);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState("");
  const [error, setError] = useState("");
  const threadEnd = useRef<HTMLDivElement>(null);
  const active = data.activeConversation;

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [active?.id, active?.messages.length]);

  useEffect(() => {
    if (!active?.unreadCount) return;
    const unread = active.unreadCount;
    void post({ action: "mark_read", conversationId: active.id }).then(
      (response) => {
        if (!response.ok) return;
        setData((current) => ({
          ...current,
          totalUnread: Math.max(0, current.totalUnread - unread),
          conversations: current.conversations.map((item) =>
            item.id === active.id ? { ...item, unreadCount: 0 } : item,
          ),
          activeConversation:
            current.activeConversation?.id === active.id
              ? { ...current.activeConversation, unreadCount: 0 }
              : current.activeConversation,
        }));
      },
    );
  }, [active?.id, active?.unreadCount]);

  async function openConversation(conversationId: string) {
    if (conversationId === active?.id || loadingConversation) return;
    setError("");
    setLoadingConversation(conversationId);
    try {
      const response = await fetch(
        `/api/messages?conversation=${encodeURIComponent(conversationId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as ApiResponse;
      if (!response.ok || !body.data)
        throw new Error(body.error || "The conversation could not be opened.");
      setData(body.data);
      setDraft("");
      history.replaceState(
        null,
        "",
        `/messages?conversation=${encodeURIComponent(conversationId)}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The conversation could not be opened.",
      );
    } finally {
      setLoadingConversation("");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      const payload = data.newConversation
        ? {
            action: "start",
            productId: data.newConversation.productId,
            body: draft,
          }
        : { action: "send", conversationId: active?.id, body: draft };
      const response = await post(payload);
      const body = (await response.json()) as ApiResponse;
      if (!response.ok || !body.data)
        throw new Error(body.error || "The message could not be sent.");
      setData(body.data);
      setDraft("");
      if (body.data.activeConversation)
        history.replaceState(
          null,
          "",
          `/messages?conversation=${encodeURIComponent(body.data.activeConversation.id)}`,
        );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The message could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  function submitShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="message-workspace">
      <aside className="conversation-panel">
        <div className="conversation-panel-heading">
          <div>
            <p className="eyebrow">Inbox</p>
            <h2>Messages</h2>
          </div>
          {data.totalUnread > 0 && (
            <span>{data.totalUnread} unread</span>
          )}
        </div>
        <div className="conversation-list" aria-label="Conversations">
          {data.conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={
                conversation.id === active?.id && !data.newConversation
                  ? "active"
                  : ""
              }
              type="button"
              disabled={loadingConversation === conversation.id}
              onClick={() => void openConversation(conversation.id)}
            >
              <span className="conversation-avatar">
                {conversation.otherPartyName.slice(0, 1).toUpperCase()}
              </span>
              <span className="conversation-copy">
                <span>
                  <b>{conversation.otherPartyName}</b>
                  <time>{relativeDate(conversation.lastMessageAt)}</time>
                </span>
                <strong>{conversation.productTitle}</strong>
                <small>
                  {loadingConversation === conversation.id
                    ? "Opening…"
                    : conversation.lastMessagePreview || "New conversation"}
                </small>
              </span>
              {conversation.unreadCount > 0 && (
                <span className="unread-badge" aria-label={`${conversation.unreadCount} unread`}>
                  {conversation.unreadCount}
                </span>
              )}
            </button>
          ))}
          {!data.conversations.length && (
            <div className="conversation-list-empty">
              <span>01</span>
              <b>Your inbox is ready.</b>
              <p>Open any listing and choose “Message seller” to begin.</p>
            </div>
          )}
        </div>
      </aside>

      <section className="message-thread" aria-live="polite">
        {data.newConversation ? (
          <ComposeHeader item={data.newConversation} />
        ) : active ? (
          <ThreadHeader item={active} />
        ) : (
          <EmptyThread />
        )}

        {active && !data.newConversation && (
          <div className="message-history">
            <p className="message-private-note">
              Private to you and {active.otherPartyName}
            </p>
            {active.messages.map((message) => (
              <article
                key={message.id}
                className={message.isOwn ? "message-bubble own" : "message-bubble"}
              >
                <div>
                  <b>{message.senderLabel}</b>
                  <time>{fullDate(message.createdAt)}</time>
                </div>
                <p>{message.body}</p>
              </article>
            ))}
            <div ref={threadEnd} />
          </div>
        )}

        {(active || data.newConversation) && (
          <form className="message-composer" onSubmit={submit}>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {data.newConversation?.unavailableReason ? (
              <p className="message-unavailable">
                {data.newConversation.unavailableReason}
              </p>
            ) : (
              <>
                <label htmlFor="message-body">Message</label>
                <textarea
                  id="message-body"
                  rows={4}
                  value={draft}
                  maxLength={MAX_MESSAGE_LENGTH}
                  placeholder="Ask about condition, photos, provenance, or shipping…"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={submitShortcut}
                  required
                />
                <div>
                  <small>
                    Keep payment and shipping arrangements on Model Car Center. ·{" "}
                    {draft.length}/{MAX_MESSAGE_LENGTH}
                  </small>
                  <button className="button dark small" disabled={busy || !draft.trim()}>
                    {busy ? "Sending…" : data.newConversation ? "Start conversation" : "Send message"}
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </section>
    </div>
  );
}

function ComposeHeader({
  item,
}: {
  item: NonNullable<MessagingCenterData["newConversation"]>;
}) {
  return (
    <header className="message-thread-header">
      <ProductThumb src={item.productImageUrl} title={item.productTitle} />
      <div>
        <p className="eyebrow">New conversation with {item.sellerName}</p>
        <h2>{item.productTitle}</h2>
        <p>
          <Link href={`/products/${item.productSlug}`}>View listing</Link>
          <span>·</span>
          <Link href={`/sellers/${item.sellerSlug}`}>View seller</Link>
        </p>
      </div>
    </header>
  );
}

function ThreadHeader({
  item,
}: {
  item: NonNullable<MessagingCenterData["activeConversation"]>;
}) {
  return (
    <header className="message-thread-header">
      <ProductThumb src={item.productImageUrl} title={item.productTitle} />
      <div>
        <p className="eyebrow">
          {item.viewerRole === "buyer" ? "Seller" : "Buyer"} · {item.otherPartyName}
        </p>
        <h2>{item.productTitle}</h2>
        <p>
          {item.productId && <Link href={`/products/${item.productSlug}`}>View listing</Link>}
          {item.productId && <span>·</span>}
          <Link href={`/sellers/${item.sellerSlug}`}>Seller profile</Link>
        </p>
      </div>
    </header>
  );
}

function ProductThumb({ src, title }: { src: string | null; title: string }) {
  return src ? (
    <Image
      className="message-product-image"
      src={src}
      alt={title}
      width={70}
      height={70}
      unoptimized
    />
  ) : (
    <span className="message-product-placeholder" aria-label={`No image for ${title}`}>
      MCC
    </span>
  );
}

function EmptyThread() {
  return (
    <div className="message-thread-empty">
      <p className="eyebrow">Private marketplace messaging</p>
      <h2>Select a conversation.</h2>
      <p>
        Your buyer and seller conversations stay connected to the listing, so
        details remain easy to reference.
      </p>
      <Link className="button dark small" href="/marketplace">
        Browse models
      </Link>
    </div>
  );
}

type ApiResponse = {
  ok?: boolean;
  error?: string;
  data?: MessagingCenterData;
};

function post(payload: Record<string, unknown>) {
  return fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function relativeDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
