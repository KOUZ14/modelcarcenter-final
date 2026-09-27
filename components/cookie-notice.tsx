"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ANALYTICS_CONSENT_KEY } from "@/lib/analytics-rules";

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
    const element = panel.current;
    if (!visible || !element) return;
    const updateHeight = () => document.documentElement.style.setProperty("--cookie-notice-height", `${element.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--cookie-notice-height"); };
  }, [visible]);
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
  function dismiss(allowAnalytics = false) {
    try { localStorage.setItem(NOTICE_KEY, "necessary-only"); } catch { /* Keep the site usable without storage. */ }
    const allow = allowAnalytics && !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl && navigator.doNotTrack !== "1";
    try { localStorage.setItem(ANALYTICS_CONSENT_KEY, allow ? "yes" : "no"); } catch { /* Optional measurement stays off. */ }
    document.cookie = `mcc_analytics=${allow ? "yes" : "no"}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setVisible(false);
    returnFocus.current?.focus();
  }
  if (!visible) return null;
  return <section ref={panel} tabIndex={-1} className="cookie-notice" aria-labelledby="cookie-notice-title" onKeyDown={(event) => { if (event.key === "Escape") dismiss(); }}>
    <div><h2 id="cookie-notice-title">Your privacy choices</h2><p>Necessary storage keeps sign-in and shopping working. Optional usage measurement helps us improve shopping and seller setup. It excludes search text, private form contents and payment details. No advertising tracking.</p><Link href="/cookies">Read the cookie policy</Link></div>
    <div className="cookie-notice-actions"><button type="button" className="button dark" onClick={() => dismiss(false)}>Continue with necessary only</button><button type="button" className="button outline" onClick={() => dismiss(true)}>Allow usage measurement</button></div>
  </section>;
}
