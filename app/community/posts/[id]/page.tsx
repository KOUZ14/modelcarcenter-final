import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { PostCard,CommentSection } from "@/components/community-ui";
import { getCurrentCollector } from "@/lib/collector-auth";
import { feed } from "@/lib/community";
export const dynamic="force-dynamic";
export const metadata={title:'Collector post'};
export default async function PostPage({params}:{params:Promise<{id:string}>}){const {id}=await params,c=await getCurrentCollector(),post=(await feed(c?.user.id??null,{postId:id}))[0];if(!post)notFound();return <><SiteHeader/><main id="main-content" className="community-detail shell"><Link href="/community">← Community</Link><PostCard post={post}/><CommentSection postId={id}/></main></>;}
