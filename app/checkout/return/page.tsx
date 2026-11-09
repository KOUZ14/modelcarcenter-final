import { redirect } from "next/navigation";
import { CheckoutReturn } from "@/components/checkout-return";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Return from checkout", robots: { index: false, follow: false } };

export default async function CheckoutReturnPage({ searchParams }: { searchParams: Promise<{ reservation_id?: string }> }) {
  const id = (await searchParams).reservation_id ?? "";
  if (!/^[a-f0-9-]{36}$/.test(id)) redirect("/cart");
  return <main><SiteHeader/><div id="main-content" tabIndex={-1} className="inner-page shell"><CheckoutReturn reservationId={id}/></div><SiteFooter/></main>;
}
