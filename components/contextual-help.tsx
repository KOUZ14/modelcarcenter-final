"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

export function ContextualHelp({ id, title, children, action }: {
  id: string;
  title: string;
  children: ReactNode;
  action?: { href: string; label: string };
}) {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => { let hidden = false; try { hidden = localStorage.getItem(`mcc-help-${id}`) === "dismissed"; } catch { /* Optional preference. */ } queueMicrotask(() => setDismissed(hidden)); }, [id]);
  function toggle(value: boolean) { setDismissed(value); try { if (value) localStorage.setItem(`mcc-help-${id}`, "dismissed"); else localStorage.removeItem(`mcc-help-${id}`); } catch { /* Help still works in memory. */ } }
  if (dismissed) return <button className="reopen-help" type="button" onClick={() => toggle(false)}>Help: {title}</button>;
  return (
    <aside className="contextual-help" aria-label={title}>
      <div className="contextual-help-content">
        <h3>{title}</h3>
        {children}
      </div>
      <div className="contextual-help-actions">
        {action && <Link className="button dark small" href={action.href}>{action.label}</Link>}
        <div className="contextual-help-controls">
          <button type="button" onClick={() => toggle(true)}>Dismiss this tip</button>
          <Link href="/help">All help</Link>
        </div>
      </div>
    </aside>
  );
}
