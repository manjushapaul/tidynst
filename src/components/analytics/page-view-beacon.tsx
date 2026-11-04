"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const recent = new Map<string, number>();

/** Ignores the second effect run React uses in development, without dropping a later real visit. */
function recentlySent(path: string): boolean {
  const now = Date.now();
  const last = recent.get(path) ?? 0;
  if (now - last < 1500) return true;
  recent.set(path, now);
  return false;
}

/** Tells the server which public page was just opened. Failures are ignored. */
export function PageViewBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || recentlySent(pathname)) return;
    const body = JSON.stringify({ path: pathname });
    void fetch("/page-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  }, [pathname]);
  return null;
}
