"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const NOTICE_KEY = "mcc-storage-notice-v1";
const OPEN_EVENT = "mcc:storage-settings";

export function CookieSettingsButton() {
  return <button className="footer-settings" type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>Cookie settings</button>;
}

export function CookieNotice() {
  const [visible, setVisible] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(NOTICE_KEY) === "necessary-only"; } catch { /* Storage is optional. */ }
    const timer = window.setTimeout(() => setVisible(!dismissed), 0);
    function open() {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setVisible(true);
      requestAnimationFrame(() => panel.current?.focus());
    }
    window.addEventListener(OPEN_EVENT, open);
    return () => { window.clearTimeout(timer); window.removeEventListener(OPEN_EVENT, open); };
  }, []);
  function dismiss() {
    try { localStorage.setItem(NOTICE_KEY, "necessary-only"); } catch { /* Keep the site usable without storage. */ }
    setVisible(false);
    returnFocus.current?.focus();
  }
  if (!visible) return null;
  return <section ref={panel} tabIndex={-1} className="cookie-notice" aria-labelledby="cookie-notice-title" onKeyDown={(event) => { if (event.key === "Escape") dismiss(); }}>
    <div><h2 id="cookie-notice-title">Your privacy choices</h2><p>We use necessary cookies and storage for sign-in, security, your shopping choices, and this notice. No advertising or analytics cookies are enabled.</p><Link href="/cookies">Read the cookie policy</Link></div>
    <button type="button" className="button dark" onClick={dismiss}>Continue with necessary only</button>
  </section>;
}
