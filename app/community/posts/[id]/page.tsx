import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { PostCard,CommentSection } from "@/components/community-ui";
import { getCurrentCollector } from "@/lib/collector-auth";
import { feed, settings } from "@/lib/community";
export const dynamic="force-dynamic";
export const metadata={title:'Collector post'};
export default async function PostPage({params}:{params:Promise<{id:string}>}) {
  const {id} = await params, collector = await getCurrentCollector();
  const post = (await feed(collector?.user.id ?? null, {postId:id}))[0];
  if (!post) notFound();
  const published = collector ? Boolean((await settings(collector.user.id)).published) : false;
  return <><SiteHeader/><main id="main-content" className="community-detail shell">
    <Link href="/community">← Community</Link>
    <PostCard post={post} detail/>
    <CommentSection key={id} postId={id} viewerId={collector?.user.id ?? null} profilePublished={published}/>
  </main></>;
}
