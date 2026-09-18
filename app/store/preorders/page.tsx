import { requireCollector } from "@/lib/collector-auth";
import { PreorderSeller } from "@/components/preorder-seller";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export const dynamic="force-dynamic";
export const metadata={title:"Incoming preorders",robots:{index:false,follow:false}};
export default async function Page(){await requireCollector("/store/preorders");return <main><SiteHeader/><div className="inner-page shell" id="main-content" tabIndex={-1}><h1>Incoming preorders</h1><PreorderSeller/></div><SiteFooter/></main>;}
