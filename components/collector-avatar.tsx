"use client";

import { useState } from "react";

// Keep the same crop and fallback wherever a collector's identity appears.
export function CollectorAvatar({ name, src, className = "", size = 40 }: {
  name: string; src?: string | null; className?: string; size?: number;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return <span className={`collector-avatar ${className}`} aria-hidden="true">
    {src && src !== failedSrc
      ? <img key={src} src={src} alt="" width={size} height={size} onError={() => setFailedSrc(src)}/>
      : name.trim().slice(0, 1).toUpperCase() || "?"}
  </span>;
}
