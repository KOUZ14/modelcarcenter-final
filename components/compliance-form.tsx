"use client";
import { useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function ComplianceForm({endpoint,values={},children,label="Submit"}:{endpoint:string;values?:Record<string,unknown>;children?:ReactNode;label?:string}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");const router=useRouter();
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setMessage("");
    const form=event.currentTarget;
    const payload:Record<string,unknown>={...values,...Object.fromEntries(new FormData(form))};
    for(const input of Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) payload[input.name]=input.checked;
    try { const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error||"Unable to submit.");setMessage(data.id?`Received. Reference: ${data.id}`:"Saved.");router.refresh(); }
    catch(error){setMessage(error instanceof Error?error.message:"Please try again.");}finally{setBusy(false);}
  }
  return <form className="resolution-form" onSubmit={submit}><fieldset disabled={busy}>{children}<button className="button dark" type="submit">{busy?"Submitting…":label}</button></fieldset><p role="status">{message}</p></form>;
}
