import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CommunityFeed } from "@/components/community-feed";
import { getCurrentCollector } from "@/lib/collector-auth";
import { collectors,feed,one } from "@/lib/community";
export const dynamic="force-dynamic";
export const metadata={title:'Community',description:'Discover model-car collections, photography and conversations.'};
// eslint-disable-next-line react-hooks/purity -- A dynamic server request establishes the feed snapshot time; clients retain it in the URL.
export default async function CommunityPage({searchParams}:{searchParams:Promise<Record<string,string>>}){const q=await searchParams,c=await getCurrentCollector(),viewer=c?.user.id??null,tab=q.tab||'for_you',topic=q.topic||'',before=Number(q.before)||Date.now(),limit=Math.min(100,Math.max(20,Number(q.limit)||20));const [posts,people,editorial]=await Promise.all([feed(viewer,{tab,topic,limit,before}),collectors(viewer),one<{title:string;body:string;topic:string;author:string}>('SELECT * FROM community_editorial ORDER BY created_at DESC LIMIT 1')]);return <><SiteHeader/><main id="main-content" className="community-page"><CommunityFeed initialPosts={posts} collectors={people} editorial={editorial} tab={tab} topic={topic} limit={limit} before={before} view={q.view||''}/></main><SiteFooter/></>;}
