"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { Icon } from "./icons";

/** Native modal semantics keep focus inside the sheet and restore its opener. */
export function MobileSheet({ open, onClose, title, children, actions, id }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  id: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const desktop = window.matchMedia("(min-width: 821px)");
    if (desktop.matches) { close.current(); return; }
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    function onResize() { if (desktop.matches) close.current(); }
    desktop.addEventListener("change", onResize);
    return () => {
      desktop.removeEventListener("change", onResize);
      document.body.style.overflow = previousOverflow;
      element.close();
    };
  }, [open]);

  return <dialog ref={dialog} id={id} className="mobile-sheet" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="mobile-sheet-panel">
      <div className="mobile-sheet-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" type="button" onClick={onClose} aria-label={`Close ${title}`}><Icon name="close" /></button>
      </div>
      <div className="mobile-sheet-body">{open && children}</div>
      {actions && <div className="mobile-sheet-actions">{actions}</div>}
    </div>
  </dialog>;
}
