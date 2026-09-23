"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { messagePreferences, normalizedProfile, profilePayload, profileValues, type EditableProfile, type PreviewPiece, type ProfilePreferences, type ProfileValues } from "@/lib/profile-editor";
import { pieceAvailabilityLabel } from "@/lib/community-presentation";
import { ProfileImageSelector } from "./profile-image-selector";
import "./profile-editor.css";

export function ProfilePreview({ values, pieces, onClose }: { values: ProfileValues; pieces: PreviewPiece[]; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal(); document.body.style.overflow = "hidden"; close.current?.focus();
    return () => { document.body.style.overflow = overflow; opener?.focus(); };
  }, []);
  const current = pieces.filter(piece => piece.availability !== "previously_owned");
  return <dialog ref={dialog} className="profile-preview-dialog" aria-labelledby="profile-preview-title" onCancel={onClose} onClose={onClose}>
    <header><h2 id="profile-preview-title">Public-profile preview</h2><button ref={close} type="button" className="button outline" onClick={onClose}>Close preview</button></header>
    <p className="profile-preview-notice">Only you can see this preview. It uses your current edits; nothing is saved or published.</p>
    <p className="profile-preview-notice">{values.published ? "After saving, visitors can see these details and pieces marked public." : "Your profile will stay private when saved. This is how it would look if you made it public."}</p>
    <section className="profile-preview-showroom" aria-label="Profile appearance">
      {values.cover && <img className="preview-cover" src={values.cover.url} alt="Cover photo preview" width={1200} height={320}/>}
      <p className="eyebrow">Collector showroom</p>
      <div className="profile-preview-identity"><div className="preview-avatar">{values.avatar ? <img src={values.avatar.url} alt="Avatar preview" width={86} height={86}/> : <span aria-hidden="true">{values.displayName.trim().slice(0, 1) || "?"}</span>}</div><div><h3>{values.displayName.trim() || "Your display name"}</h3><p>@{values.handle.trim().toLowerCase() || "your-handle"}{values.region.trim() ? ` · ${values.region.trim()}` : ""}</p></div></div>
      <p className="preview-bio">{values.bio.trim() || "A model-car collector on MCC."}</p>
      {values.interests.trim() && <p><strong>Collecting interests:</strong> {values.interests.trim()}</p>}
      <p>{current.length} public {current.length === 1 ? "piece" : "pieces"}</p>
    </section>
    <section className="profile-preview-collection" aria-label="Public collection preview">
      <h3>Collection</h3>
      <p>Only pieces already marked public appear here. Private pieces, purchase costs and private notes are excluded.</p>
      {pieces.length ? <><div className="profile-preview-pieces">{pieces.slice(0, 6).map(piece => {
        const photo = (JSON.parse(piece.photos) as string[])[0];
        return <article key={piece.id}>{photo ? <img src={`/community/media/${encodeURIComponent(photo)}`} alt={piece.title} width={300} height={225}/> : <div className="preview-no-photo">No personal photo</div>}<div><h4>{piece.title}</h4><p>{piece.scale} · {piece.maker}</p><span>{pieceAvailabilityLabel(piece.availability)}</span></div></article>;
      })}</div>{pieces.length > 6 && <p>Showing 6 of {pieces.length} public collection entries.</p>}</> : <p>No pieces are marked public yet.</p>}
    </section>
    <button type="button" className="button dark profile-preview-back" onClick={onClose}>Back to editing</button>
  </dialog>;
}

