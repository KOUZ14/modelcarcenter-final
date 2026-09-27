"use client";

import { useEffect, useRef } from "react";

export function useDialogFocus(onClose: () => void) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = dialog.current;
    if (!root) return;
    const focusable = () => [...root.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex="0"]')].filter((element) => !element.matches(":disabled") && element.getClientRects().length > 0);
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0], last = items.at(-1);
      if (!first || !last) { event.preventDefault(); root?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !root?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); opener?.focus(); };
  }, []);
  return dialog;
}
