"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CommunityComment } from "@/lib/community";
import { addressComment, commentTime, readCommentDraft } from "@/lib/community-presentation";
import { ReportButton } from "./community-ui";
import "./community-post.css";

export function focusCommentComposer() {
  const composer=document.getElementById('comment-composer');
  composer?.scrollIntoView({block:'center'});
  composer?.focus({preventScroll:true});
}

export function CommentSection({postId,itemId,enabled=true,viewerId=null,profilePublished=false}:{postId?:string;itemId?:string;enabled?:boolean;viewerId?:string|null;profilePublished?:boolean}) {
  const [list,setList]=useState<CommunityComment[]>([]),[body,setBody]=useState('');
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[draftSaved,setDraftSaved]=useState(false);
  const submitting=useRef(false),router=useRouter();
  const draftKey=`mcc-comment-draft:${postId?'post':'item'}:${postId||itemId}`;
  const returnTo=`${postId?'/community/posts/':'/collection/'}${encodeURIComponent(postId||itemId||'')}#comment-composer`;
  const profileHref=`/profile?edit=1&intent=comment&returnTo=${encodeURIComponent(returnTo)}`;
  const signInHref=`/sign-in?returnTo=${encodeURIComponent(profileHref)}`;
  const load=useCallback((signal?:AbortSignal)=>
    fetch(`/api/collectors?view=comments&${postId?'post='+encodeURIComponent(postId):'item='+encodeURIComponent(itemId||'')}`,{signal}).then(async response=>{
      if(!response.ok)throw new Error('Comments unavailable. Please try again.');
      const data=await response.json();
      if(!signal?.aborted)setList(data.comments||[]);
    }).catch(error=>{if(!signal?.aborted)setLoadError((error as Error).message);})
      .finally(()=>{if(!signal?.aborted)setLoading(false);}),[postId,itemId]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  useEffect(()=>{
    try {
      const draft=readCommentDraft(localStorage.getItem(draftKey),viewerId);
      // Browser storage is only available after hydration; keep the server's empty field consistent.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if(draft){setBody(draft);setDraftSaved(true);}
    } catch { /* The composer remains usable with storage disabled. */ }
    if(location.hash==='#comment-composer')focusCommentComposer();
  },[draftKey,viewerId]);
  function saveDraft(next:string) {
    try {
      if(next)localStorage.setItem(draftKey,JSON.stringify({body:next,viewerId,updatedAt:Date.now()}));
      else localStorage.removeItem(draftKey);
      setDraftSaved(Boolean(next));return true;
    } catch { setDraftSaved(false);return !next; }
  }
  function updateDraft(next:string) {setBody(next);saveDraft(next);setNotice('');}
  function keepDraftBeforeLeaving() {
    if(saveDraft(body))return true;
    setError('Your browser could not save this draft. Copy your text before leaving, or clear it to continue.');return false;
  }
  function signIn() {if(keepDraftBeforeLeaving())router.push(signInHref);}
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(submitting.current||!enabled||!body.trim())return;
    if(!viewerId){signIn();return;}
    if(!profilePublished)return;
    submitting.current=true;setBusy(true);setError('');setNotice('');saveDraft(body);
    try {
      const response=await fetch('/api/collectors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'comment',postId,itemId,body})});
      if(response.status===401){signIn();return;}
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Your comment could not be posted. Please try again.');
      setBody('');saveDraft('');setNotice('Comment posted.');setLoading(true);setLoadError('');await load();router.refresh();
    } catch(error) {setError((error as Error).message);}
    finally {submitting.current=false;setBusy(false);}
  }
  return <section id="discussion" className="comment-section conversation-discussion" tabIndex={-1} aria-labelledby="discussion-heading">
    <h2 id="discussion-heading">Discussion</h2>
    {enabled?<form className="comment-composer" onSubmit={submit} aria-busy={busy}>
      {!viewerId?<p id="comment-requirements" className="comment-requirements">Sign in to comment. If needed, we’ll help you choose a display name and handle and make your collector profile public. You can write a draft below.</p>:
        !profilePublished?<p id="comment-requirements" className="comment-requirements">To comment, choose a display name and handle and make your collector profile public so others can see who’s replying. Your draft will be here when you return.</p>:null}
      <label htmlFor="comment-composer">Write a comment</label>
      <textarea id="comment-composer" name="comment" placeholder="Join the conversation…" value={body} onChange={e=>updateDraft(e.target.value)} maxLength={2000} required disabled={busy} aria-describedby={!viewerId||!profilePublished?'comment-requirements comment-draft-status':'comment-draft-status'}/>
      <div className="comment-composer-actions">
        {!viewerId?<button type="button" className="button dark" onClick={signIn}>Sign in to comment</button>:
          !profilePublished?<Link className="button dark" href={profileHref} onClick={event=>{if(!keepDraftBeforeLeaving())event.preventDefault();}}>Set up public profile</Link>:
          <button type="submit" className="button dark" disabled={busy||!body.trim()}>{busy?'Posting…':'Post comment'}</button>}
        {body&&<button type="button" className="comment-clear" disabled={busy} onClick={()=>{updateDraft('');setError('');}}>Clear draft</button>}
      </div>
      <p id="comment-draft-status" className="comment-draft-status">{draftSaved?'Draft saved on this browser for 7 days.':body?'Draft is only kept on this page.':'Drafts stay in this browser through sign-in.'}</p>
      {error&&<p className="form-error" role="alert">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
    </form>:<p>New comments are turned off.</p>}
    <div className="discussion-comments" aria-busy={loading}>
      {loading&&<p role="status" className="muted">Loading comments…</p>}
      {loadError&&<p role="alert">{loadError} <button type="button" onClick={()=>{setLoading(true);setLoadError('');void load();}}>Retry</button></p>}
      {!loading&&!loadError&&!list.length&&<p className="muted">No comments yet. Start the conversation.</p>}
      {list.map(comment=><article className="discussion-comment" key={comment.id}>
        <span className="comment-avatar" aria-hidden="true">{comment.avatarUrl?<img src={comment.avatarUrl} alt="" width={32} height={32} loading="lazy"/>:comment.displayName.slice(0,1).toUpperCase()}</span>
        <div className="comment-content">
          <header>{comment.handle?<Link href={`/collectors/${comment.handle}`}><strong>{comment.displayName}</strong></Link>:<strong>{comment.displayName}</strong>}
            <time dateTime={new Date(comment.createdAt).toISOString()} title={new Date(comment.createdAt).toLocaleString()}>{commentTime(comment.createdAt)}</time>
          </header>
          <p>{comment.body}</p>
          {enabled&&comment.handle&&<button className="comment-reply" type="button" disabled={busy} aria-label={`Reply to ${comment.displayName}`} onClick={()=>{
            const next=addressComment(body,comment.handle!);
            if(next.length>2000){setError('Make a little room in your draft before adding a reply.');focusCommentComposer();return;}
            updateDraft(next);focusCommentComposer();
          }}>Reply</button>}
        </div>
        <details className="post-menu comment-menu" onKeyDown={event=>{if(event.key==='Escape'){event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}>
          <summary aria-label={`Options for ${comment.displayName}’s comment`}>•••</summary>
          <div><ReportButton type="comment" id={comment.id}/></div>
        </details>
      </article>)}
    </div>
  </section>;
}
