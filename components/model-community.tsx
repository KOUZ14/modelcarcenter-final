import { getCurrentCollector } from "@/lib/collector-auth";
import { feed } from "@/lib/community";
import Image from "next/image";
import Link from "next/link";
import { PostCard } from "./community-ui";

export async function ModelCommunity({ catalogId, preview = false, limit = 20, before, beforeId }: { catalogId: string; preview?: boolean; limit?: number; before?: number; beforeId?: string }) {
  const collector = await getCurrentCollector();
  const posts = await feed(collector?.user.id ?? null, { catalogId, limit: preview ? 2 : limit, before, beforeId, order: "newest" });
  const moreQuery = new URLSearchParams({ discussionLimit: String(limit < 100 ? limit + 20 : 20) });
  if (limit >= 100 && posts.length) {
    const lastPost = posts[posts.length - 1];
    moreQuery.set("before", String(lastPost.createdAt));
    moreQuery.set("beforePost", lastPost.id);
  } else if (before) {
    moreQuery.set("before", String(before));
    if (beforeId) moreQuery.set("beforePost", beforeId);
  }

  return <section id="collector-discussion" className={`model-community${preview ? " model-community-preview" : ""}`} aria-labelledby="collector-discussion-title">
    <h2 id="collector-discussion-title">Collector photos and discussion</h2>
    <p>Collectors&apos; own models are shown here. Check this seller&apos;s photos and condition notes for the item you&apos;re buying.</p>
    {preview ? <div className="collector-post-previews">{posts.map(post => {
      const photo = (JSON.parse(post.photos) as string[])[0];
      return <article className="collector-post-preview" key={post.id}>
        {photo && <Link href={`/community/posts/${post.id}`} aria-label={`View ${post.displayName}'s collector photo`}><Image src={`/community/media/${encodeURIComponent(photo)}`} width={88} height={88} style={{ objectFit: "contain" }} alt={`Model photo by ${post.displayName}`} unoptimized /></Link>}
        <div><Link className="preview-collector-name" href={`/collectors/${post.handle}`}>{post.displayName}</Link><p>{post.body}</p><Link className="preview-discussion-link" href={`/community/posts/${post.id}`}>{post.comments ? `${post.comments} comment${post.comments === 1 ? "" : "s"}` : "View post"}{post.commercial ? " · Promotional post" : ""}</Link></div>
      </article>;
    })}</div> : posts.map(post => <PostCard key={post.id} post={post} />)}
    {!posts.length && <p>No public collector posts tagged to this release yet.</p>}
    {preview ? <Link className="text-link all-collector-discussion" href={`/models/${catalogId}#collector-discussion`}>View all collector discussion</Link>
      : posts.length >= limit && <Link className="button outline" href={`/models/${catalogId}?${moreQuery}#collector-discussion`}>{limit >= 100 ? "Older collector posts" : "Show more collector posts"}</Link>}
  </section>;
}
