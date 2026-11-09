import { redirect } from "next/navigation";

export default async function Page({searchParams}:{searchParams:Promise<{deposit?:string}>}) {
  const query=await searchParams;
  const params=new URLSearchParams({view:"orders"});
  if(query.deposit==="paid"||query.deposit==="cancelled")params.set("deposit",query.deposit);
  redirect(`/account?${params}`);
}
