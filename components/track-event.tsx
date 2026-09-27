"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics-client";
import type { AnalyticsEventName } from "@/lib/analytics-rules";
export function TrackEvent({ name, count }: { name: AnalyticsEventName; count?: number }) {
  const pathname = usePathname();
  const previous = useRef("");
  useEffect(() => {
    const key = `${pathname}:${name}:${count ?? ""}`;
    if (previous.current === key) return;
    previous.current = key;
    trackEvent(name, { count });
  }, [pathname, name, count]);
  return null;
}
