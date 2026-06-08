const KNOWN = ["file", "docker", "kubernetes", "redis", "internal"];

/** Where a Traefik object is defined (its provider source). */
export function ProviderPill({
  provider,
  gone = false,
  className = "",
}: {
  provider: string;
  gone?: boolean;
  className?: string;
}) {
  if (gone) {
    return <span className={`prov-pill gone ${className}`}>gone</span>;
  }
  const normalized = provider.toLowerCase();
  // collapse the various k8s provider names to one pill
  const key = normalized.startsWith("kubernetes")
    ? "kubernetes"
    : KNOWN.includes(normalized)
      ? normalized
      : "internal";
  const label = normalized.startsWith("kubernetes") ? "k8s" : provider;
  return <span className={`prov-pill ${key} ${className}`}>{label}</span>;
}
