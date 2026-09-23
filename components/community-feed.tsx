"use client";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Collector, Piece, Post } from "@/lib/community";
import { CollectorCard, CommunityFrame, ModelPicker, PhotoUpload, PostCard, SubmitForm, communityRequest } from "./community-ui";

type FeedProps = { initialPosts: Post[]; collectors: Collector[]; tab: string; topic: string; limit: number; view: string; before: number };

function CollectorSuggestions({ collectors, className = "" }: { collectors: Collector[]; className?: string }) {
  if (!collectors.length) return null;
  return <section className={`collector-suggestions ${className}`} aria-label="Discover collectors">
    <div className="collector-suggestions-heading"><h2>Discover collectors</h2><Link href="/community?view=collectors">View all</Link></div>
    <p>Find a collection you’d like to follow.</p>
    {collectors.slice(0, 3).map(collector => <CollectorCard key={collector.userId} collector={collector}/>)}
  </section>;
}

export function CommunityFeed({ initialPosts, collectors, tab, topic, limit, view, before }: FeedProps) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [composer, setComposer] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newPosts, setNewPosts] = useState(false);
  const [error, setError] = useState("");
  const directory = view === "collectors" || view === "collections";
  useEffect(() => { queueMicrotask(() => setPosts(initialPosts)); }, [initialPosts]);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    try {
      if (!q.has("before")) {
        const saved = localStorage.getItem("mcc-community-feed");
        if (!q.has("tab")) q.set("tab", saved === "following" ? "following" : tab);
        q.set("before", String(before));
        router.replace("/community?" + q.toString(), { scroll: false });
      } else if (tab === "following" || tab === "for_you") localStorage.setItem("mcc-community-feed", tab);
    } catch { /* The feed also works when optional storage is unavailable. */ }
  }, [tab, router, before]);
  useEffect(() => {
    if (directory) return;
    const timer = setInterval(() => {
      void fetch(`/api/collectors?view=feed&tab=${tab}&topic=${encodeURIComponent(topic)}&limit=20`)
        .then(r => r.json()).then(d => { if (d.posts?.some((p: Post) => p.createdAt > Math.max(0, ...posts.map(p => p.createdAt)))) setNewPosts(true); }).catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, [posts, tab, topic, directory]);
  const refresh = () => {
    void fetch(`/api/collectors?view=feed&tab=${tab}&topic=${encodeURIComponent(topic)}&limit=${limit}&before=${before}`)
      .then(r => r.json()).then(d => { if (d.posts) setPosts(d.posts); else setError(d.error || "Feed unavailable."); }).catch(() => setError("Feed unavailable."));
  };
  const query = (values: Record<string, string>) => "/community?" + new URLSearchParams({ tab, topic, before: String(before), ...values }).toString();
  return <CommunityFrame view={view} tab={tab}>
    <section className="community-main">
      <div className="community-title">
        <h1>{view === "collectors" ? "Collectors" : view === "collections" ? "Collections" : "Community"}</h1>
        <button className="button dark" type="button" aria-expanded={composer} aria-controls="post-composer" onClick={() => setComposer(!composer)}>{composer ? "Close" : "Create post"}</button>
        <p>Collections, photos and conversations.</p>
      </div>
      {composer && <PostComposer onDone={id => { setComposer(false); router.push(`/community/posts/${encodeURIComponent(id)}`); }}/>}
      {directory ? <div className="collector-directory">
        {collectors.length ? collectors.map(c => <CollectorCard key={c.userId} collector={c}/>) : <div className="community-empty"><h2>The first showrooms start here</h2><p>Publish a shelf from your collection to let other collectors discover it.</p><Link href="/collection" className="button dark">Add a model</Link></div>}
      </div> : <>
        <div className="community-feed-toolbar">
          <nav className="community-tabs" aria-label="Community feeds">
            <Link aria-current={tab === "for_you" ? "page" : undefined} href={query({ tab: "for_you" })}>For you</Link>
            <Link aria-current={tab === "following" ? "page" : undefined} href={query({ tab: "following" })}>Following</Link>
            {tab === "saved" && <span aria-current="page">Saved</span>}
          </nav>
          <button className="community-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="community-topic-filters" onClick={() => setFiltersOpen(!filtersOpen)}>Filters{topic && <span aria-label="1 active filter">1</span>}</button>
        </div>
        <div id="community-topic-filters" className="community-topic-filters" hidden={!filtersOpen}>
          <form className="topic-filter" method="get" action="/community">
            <input type="hidden" name="tab" value={tab}/><input type="hidden" name="before" value={before}/>
            <label>Filter by topic<input key={topic} name="topic" defaultValue={topic} placeholder="Scale, model brand or car make"/></label>
            <button className="button outline" type="submit">Apply</button>
          </form>
          <div className="topic-chips" aria-label="Popular topics">{["1:64", "1:43", "1:18", "Porsche", "JDM", "Motorsport"].map(t => <Link key={t} className={topic === t ? "selected" : ""} aria-current={topic === t ? "true" : undefined} href={query({ topic: t })} onClick={() => setFiltersOpen(false)}>{t}</Link>)}</div>
        </div>
        {topic && <div className="active-community-filter"><span>Topic: <strong>{topic}</strong></span><Link href={query({ topic: "" })}>Clear filter</Link></div>}
        {newPosts && <button className="new-posts" type="button" onClick={() => { router.replace(query({ before: String(Date.now()) }), { scroll: false }); setNewPosts(false); }}>New posts available</button>}
        {error && <p role="alert">{error}</p>}
        <div className="community-post-stream">{posts.map((post, index) => <Fragment key={post.id}>
          <PostCard post={post} refresh={refresh}/>
          {index === Math.min(3, posts.length) - 1 && <CollectorSuggestions className="collector-suggestions-inline" collectors={collectors}/>}
        </Fragment>)}</div>
        {!posts.length && <div className="community-empty">
          <h2>{topic ? `No posts matching ${topic}` : tab === "following" ? "Your Following feed starts with people" : tab === "saved" ? "Keep inspiration for later" : "Start a collector conversation"}</h2>
          <p>{topic ? `No ${tab === "following" ? "posts from people you follow" : tab === "saved" ? "saved posts" : "posts"} match this topic. Try another topic or clear the filter.` : tab === "following" ? "Follow collectors to see their newest posts here in order." : tab === "saved" ? "Choose Save post on a photo or question to find it here later." : "Share a display, ask a question or tell the story behind a favorite model."}</p>
          {topic ? <Link className="button outline" href={query({ topic: "" })}>Clear filter</Link> : <Link href="/community?view=collectors">Explore collectors</Link>}
        </div>}
        {!posts.length && <CollectorSuggestions className="collector-suggestions-inline" collectors={collectors}/>}
        {posts.length >= limit && limit >= 100 ? <Link className="button outline" href={query({ before: String(Math.min(...posts.map(p => p.createdAt)) - 1), limit: "20" })}>Older posts</Link> : posts.length >= limit && limit < 100 ? <Link className="button outline load-more" scroll={false} href={query({ limit: String(limit + 20) })}>Load more posts</Link> : posts.length > 0 ? <p className="caught-up">{tab === "following" ? "You’re caught up with the people you follow." : "You’ve reached the end of these posts."}</p> : null}
      </>}
    </section>
    <aside className="community-discovery">
      {!directory && <CollectorSuggestions className="collector-suggestions-sidebar" collectors={collectors}/>}
      <p className="community-rules">Be helpful. Credit photographers. Label promotion. Ownership is self-reported; social activity is separate from transaction feedback.</p>
    </aside>
  </CommunityFrame>;
}

function PostDetails({ catalogId, onCatalogChange }: { catalogId: string; onCatalogChange: (id: string) => void }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/collectors", { signal: controller.signal }).then(r => r.json()).then(d => setPieces((d.items || []).filter((p: Piece) => p.visibility === "public"))).catch(() => {});
    return () => controller.abort();
  }, []);
  return <div className="post-optional-fields">
    <label>Topic<input name="topic" maxLength={80} placeholder="For example: 1:64, Porsche or Motorsport"/></label>
    <label>Post type<select name="prompt"><option value="">Choose a type (optional)</option><option>Latest addition</option><option>Collection display</option><option>Model photography</option><option>Question</option><option>Comparison</option></select></label>
    <ModelPicker value={catalogId} onChange={onCatalogChange}/>
    <label>Your public collection piece<select name="itemId"><option value="">No collection item tag</option>{pieces.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label>
  </div>;
}

export function PostComposer({ onDone }: { onDone: (id: string) => void }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [catalogId, setCatalogId] = useState("");
  const [detailsShown, setDetailsShown] = useState(false);
  const [uploading, setUploading] = useState(false);
  return <section id="post-composer" className="composer post-composer" aria-label="Create a post">
    <SubmitForm label={uploading ? "Uploading photos…" : "Publish post"} disabled={uploading} onSubmit={async form => {
      const result = await communityRequest({ action: "post", body: form.get("body"), topic: form.get("topic") || "", prompt: form.get("prompt") || "", catalogId, itemId: form.get("itemId") || "", photos, commercial: form.get("commercial") === "on" });
      onDone(result.id);
    }}>
      <label>Caption or question<textarea name="body" required maxLength={4000} placeholder="What would you like to share?"/></label>
      <PhotoUpload value={photos} onChange={setPhotos} compact onBusyChange={setUploading}/>
      <details onToggle={event => { if (event.currentTarget.open) setDetailsShown(true); }}><summary>Add topic or model details</summary>{detailsShown && <PostDetails catalogId={catalogId} onCatalogChange={setCatalogId}/>}</details>
      <label className="check-label"><input type="checkbox" name="commercial"/>This is a commercial or sale post</label>
      <p className="post-visibility-note">Public post · Separate from your collection.</p>
    </SubmitForm>
  </section>;
}
