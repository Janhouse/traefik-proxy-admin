"use client";

import { useEffect, useState } from "react";

/**
 * Whether the panel runs in fully-managed mode (TRAEFIK_MANAGED). Used for
 * UI affordances like the header "Managed" badge. Returns null while loading
 * so callers can avoid a flash of the wrong state.
 */
export function useManagedMode(): boolean | null {
  const [managed, setManaged] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/system", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { managed: false }))
      .then((data) => {
        if (active) setManaged(!!data.managed);
      })
      .catch(() => {
        if (active) setManaged(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return managed;
}
