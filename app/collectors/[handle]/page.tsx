import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CollectorProfile } from "@/components/collector-profile";
import { getCurrentCollector } from "@/lib/collector-auth";
import { profile,getCollection,getShelves,feed,rows } from "@/lib/community";
import { POLICY_VERSION } from "@/lib/legal";
export const dynamic="force-dynamic";
export const metadata={title:'Collector showroom'};
export default async function CollectorPage({params,searchParams}:{params:Promise<{handle:string}>;searchParams:Promise<Record<string,string>>}){const {handle}=await params,q=await searchParams,c=await getCurrentCollector(),viewer=c?.user.id??null,p=await profile(handle,viewer,q.visitor==='1');if(!p)notFound();const [items,shelves,posts,listings]=await Promise.all([getCollection(p.userId,viewer,true),getShelves(p.userId,viewer,true),feed(viewer,{ownerId:p.userId}),rows<{slug:string;title:string;priceCents:number;currency:string}>("SELECT p.slug,p.title,p.price_cents priceCents,p.currency FROM products p JOIN sellers s ON s.id=p.seller_id WHERE s.owner_user_id=? AND s.status='active' AND s.seller_terms_version=? AND s.seller_terms_accepted_at IS NOT NULL AND p.status='active' AND p.inventory_quantity>p.reserved_quantity LIMIT 100",p.userId,POLICY_VERSION)]);return <><SiteHeader/><main id="main-content" className="collection-page shell"><CollectorProfile profile={p} items={items} shelves={shelves} posts={posts} listings={listings} owner={p.userId===viewer} visitor={q.visitor==='1'} tab={q.tab||'collection'}/></main><SiteFooter/></>;}
