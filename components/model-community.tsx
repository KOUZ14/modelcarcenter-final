import { getCurrentCollector } from "@/lib/collector-auth";
import { feed } from "@/lib/community";
import { Action,PostCard } from "./community-ui";
export async function ModelCommunity({catalogId}:{catalogId:string}){const c=await getCurrentCollector(),posts=await feed(c?.user.id??null,{catalogId,limit:10});return <section className="model-community"><h2>Collector photos and discussion</h2><p>Photos from collectors show their own models. The seller’s listing photos and condition description depict the actual item being sold.</p><Action payload={{action:'wishlist',catalogId}}>Add model to wishlist</Action>{posts.map(p=><PostCard key={p.id} post={p}/>)}{!posts.length&&<p>No public collector posts tagged to this release yet.</p>}</section>;}
