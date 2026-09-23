"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Collector, Piece } from "@/lib/community";
import { pieceAvailabilityLabel } from "@/lib/community-presentation";
import "./community.css";

export { availabilityLabel } from "@/lib/community-presentation";
export function photoUrl(id:string){return `/community/media/${encodeURIComponent(id)}`;}
export async function communityRequest(payload:Record<string,unknown>,endpoint='/api/collectors'){
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(r.status===401){window.location.assign(`/sign-in?returnTo=${encodeURIComponent(location.pathname+location.search)}`);throw new Error('Sign in to continue.');}
  const data=await r.json();if(!r.ok)throw new Error(data.error||'Please try again.');return data;
}
export function Action({payload,children,className='',endpoint,onDone}:{payload:Record<string,unknown>;children:ReactNode;className?:string;endpoint?:string;onDone?:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),router=useRouter();
  return <span className="community-action"><button type="button" className={className} disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await communityRequest(payload,endpoint);onDone?.();router.refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Saving…':children}</button>{error&&<small role="alert">{error}</small>}</span>;
}
export function PhotoUpload({ value, onChange, compact = false, onBusyChange }: { value: string[]; onChange: (ids: string[]) => void; compact?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div className={`photo-upload ${compact ? "photo-upload-compact" : ""}`}>
    <label className={compact ? "photo-add-control" : undefined}>{compact ? value.length ? "Add more photos" : "+ Add photos" : "Personal photos"}
      <input className={compact ? "sr-only" : undefined} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || value.length >= 6} onChange={async event => {
        const input = event.currentTarget;
        const files = Array.from(input.files || []).slice(0, 6 - value.length);
        if (!files.length) return;
        setBusy(true); onBusyChange?.(true); setError("");
        const uploaded = [...value];
        try {
          for (const file of files) {
            if (file.size > 10 * 1024 * 1024) throw new Error("Choose photos under 10 MB.");
            const bitmap = await createImageBitmap(file), ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement("canvas");
            canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
            const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Photo conversion unavailable.");
            ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not read photo.")), "image/jpeg", 0.85));
            const form = new FormData(); form.set("photo", blob, "photo.jpg");
            const response = await fetch("/api/collectors/photos", { method: "POST", body: form }), data = await response.json();
            if (!response.ok) throw new Error(data.error);
            uploaded.push(data.id); onChange([...uploaded]);
          }
        } catch (e) { setError((e as Error).message); }
        finally { setBusy(false); onBusyChange?.(false); input.value = ""; }
      }}/>
    </label>
    <p className="muted" role={busy ? "status" : undefined}>{busy ? "Uploading photos…" : "Up to 6 photos · Location metadata removed."}</p>
    <div className="photo-thumbs">{value.map(id => <div key={id}><img src={photoUrl(id)} alt="Your uploaded model photo" width={100} height={80}/><button type="button" disabled={busy} onClick={() => onChange(value.filter(x => x !== id))} aria-label="Remove photo">Remove</button></div>)}</div>
    {error && <p role="alert">{error}</p>}
  </div>;
}

