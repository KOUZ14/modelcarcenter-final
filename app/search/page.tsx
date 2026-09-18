import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getCurrentCollector } from "@/lib/collector-auth";
import { collectors,feed } from "@/lib/community";
import { searchCatalogProducts } from "@/lib/catalog-products";
import { CollectorCard,PostCard } from "@/components/community-ui";
export const dynamic='force-dynamic';
export const metadata={title:'Search'};
export default async function SearchPage({searchParams}:{searchParams:Promise<Record<string,string>>}){const q=await searchParams,c=await getCurrentCollector(),viewer=c?.user.id??null,type=q.type||'models',query=q.q||'';return <><SiteHeader/><main id="main-content" className="community-detail shell"><h1>Search MCC</h1><form className="community-search" method="get"><label>Models, collectors or posts<input name="q" type="search" defaultValue={query} placeholder="Porsche, MINI GT, 1:64…"/></label><label>Results<select name="type" defaultValue={type}><option value="models">Models</option><option value="collectors">Collectors</option><option value="posts">Posts</option></select></label><button className="button dark">Search</button></form>{type==='collectors'?(await collectors(viewer,query)).map(p=><CollectorCard collector={p} key={p.userId}/>):type==='posts'?(await feed(viewer,{q:query})).map(p=><PostCard post={p} key={p.id}/>):<div className="catalog-model-results">{(await searchCatalogProducts(query)).map(m=><article key={m.id}><Link href={`/models/${m.id}`}><h2>{m.title}</h2></Link><p>{m.scale} · {m.modelManufacturer} · {m.color} · {m.manufacturerSku||'No product code'}</p></article>)}</div>}</main></>;}
