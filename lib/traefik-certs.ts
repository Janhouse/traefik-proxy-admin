import "server-only";
import {
  getCertificates as fetchTraefikCertificates,
  isTraefikApiConfigured,
} from "@/lib/traefik-api";
import type {
  CertificatesResponse,
  RuntimeCertificate,
} from "@/lib/traefik-client-types";

/**
 * List Traefik's TLS-store certificates via /api/certificates (Traefik v3.7+).
 * Older Traefik returns 404 → `supported: false` so the UI can prompt to upgrade.
 */
export async function getCertificates(): Promise<CertificatesResponse> {
  if (!isTraefikApiConfigured()) {
    return { configured: false, reachable: false, supported: false, certificates: [] };
  }

  let raw;
  try {
    raw = await fetchTraefikCertificates();
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) {
      return {
        configured: true,
        reachable: true,
        supported: false,
        certificates: [],
        error:
          "This Traefik version has no certificates API — it was added in v3.7.",
      };
    }
    return {
      configured: true,
      reachable: false,
      supported: true,
      certificates: [],
      error: e instanceof Error ? e.message : "Traefik API unreachable",
    };
  }

  const now = Date.now();
  const certificates: RuntimeCertificate[] = raw
    .map((c) => {
      // Go marshals a nil slice as JSON null — a cert with no SANs must not
      // take the whole list down.
      const sans = c.sans ?? [];
      return {
      name: c.name,
      commonName: c.commonName || sans[0] || "—",
      sans,
      issuer: c.issuerOrg || c.issuerCN || "—",
      serialNumber: c.serialNumber,
      notBefore: c.notBefore,
      notAfter: c.notAfter,
      daysRemaining: Math.floor(
        (new Date(c.notAfter).getTime() - now) / 86_400_000
      ),
      keyType: c.keyType,
      keySize: c.keySize ?? 0,
      signatureAlgorithm: c.signatureAlgorithm,
      status: c.status,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  return { configured: true, reachable: true, supported: true, certificates };
}