type Model={id:string;title:string;scale:string;modelManufacturer:string;manufacturerSku:string|null;color:string|null;primaryImageUrl:string|null};
export function ModelPicker({value,onChange}:{value:string;onChange:(id:string)=>void}){
  const [query,setQuery]=useState(''),[models,setModels]=useState<Model[]>([]),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{void fetch(`/api/catalog-products?q=${encodeURIComponent(query)}`,{signal:controller.signal}).then(r=>r.json()).then(d=>setModels(d.products||[])).catch(e=>{if(e.name!=='AbortError')setError('Catalog search unavailable.');});},250);return()=>{clearTimeout(timer);controller.abort();};},[query]);
  return <div className="model-picker"><label>Search the model catalog<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Model, manufacturer or product code"/></label>{error&&<p role="alert">{error}</p>}<div className="model-matches" role="group" aria-label="Exact model release"><label className="model-match"><input type="radio" checked={!value} onChange={()=>onChange('')}/>Personal model / no catalog tag</label>{models.map(m=><label className={`model-match ${value===m.id?'selected':''}`} key={m.id}><input type="radio" checked={value===m.id} onChange={()=>onChange(m.id)}/>{m.primaryImageUrl&&<img src={m.primaryImageUrl} alt="Catalog reference" width={64} height={48} loading="lazy"/>}<span><strong>{m.title}</strong><small>{m.scale} · {m.modelManufacturer} · {m.color||'Color unspecified'} · {m.manufacturerSku||'No product code'}</small></span></label>)}</div>{value&&!models.some(m=>m.id===value)&&<p>Previously selected catalog release retained. <Link href={`/models/${value}`}>Review release</Link></p>}</div>;
}
export function PieceCard({piece,owner=false}:{piece:Piece;owner?:boolean}){
  const photos=JSON.parse(piece.photos) as string[];
  return <article className="piece-card"><Link href={`/collection/${piece.id}`} className="piece-photo">{photos[0]?<img src={photoUrl(photos[0])} alt={piece.title} loading="lazy" width={500} height={375}/>:<span>No personal photo yet</span>}{piece.pinned===1&&<span className="pinned">Favorite</span>}</Link><div><small>{piece.scale} · {piece.maker}</small><h3><Link href={`/collection/${piece.id}`}>{piece.title}</Link></h3><span className="availability">{pieceAvailabilityLabel(piece.availability)}</span>{owner&&<span className="privacy-label">{piece.visibility==='public'?'Public':'Private'}</span>}{owner&&<Link className="edit-piece" href={`/collection?edit=${piece.id}`}>Edit piece</Link>}</div></article>;
}
export function CollectorCard({collector}:{collector:Collector}){return <div className="collector-card"><Link className="collector-avatar" href={`/collectors/${collector.handle}`} aria-label={collector.displayName}>{collector.displayName.slice(0,1)}</Link><div><Link href={`/collectors/${collector.handle}`}><strong>{collector.displayName}</strong></Link><small>@{collector.handle} · {collector.count} public pieces</small><p>{collector.interests}</p></div><Action payload={{action:'relationship',kind:'follow',targetId:collector.userId,enabled:!collector.isFollowing}}>{collector.isFollowing?'Following':'Follow'}</Action></div>;}
export function ReportButton({type,id}:{type:string;id:string}){const[open,setOpen]=useState(false),[reason,setReason]=useState('');return <>{!open?<button type="button" onClick={()=>setOpen(true)}>Report</button>:<div><label>Reason for report<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label><Action payload={{action:'report',targetType:type,targetId:id,reason}} onDone={()=>setOpen(false)}>Send report</Action><button type="button" onClick={()=>setOpen(false)}>Cancel</button></div>}</>;}
export function PhotoCarousel({photos,alt}:{photos:string[];alt:string}){const[index,setIndex]=useState(0);if(!photos.length)return null;return <div className="post-photo"><img src={photoUrl(photos[index]||photos[0])} alt={`${alt}, photo ${index+1} of ${photos.length}`} width={900} height={675} loading="lazy"/>{photos.length>1&&<div className="carousel-controls"><button type="button" onClick={()=>setIndex((index+photos.length-1)%photos.length)} aria-label="Previous photo">←</button><span aria-live="polite">{index+1} / {photos.length}</span><button type="button" onClick={()=>setIndex((index+1)%photos.length)} aria-label="Next photo">→</button></div>}</div>;}
export { ModelPanel, PostCard } from "./community-post";
export { CommentSection } from "./community-discussion";
export function CommunityFrame({ children, view = "", tab = "for_you" }: { children: ReactNode; view?: string; tab?: string }) {
  const current = view === "collectors" || view === "collections" ? view : tab === "saved" ? "saved" : "feed";
  return <div className="community-layout shell">
    <aside className="community-sidebar">
      <nav className="community-navigation" aria-label="Community">
        {[["feed", "/community", "Feed"], ["collectors", "/community?view=collectors", "Collectors"], ["collections", "/community?view=collections", "Collections"], ["saved", "/community?tab=saved", "Saved"]].map(([key, href, label]) => <Link key={key} href={href} aria-current={current === key ? "page" : undefined}>{label}</Link>)}
        <details className="community-nav-more" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
          <summary aria-label="More community links"><span>More</span><span aria-hidden="true">⌄</span></summary>
          <div><Link href="/collection">My collection</Link><Link href="/wishlist">Wishlist</Link></div>
        </details>
      </nav>
    </aside>
    {children}
  </div>;
}

export function SubmitForm({children,onSubmit,label='Save',disabled=false}:{children:ReactNode;onSubmit:(form:FormData)=>Promise<void>;label?:string;disabled?:boolean}){
  const[busy,setBusy]=useState(false),[error,setError]=useState('');async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy||disabled)return;const form=new FormData(e.currentTarget);setBusy(true);setError('');try{await onSubmit(form);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <form className="community-form" onSubmit={submit} aria-busy={busy||disabled}>{children}{error&&<p role="alert" className="form-error">{error}</p>}<button className="button dark" disabled={busy||disabled}>{busy?'Saving…':label}</button></form>;
}
