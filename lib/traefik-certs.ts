import "server-only";
import {
  getHttpRouters,
  getTraefikHttpsTarget,
  isTraefikApiConfigured,
  probeCertificate,
} from "@/lib/traefik-api";
import { hostTokensOfRule } from "@/lib/route-rule";
import type {
  CertificatesResponse,
  RuntimeCertificate,
} from "@/lib/traefik-client-types";

const MAX_DOMAINS = 60;

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v.join(", ") : v || "";
}

function parseSan(san?: string): string[] {
  if (!san) return [];
  return san
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.toLowerCase().startsWith("dns:"))
    .map((s) => s.slice(4));
}

/**
 * Traefik's API does not expose certificates, so we collect the hostnames of
 * every TLS-enabled HTTP router and open a TLS connection (SNI per host) to read
 * the leaf certificate Traefik serves — then dedupe by serial/issuer.
 */
export async function getCertificates(): Promise<CertificatesResponse> {
  if (!isTraefikApiConfigured()) {
    return { configured: false, reachable: false, certificates: [] };
  }
  const target = getTraefikHttpsTarget();
  if (!target) {
    return {
      configured: true,
      reachable: false,
      certificates: [],
      error: "No HTTPS target — set TRAEFIK_HTTPS_URL or TRAEFIK_API_URL.",
    };
  }

  let routers;
  try {
    routers = await getHttpRouters();
  } catch (e) {
    return {
      configured: true,
      reachable: false,
      certificates: [],
      error: e instanceof Error ? e.message : "Traefik API unreachable",
    };
  }

  const domains = new Set<string>();
  for (const r of routers) {
    if (!r.tls) continue;
    for (const h of hostTokensOfRule(r.rule || "")) {
      if (h.includes("{") || h.includes("*")) continue; // not SNI-probable
      domains.add(h);
    }
  }
  const list = [...domains].slice(0, MAX_DOMAINS);
  const targetLabel = `${target.host}:${target.port}`;
  if (list.length === 0) {
    return {
      configured: true,
      reachable: true,
      target: targetLabel,
      certificates: [],
    };
  }

  const probes = await Promise.all(
    list.map(async (domain) => ({
      domain,
      cert: await probeCertificate(target.host, target.port, domain),
    }))
  );

  const byKey = new Map<string, RuntimeCertificate>();
  let anyReached = false;
  for (const { domain, cert } of probes) {
    if (!cert || !cert.valid_to) continue;
    anyReached = true;
    const notAfter = new Date(cert.valid_to);
    const notBefore = cert.valid_from ? new Date(cert.valid_from) : notAfter;
    const subjectCN = str(cert.subject?.CN);
    const issuerCN = str(cert.issuer?.CN) || str(cert.issuer?.O);
    const serial = cert.serialNumber || "";
    const key = `${serial}|${issuerCN}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.domains.includes(domain)) existing.domains.push(domain);
      continue;
    }
    byKey.set(key, {
      commonName: subjectCN || domain,
      sans: parseSan(cert.subjectaltname),
      domains: [domain],
      issuer: issuerCN || "—",
      serialNumber: serial,
      notBefore: notBefore.toISOString(),
      notAfter: notAfter.toISOString(),
      daysRemaining: Math.floor(
        (notAfter.getTime() - Date.now()) / 86_400_000
      ),
      selfSigned: !!subjectCN && subjectCN === issuerCN,
    });
  }

  const certificates = [...byKey.values()].sort(
    (a, b) => a.daysRemaining - b.daysRemaining
  );
  return {
    configured: true,
    reachable: anyReached,
    target: targetLabel,
    error: anyReached
      ? undefined
      : `Could not read any certificate from ${targetLabel} (is the HTTPS port reachable?).`,
    certificates,
  };
}
