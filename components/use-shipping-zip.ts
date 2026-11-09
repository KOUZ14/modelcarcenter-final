"use client";

import { useSyncExternalStore } from "react";
import { getShippingZip, serverShippingZip, setShippingZip, subscribeShippingZip } from "@/lib/shipping-destination";

export function useShippingZip() {
  const zip = useSyncExternalStore(subscribeShippingZip, getShippingZip, serverShippingZip);
  return [zip, setShippingZip] as const;
}
