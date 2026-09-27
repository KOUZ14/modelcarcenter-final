import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CollectionManager } from "@/components/collection-manager";
import { requireCollector } from "@/lib/collector-auth";
import { getCollection,getPiece,getShelves,settings,one } from "@/lib/community";
import { collectionSellingOptions } from "@/lib/collection-offers";
export const dynamic="force-dynamic";
export const metadata={title:'My Collection',robots:{index:false,follow:false}};
export default async function CollectionPage({searchParams}:{searchParams:Promise<Record<string,string>>}){const q=await searchParams,c=await requireCollector(`/collection?${new URLSearchParams(q)}`),[items,shelves,s,edit,selling]=await Promise.all([getCollection(c.user.id,c.user.id),getShelves(c.user.id,c.user.id),settings(c.user.id),q.edit?getPiece(q.edit,c.user.id):null,collectionSellingOptions(c.user.id,q.edit)]);const delivered=q.fromOrderItem?await one<{catalogId:string}>("SELECT p.catalog_product_id catalogId FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id WHERE oi.id=? AND o.buyer_user_id=? AND o.fulfillment_status='delivered' AND o.payment_status IN ('paid','partially_refunded')",q.fromOrderItem,c.user.id):null;return <><SiteHeader/><main id="main-content" className="collection-page shell"><CollectionManager items={items} shelves={shelves} visibility={s.visibility} handle={c.profile.handle} edit={edit?.ownerId===c.user.id?edit:null} add={q.add==='1'||Boolean(delivered)} seedCatalogId={delivered?.catalogId} selling={selling} requestedAvailability={q.selling} returnedListingId={q.listing}/></main><SiteFooter/></>;}
