import { redirect } from "next/navigation";

export default async function Page({searchParams}:{searchParams:Promise<{listing?:string}>}) {
  const query=await searchParams;
  const params=new URLSearchParams({view:"inventory",filter:"preorders"});
  if(query.listing)params.set("preorder",query.listing);
  redirect(`/store?${params}`);
}
