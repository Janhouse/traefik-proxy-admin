"use client";

import { useCallback, useEffect, useState } from "react";
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

function useFetched<T>(url: string, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) setData((await res.json()) as T);
    } catch {
      /* swallow — UI shows graceful "unreachable" states */
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    refresh();
    if (pollMs > 0) {
      const id = setInterval(refresh, pollMs);
      return () => clearInterval(id);
    }
  }, [refresh, pollMs]);

  return { data, loading, refresh };
}

export function useBackendHealth(pollMs = 0) {
  const { data, loading, refresh } = useFetched<BackendHealthResponse>(
    "/api/traefik/health",
    pollMs
  );
  return { health: data, loading, refresh };
}

export function useTraefikMiddlewares() {
  const { data, loading, refresh } = useFetched<MiddlewaresResponse>(
    "/api/traefik/middlewares"
  );
  return { middlewares: data, loading, refresh };
}

export function useTraefikEntrypoints() {
  const { data, loading, refresh } = useFetched<EntrypointsResponse>(
    "/api/traefik/entrypoints"
  );
  return { entrypoints: data, loading, refresh };
}

export function useTraefikCertResolvers() {
  const { data, loading, refresh } = useFetched<CertResolversResponse>(
    "/api/traefik/cert-resolvers"
  );
  return { certResolvers: data, loading, refresh };
}

export function useTraefikRuntime(pollMs = 0) {
  const { data, loading, refresh } = useFetched<RuntimeResponse>(
    "/api/traefik/runtime",
    pollMs
  );
  return { runtime: data, loading, refresh };
}

export function useTraefikMetrics(pollMs = 0) {
  const { data, loading, refresh } = useFetched<MetricsResponse>(
    "/api/traefik/metrics",
    pollMs
  );
  return { metrics: data, loading, refresh };
}

export function useRouteConflicts(pollMs = 0) {
  const { data, loading, refresh } = useFetched<RouteConflictsResponse>(
    "/api/traefik/conflicts",
    pollMs
  );
  return { conflicts: data, loading, refresh };
}

/**
 * Certificates are read by live TLS probes, so fetch lazily — only once the
 * Certs tab is first opened (`enabled`). `refresh` re-probes on demand.
 */
export function useTraefikCertificates(enabled: boolean) {
  const [data, setData] = useState<CertificatesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/traefik/certificates", {
        cache: "no-store",
      });
      if (res.ok) setData((await res.json()) as CertificatesResponse);
    } catch {
      /* swallow — UI shows graceful states */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && !data) refresh();
  }, [enabled, data, refresh]);

  return { certificates: data, loading, refresh };
}
