"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackPageView } from "@/lib/traffic-client";
import { ANALYTICS_CONSENT_KEY } from "@/lib/analytics-rules";
import { CONSENT_CHANGED_EVENT, TRAFFIC_CONSENT_KEY } from "@/lib/traffic-rules";

export function TrafficTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    function measure() {
      if (pathname && lastPath.current !== pathname) {
        lastPath.current = trackPageView(pathname) ? pathname : null;
      }
    }
    function consentChanged() { lastPath.current = null; measure(); }
    function storageChanged(event: StorageEvent) {
      if (event.key === null || [ANALYTICS_CONSENT_KEY, TRAFFIC_CONSENT_KEY].includes(event.key)) consentChanged();
    }
    measure();
    window.addEventListener(CONSENT_CHANGED_EVENT, consentChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, consentChanged);
      window.removeEventListener("storage", storageChanged);
    };
  }, [pathname]);
  return null;
}
