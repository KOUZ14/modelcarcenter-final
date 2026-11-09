"use client";
import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics-client";

// "Abandoned" means left an edited task without a successful save, not an
// inference about why the person left. No field values are observed or sent.
export function useTaskMeasurement(step: "import" | "listing" | "checkout") {
  const started = useRef<number | null>(null);
  useEffect(() => {
    function leave() { if (started.current !== null) { trackEvent("task_abandoned", { step, durationMs: Date.now() - started.current }); started.current = null; } }
    window.addEventListener("pagehide", leave);
    return () => { window.removeEventListener("pagehide", leave); leave(); };
  }, [step]);
  return { start() { started.current ??= Date.now(); }, complete() { started.current = null; } };
}
