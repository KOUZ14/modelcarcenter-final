"use client";
import Link from "next/link";
import type { Piece, Post } from "@/lib/community";
import { CollectionGrid } from "./collection-manager";
import { Action, PostCard, ReportButton, photoUrl } from "./community-ui";
import { CollectorAvatar } from "./collector-avatar";
import "./collector-profile.css";
export { ProfileEditor } from "./profile-editor";

type Profile = { coverId: string | null; avatarUrl: string | null; userId: string; handle: string; displayName: string; bio: string; interests: string; region: string; published: number; followers: number; following: number; isFollowing: number };
const tabs = [["collection", "Collection"], ["posts", "Posts"], ["sale", "For Sale"], ["about", "About"]];

export function CollectorProfile({ profile, items, shelves, posts, listings, owner, tab, visitor }: {
  profile: Profile; items: Piece[]; shelves: Array<{ id: string; name: string; itemId: string }>;
  posts: Post[]; listings: Array<{ slug: string; title: string; priceCents: number; currency: string }>;
  owner: boolean; tab: string; visitor: boolean;
}) {
  const activeTab = tabs.some(([id]) => id === tab) ? tab : "collection";
  const href = (id: string) => `/collectors/${profile.handle}?tab=${id}${visitor ? "&visitor=1" : ""}`;
  const preview = owner && visitor;
  const publicPieces = items.filter(item => item.visibility === "public" && item.availability !== "previously_owned").length;
  return <div className="collector-showroom">
    {preview && <aside className="profile-preview-notice" aria-label="Visitor preview">
      <div><strong>Visitor preview</strong><p>This is how your public profile looks to other collectors. Follow and Message are disabled in this preview.</p></div>
      <Link className="button outline" href={`/collectors/${profile.handle}?tab=${activeTab}`}>Exit visitor preview</Link>
    </aside>}
    <section className="profile-cover" aria-labelledby="collector-name">
      {profile.coverId && <img className="collector-cover-photo" src={photoUrl(profile.coverId)} alt="Collector cover photo" width={1200} height={320}/>}
      <div className="profile-summary">
        <div className="profile-details">
          <p className="eyebrow">Collector showroom</p>
          <div className="profile-identity">
            <CollectorAvatar src={profile.avatarUrl} name={profile.displayName} className="large" size={86}/>
            <div><h1 id="collector-name">{profile.displayName}</h1><p>@{profile.handle}{profile.region ? ` · ${profile.region}` : ""}</p></div>
          </div>
          <p className="profile-bio">{profile.bio || "A model-car collector on MCC."}</p>
        </div>
        <div className="community-buttons profile-actions">
          {owner && !visitor ? <>
            <Link className="button dark" href="/profile?edit=1">Edit profile</Link>
            <Link className="button outline" href={`${href(activeTab)}&visitor=1`}>View as visitor</Link>
          </> : preview ? <>
            <button type="button" className="button dark" disabled>Follow</button>
            <button type="button" className="button outline" disabled>Message</button>
          </> : <>
            <Action className="button dark" payload={{ action: "relationship", targetId: profile.userId, kind: "follow", enabled: !profile.isFollowing }}>{profile.isFollowing ? "Following" : "Follow"}</Action>
            <Link className="button outline" href={`/messages?collector=${profile.userId}`}>Message</Link>
          </>}
        </div>
      </div>
      <dl className="profile-stats">
        <div><dt>Public {publicPieces === 1 ? "piece" : "pieces"}</dt><dd>{publicPieces}</dd></div>
        <div><dt>{profile.followers === 1 ? "Follower" : "Followers"}</dt><dd>{profile.followers}</dd></div>
        <div><dt>Following</dt><dd>{profile.following}</dd></div>
      </dl>
    </section>
    <nav className="community-tabs profile-tabs" aria-label="Profile tabs">
      {tabs.map(([id, label]) => <Link key={id} aria-current={activeTab === id ? "page" : undefined} href={href(id)}>{label}</Link>)}
    </nav>
    <section className={`profile-panel profile-panel-${activeTab}`} aria-labelledby="profile-section-title">
      <header className="profile-section-heading">
        <h2 id="profile-section-title">{activeTab === "collection" ? "Public collection" : activeTab === "posts" ? "Collector posts" : activeTab === "sale" ? "Active marketplace listings" : "About this collector"}</h2>
        {activeTab === "sale" && <p>Seller transaction feedback is available on each marketplace listing.</p>}
      </header>
      {activeTab === "collection" ? <CollectionGrid items={items} shelves={shelves}/> : activeTab === "posts" ? <div className="profile-posts">
        {posts.map(post => <PostCard key={post.id} post={post}/>)}
        {!posts.length && <div className="profile-empty"><h3>No public posts yet</h3><p>Posts shared by {profile.displayName} will appear here.</p>{owner && !visitor && <Link className="button outline" href="/community">Visit community</Link>}</div>}
      </div> : activeTab === "sale" ? <div className="community-listings">
        {listings.map(listing => <article key={listing.slug}>
          <div><h3><Link href={`/products/${listing.slug}`}>{listing.title}</Link></h3><p className="profile-listing-price">{new Intl.NumberFormat("en-US", { style: "currency", currency: listing.currency }).format(listing.priceCents / 100)}</p></div>
          <Link className="button outline" href={`/products/${listing.slug}`}>View listing</Link>
        </article>)}
        {!listings.length && <div className="profile-empty"><h3>No active listings</h3><p>This collector has no models for sale right now.</p><Link className="button outline" href="/marketplace">Browse marketplace</Link></div>}
      </div> : <div className="profile-about">
        <div className="profile-about-details"><section><h3>Collector bio</h3><p>{profile.bio || "A model-car collector on MCC."}</p></section><section><h3>Collecting interests</h3><p>{profile.interests || "Not specified"}</p></section>{profile.region && <section><h3>Region</h3><p>{profile.region}</p></section>}</div>
        <div className="profile-trust-note"><p>Ownership is self-reported. Follows and likes are not transaction feedback or proof of authenticity.</p></div>
        {!owner && <div className="community-buttons profile-safety-actions"><ReportButton type="collector" id={profile.userId}/><Action payload={{ action: "relationship", targetId: profile.userId, kind: "block" }}>Block collector</Action></div>}
      </div>}
    </section>
  </div>;
}