export function ProfileEditor({ profile, settings, returnTo, commentSetup = false, previewPieces = [] }: {
  profile: EditableProfile; settings: ProfilePreferences; returnTo?: string; commentSetup?: boolean; previewPieces?: PreviewPiece[];
}) {
  const [values, setValues] = useState(() => profileValues(profile, settings));
  const [savedValues, setSavedValues] = useState(() => profileValues(profile, settings));
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState({ avatar: false, cover: false });
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const [recentlySaved, setRecentlySaved] = useState(false);
  const submitting = useRef(false), uploadState = useRef({ avatar: false, cover: false });
  const form = useRef<HTMLFormElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(savedValues);
  const uploading = uploads.avatar || uploads.cover;
  const needsConsent = values.published && !savedValues.published;
  const busyLabel = busy ? "Saving…" : uploading ? "Uploading image…" : "Save profile";

  useEffect(() => {
    if (!dirty && !uploading) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, uploading]);
  useEffect(() => {
    if (!recentlySaved) return;
    const timer = setTimeout(() => setRecentlySaved(false), 6000);
    return () => clearTimeout(timer);
  }, [recentlySaved]);

  function update<K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) {
    setValues(current => ({ ...current, [key]: value })); setMessage(""); setError(""); setRecentlySaved(false);
    if (key === "published") setPublishConfirmed(false);
  }
  function setUpload(kind: "avatar" | "cover", value: boolean) {
    uploadState.current = { ...uploadState.current, [kind]: value }; setUploads(uploadState.current);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || uploadState.current.avatar || uploadState.current.cover) return;
    if (!event.currentTarget.reportValidity()) return;
    if (needsConsent && !publishConfirmed) { form.current?.querySelector<HTMLInputElement>("[name=publishConfirmed]")?.focus(); return; }
    submitting.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/collectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profilePayload(values, publishConfirmed)) });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Your edits are still here; sign in again in another tab, then retry saving." : result.error || "Your profile could not be saved. Please try again.");
      const saved = { ...normalizedProfile(values), ...(typeof result.handle === "string" ? { handle: result.handle } : {}) };
      setValues(saved); setSavedValues(saved); setPublishConfirmed(false);
      setMessage(`Profile saved. Your profile is ${saved.published ? "public" : "private"}.`); setRecentlySaved(true);
      // Keep confirmation visible; refreshing /profile can redirect a newly public profile.
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your profile could not be saved. Please try again.");
      window.requestAnimationFrame(() => { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: "center" }); });
    } finally { submitting.current = false; setBusy(false); }
  }

  return <div className={`profile-editor${dirty || uploading || recentlySaved ? " has-save-bar" : ""}`}>
    <header className="profile-editor-heading"><div><h1>{commentSetup ? "Set up your public profile" : "Edit collector profile"}</h1><p>{commentSetup ? "Choose a display name and handle, make your profile public below, then save. Your comment draft will be ready when you return." : "Choose how you appear to other collectors and who can contact you."}</p></div><button type="button" className="button outline" disabled={busy || uploading} onClick={() => setPreview(true)}>Preview public profile</button></header>
    <nav className="profile-editor-sections" aria-label="Profile settings sections"><a href="#profile-details">Profile details</a><a href="#profile-privacy">Privacy</a><a href="#profile-messages">Messages &amp; notifications</a></nav>
    <form id="collector-profile-form" ref={form} className="profile-editor-form" onSubmit={save} aria-busy={busy || uploading}>
      <fieldset id="profile-details" disabled={busy}><legend>Profile details</legend>
        <div className="profile-field"><label htmlFor="profile-display-name">Display name</label><input id="profile-display-name" name="displayName" value={values.displayName} onChange={event => update("displayName", event.target.value)} required maxLength={100} autoComplete="nickname"/><p>This name appears on your profile and comments.</p></div>
        <div className="profile-field"><label htmlFor="profile-handle">Handle</label><input id="profile-handle" name="handle" value={values.handle} onChange={event => update("handle", event.target.value)} required minLength={3} maxLength={30} pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,29}" autoCapitalize="none" spellCheck={false} aria-describedby="profile-handle-help profile-address"/><p id="profile-handle-help">3–30 letters, numbers, underscores or hyphens. Start with a letter or number. Handles use lowercase.</p><p id="profile-address" className="profile-address">Profile address: <span>/collectors/{values.handle.trim().toLowerCase() || "your-handle"}</span></p></div>
        <details className="profile-images"><summary>Avatar &amp; cover photo <span>Optional</span></summary><div>
          <ProfileImageSelector kind="avatar" value={values.avatar} disabled={busy} onChange={value => update("avatar", value)} onBusyChange={value => setUpload("avatar", value)}/>
          <ProfileImageSelector kind="cover" value={values.cover} disabled={busy} onChange={value => update("cover", value)} onBusyChange={value => setUpload("cover", value)}/>
        </div><p className="profile-image-note">New images stay private until you save a public profile.</p></details>
        <div className="profile-field"><label htmlFor="profile-bio">Bio <span>Optional</span></label><textarea id="profile-bio" name="bio" value={values.bio} onChange={event => update("bio", event.target.value)} maxLength={500} rows={3} aria-describedby="profile-bio-count"/><p id="profile-bio-count" className="profile-character-count">{values.bio.length} / 500 characters</p></div>
        <div className="profile-field"><label htmlFor="profile-interests">Collecting interests <span>Optional</span></label><input id="profile-interests" name="interests" value={values.interests} onChange={event => update("interests", event.target.value)} maxLength={300} placeholder="Porsche, 1:64, Motorsport" aria-describedby="profile-interests-help"/><p id="profile-interests-help">Separate interests with commas, such as car makes, scales and themes.</p></div>
        <div className="profile-field"><label htmlFor="profile-region">Region or country <span>Optional</span></label><input id="profile-region" name="region" value={values.region} onChange={event => update("region", event.target.value)} maxLength={80} placeholder="California, USA" aria-describedby="profile-region-help"/><p id="profile-region-help">Shown on your public profile. A broad location is enough.</p></div>
      </fieldset>
      <fieldset id="profile-privacy" disabled={busy}><legend>Privacy</legend>
        <label className="profile-check"><input type="checkbox" name="published" checked={values.published} onChange={event => update("published", event.target.checked)} aria-describedby="profile-visibility-help"/><span>Make my collector profile public</span></label>
        <p id="profile-visibility-help">When your profile is private, visitors cannot see it or your public collection pieces. Making it public reveals your profile details and pieces already marked public. Private pieces and purchase records stay private.</p>
        {needsConsent && <label className="profile-check profile-publish-consent"><input type="checkbox" name="publishConfirmed" required checked={publishConfirmed} onChange={event => setPublishConfirmed(event.target.checked)}/><span>I confirm that my profile details and pieces marked public will be visible to visitors when I save.</span></label>}
        <div className="profile-field"><label htmlFor="profile-default-visibility">Default visibility for new pieces</label><select id="profile-default-visibility" name="visibility" value={values.visibility} onChange={event => update("visibility", event.target.value)} aria-describedby="profile-default-help"><option value="private">Private · only me</option><option value="public">Public · confirm each piece</option></select><p id="profile-default-help">This only sets the starting choice when adding a piece; existing pieces stay unchanged. You confirm publication on the piece’s form before saving it as public. While your profile is private, new pieces start private.</p></div>
      </fieldset>
      <fieldset id="profile-messages" disabled={busy}><legend>Messages &amp; notifications</legend>
        <div className="profile-field"><label htmlFor="profile-contact">New conversation preference</label><select id="profile-contact" name="contact" value={values.contact} onChange={event => update("contact", event.target.value)} aria-describedby="profile-contact-help">{Object.entries(messagePreferences).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select><p id="profile-contact-help">{messagePreferences[values.contact].explanation}</p><p>Existing chats continue. Blocking and order support keep their own rules; offers follow the piece’s availability.</p></div>
        <label className="profile-check"><input type="checkbox" name="socialNotifications" checked={values.socialNotifications} onChange={event => update("socialNotifications", event.target.checked)} aria-describedby="profile-social-help"/><span>Social notifications in MCC</span></label><p id="profile-social-help">New followers, replies to your posts or pieces, and collector messages.</p>
        <label className="profile-check"><input type="checkbox" name="discoveryNotifications" checked={values.discoveryNotifications} onChange={event => update("discoveryNotifications", event.target.checked)} aria-describedby="profile-discovery-help"/><span>Discovery notifications in MCC</span></label><p id="profile-discovery-help">Model and collector suggestions, when available. No discovery alerts are being sent yet.</p>
        <p>These choices do not change order or payment updates. They do not subscribe you to email.</p>
      </fieldset>
      <footer className="profile-editor-save">
        {error && <p className="form-error" ref={errorRef} role="alert" tabIndex={-1}>{error}</p>}
        <p className="profile-save-status" role="status">{message || (uploading ? "Wait for the image upload to finish before saving." : dirty ? "You have unsaved changes." : "Your profile is up to date.")}</p>
        <button type="submit" className="button dark" disabled={!dirty || busy || uploading}>{busyLabel}</button>
        {dirty && <button type="button" className="button outline" disabled={busy || uploading} onClick={() => { setValues(savedValues); setPublishConfirmed(false); setError(""); setMessage(""); }}>Discard changes</button>}
        {returnTo && <Link className="profile-return" href={returnTo}>{commentSetup ? "Return to comment draft" : "Return to your piece"}</Link>}
        <Link href="/account">Account, orders &amp; transaction settings</Link>
      </footer>
    </form>
    {(dirty || uploading || recentlySaved) && <div className="profile-save-bar" aria-label="Profile save controls"><span>{recentlySaved && !dirty ? "Profile saved" : uploading ? "Uploading image…" : "Unsaved changes"}</span><button className="button dark" type="submit" form="collector-profile-form" disabled={!dirty || busy || uploading}>{recentlySaved && !dirty ? "Saved" : busyLabel}</button></div>}
    {preview && <ProfilePreview values={values} pieces={previewPieces} onClose={() => setPreview(false)}/>}
  </div>;
}
