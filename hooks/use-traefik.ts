"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BackendHealthResponse,
  CertificatesResponse,
  CertResolversResponse,
  EntrypointsResponse,
  MetricsResponse,
  MiddlewaresResponse,
  RouteConflictsResponse,
  RuntimeResponse,
} from "@/lib/traefik-client-types";

/** Human-readable reason a panel API call failed (network or non-2xx). */
function describeFailure(res: Response | null, err?: unknown): string {
  if (res) return `Admin API responded ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  return err instanceof Error && err.message
    ? `Admin API unreachable: ${err.message}`
    : "Admin API unreachable";
}

/**
 * Fetch JSON from one of the panel's own API routes. `error` is the failure of
 * the LAST attempt (null once a request succeeds again); `data` keeps the last
 * good payload so a transient failure never blanks the UI. Polling keeps going
 * through errors, so the callout clears itself once the API recovers.
 */
function useFetched<T>(url: string, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guards against out-of-order polls and post-unmount writes: only the newest
  // request (by seq) may commit, and only while still mounted.
  const mounted = useRef(true);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++seq.current;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = res.ok ? ((await res.json()) as T) : null;
      if (!mounted.current || id !== seq.current) return;
      if (res.ok) {
        setData(body as T);
        setError(null);
      } else {
        setError(describeFailure(res));
      }
    } catch (err) {
      if (!mounted.current || id !== seq.current) return;
      setError(describeFailure(null, err));
    } finally {
      if (mounted.current && id === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const iv = pollMs > 0 ? setInterval(refresh, pollMs) : null;
    return () => {
      mounted.current = false;
      if (iv) clearInterval(iv);
    };
  }, [refresh, pollMs]);

  return { data, loading, error, refresh };
}

export function useBackendHealth(pollMs = 0) {
  const { data, loading, error, refresh } = useFetched<BackendHealthResponse>(
    "/api/traefik/health",
    pollMs
  );
  return { health: data, loading, error, refresh };
}

export function useTraefikMiddlewares() {
  const { data, loading, error, refresh } = useFetched<MiddlewaresResponse>(
    "/api/traefik/middlewares"
  );
  return { middlewares: data, loading, error, refresh };
}

export function useTraefikEntrypoints() {
  const { data, loading, error, refresh } = useFetched<EntrypointsResponse>(
    "/api/traefik/entrypoints"
  );
  return { entrypoints: data, loading, error, refresh };
}

export function useTraefikCertResolvers() {
  const { data, loading, error, refresh } = useFetched<CertResolversResponse>(
    "/api/traefik/cert-resolvers"
  );
  return { certResolvers: data, loading, error, refresh };
}

export function useTraefikRuntime(pollMs = 0) {
  const { data, loading, error, refresh } = useFetched<RuntimeResponse>(
    "/api/traefik/runtime",
    pollMs
  );
  return { runtime: data, loading, error, refresh };
}

export function useTraefikMetrics(pollMs = 0) {
  const { data, loading, error, refresh } = useFetched<MetricsResponse>(
    "/api/traefik/metrics",
    pollMs
  );
  return { metrics: data, loading, error, refresh };
}

export function useRouteConflicts(pollMs = 0) {
  const { data, loading, error, refresh } = useFetched<RouteConflictsResponse>(
    "/api/traefik/conflicts",
    pollMs
  );
  return { conflicts: data, loading, error, refresh };
}

/**
 * Certificates are read by live TLS probes, so fetch lazily — only once the
 * Certs tab is first opened (`enabled`). `refresh` re-probes on demand, and a
 * failed probe surfaces as `error` (retried whenever the tab is re-opened).
 */
export function useTraefikCertificates(enabled: boolean) {
  const [data, setData] = useState<CertificatesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/traefik/certificates", {
        cache: "no-store",
      });
      if (res.ok) {
        setData((await res.json()) as CertificatesResponse);
        setError(null);
      } else {
        setError(describeFailure(res));
      }
    } catch (err) {
      setError(describeFailure(null, err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && !data) refresh();
  }, [enabled, data, refresh]);

  return { certificates: data, loading, error, refresh };
}
