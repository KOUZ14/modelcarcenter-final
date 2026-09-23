"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Post } from "@/lib/community";
import { taggedModel } from "@/lib/community-presentation";
import { Action, availabilityLabel, PhotoCarousel, ReportButton } from "./community-ui";
import { focusCommentComposer } from "./community-discussion";
import "./community-post.css";

function ModelMetadata({post}:{post:Post}) {
  return <span className="model-tag-metadata">{[
    post.modelScale || 'Scale unspecified', post.modelManufacturer || 'Manufacturer unspecified', post.modelColor,
  ].filter(Boolean).map((value,index)=><span key={index}>{value}</span>)}</span>;
}

export function ModelPanel({post,onClose}:{post:Post;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog className="model-dialog post-model-dialog" aria-labelledby={`model-title-${post.id}`} ref={dialog} onCancel={onClose} onClose={onClose}>
    <button type="button" className="dialog-close" aria-label="Close model details" onClick={onClose}>×</button>
    <p className="eyebrow">Tagged model</p>
    <div className="post-model-identity">
      {post.modelImageUrl&&<img src={post.modelImageUrl} alt="Catalog reference" width={112} height={84}/>}
      <div><h2 id={`model-title-${post.id}`}>{taggedModel(post)}</h2><ModelMetadata post={post}/></div>
    </div>
    <p>{post.availability?availabilityLabel[post.availability]:'Catalog model'}</p>
    <p>A catalog tag identifies a model. It does not mean the pictured piece is for sale.</p>
    <div className="community-buttons">{post.catalogId&&<>
      <Action className="button dark" payload={{action:'wishlist',catalogId:post.catalogId}}>Add to wanted models</Action>
      <Link className="button outline" href={`/models/${post.catalogId}`}>View model & offers</Link>
    </>}{post.itemId&&<Link href={`/collection/${post.itemId}`}>View this owner’s piece</Link>}</div>
  </dialog>;
}

function PostActionIcon({name}:{name:'like'|'comment'|'save'|'share'}) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {name==='like'?<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>:
      name==='comment'?<path d="M4 5h16v12H8l-4 3V5Z"/>:
      name==='save'?<path d="M6 3h12v18l-6-4-6 4V3Z"/>:<><path d="M12 15V3m-4 4 4-4 4 4"/><path d="M5 11v10h14V11"/></>}
  </svg>;
}

export function PostCard({post,refresh,detail=false}:{post:Post;refresh?:()=>void;detail?:boolean}) {
  const [expanded,setExpanded]=useState(detail),[panel,setPanel]=useState(false);
  const [shareStatus,setShareStatus]=useState(''),[shareLink,setShareLink]=useState(''),[sharing,setSharing]=useState(false);
  async function share() {
    const url=`${location.origin}/community/posts/${encodeURIComponent(post.id)}`;
    setSharing(true);setShareStatus('');setShareLink('');
    try {
      if(navigator.share) {
        try { await navigator.share({title:`Post by ${post.displayName} · Model Car Center`,url});return; }
        catch(error) { if((error as Error).name==='AbortError')return; }
      }
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);setShareStatus('Link copied');
    } catch { setShareLink(url);setShareStatus('Copy this link to share the post.'); }
    finally { setSharing(false); }
  }
  const commentAction=<><span className="post-action-icon"><PostActionIcon name="comment"/><span>{post.comments}</span></span><span>Comment</span></>;
  return <article className={`community-post conversation-post${detail?' post-detail-card':''}`}>
    <header><Link className="collector-avatar" href={`/collectors/${post.handle}`} aria-label={`${post.displayName}’s profile`}>{post.displayName.slice(0,1)}</Link>
      <div><Link href={`/collectors/${post.handle}`}><strong>{post.displayName}</strong></Link><small><time dateTime={new Date(post.createdAt).toISOString()}>{new Date(post.createdAt).toLocaleDateString("en-US", { timeZone: "UTC" })}</time>{post.commercial?' · Commercial post':''}</small></div>
      <details className="post-menu"><summary aria-label="Post options">•••</summary><div><p>{post.reason||'Public collector contribution'}</p>
        <Action payload={{action:'post_action',postId:post.id,kind:'hide'}} onDone={refresh}>Hide post</Action>
        <Action payload={{action:'relationship',targetId:post.ownerId,kind:'mute'}} onDone={refresh}>Mute collector</Action>
        <Action payload={{action:'relationship',targetId:post.ownerId,kind:'block'}} onDone={refresh}>Block collector</Action>
        <ReportButton type="post" id={post.id}/>
      </div></details>
    </header>
    <PhotoCarousel photos={JSON.parse(post.photos)} alt={`Model photography by ${post.displayName}`}/>
    <div className="post-content">
      {post.prompt&&<small className="eyebrow">{post.prompt}</small>}
      <p className="post-caption">{expanded||post.body.length<300?post.body:post.body.slice(0,300)+'…'}{!detail&&post.body.length>=300&&<button type="button" onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'Expand'}</button>}</p>
      {(post.catalogId||post.itemId)&&<button type="button" className="tagged-model post-model-tag" onClick={()=>setPanel(true)}>
        {post.modelImageUrl&&<img src={post.modelImageUrl} alt="" width={64} height={48} loading="lazy"/>}
        <span className="model-tag-copy"><strong>{taggedModel(post)}</strong><ModelMetadata post={post}/><span className="model-tag-link">View model →</span></span>
      </button>}
      <footer className="post-actions">
        <Action payload={{action:'post_action',postId:post.id,kind:'like',enabled:!post.liked}} onDone={refresh}>
          <span className="post-action-icon"><PostActionIcon name="like"/><span>{post.likes}</span></span><span>{post.liked?'Liked':'Like'}</span>
        </Action>
        {detail?<button type="button" onClick={focusCommentComposer} aria-label={`Comment · ${post.comments}`}>{commentAction}</button>:
          <Link href={`/community/posts/${post.id}#comment-composer`} aria-label={`Comment · ${post.comments}`}>{commentAction}</Link>}
        <Action payload={{action:'post_action',postId:post.id,kind:'save',enabled:!post.saved}} onDone={refresh}>
          <span className="post-action-icon"><PostActionIcon name="save"/></span><span>{post.saved?'Saved':'Save'}</span>
        </Action>
        <button type="button" onClick={()=>void share()} disabled={sharing}><span className="post-action-icon"><PostActionIcon name="share"/></span><span>Share</span></button>
      </footer>
      {shareStatus&&<p className="post-share-status" role="status">{shareStatus}</p>}
      {shareLink&&<label className="post-share-link">Post link<input readOnly value={shareLink} onFocus={e=>e.target.select()}/></label>}
    </div>
    {panel&&<ModelPanel post={post} onClose={()=>setPanel(false)}/>}
  </article>;
}
