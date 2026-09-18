import { requireAdminPage } from "@/lib/admin-auth";
import { PreorderAdmin } from "@/components/preorder-admin";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
export const dynamic="force-dynamic";
export const metadata={title:"Preorder operations",robots:{index:false,follow:false}};
export default async function Page(){await requireAdminPage();return <main><SiteHeader/><div className="inner-page shell" id="main-content" tabIndex={-1}><h1>Preorder operations</h1><PreorderAdmin/></div><SiteFooter/></main>;}
