import { requireCollector } from "@/lib/collector-auth";
import { PreorderDashboard } from "@/components/preorder-dashboard";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export const dynamic="force-dynamic";
export const metadata={title:"My Preorders",robots:{index:false,follow:false}};
export default async function Page(){await requireCollector("/preorders");return <main><SiteHeader/><div className="inner-page shell" id="main-content" tabIndex={-1}><h1>My Preorders</h1><PreorderDashboard/></div><SiteFooter/></main>;}
