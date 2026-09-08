type MetaVariant = "warn" | "danger" | "info" | "https";

/** Config-state badge: whether this route is pushed to Traefik. */
export function StatusBadge({
  enabled,
  className = "",
}: {
  enabled: boolean;
  className?: string;
}) {
  return (
    <span
      className={`badge-state ${enabled ? "enabled" : "disabled"} ${className}`}
    >
      <span className="dot" />
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

/** Secondary pill (entrypoint, middleware hint, backend-down, …). */
export function MetaBadge({
  variant,
  children,
  title,
  withDot = false,
  className = "",
}: {
  variant: MetaVariant;
  children: React.ReactNode;
  title?: string;
  withDot?: boolean;
  className?: string;
}) {
  return (
    <span className={`badge-state ${variant} ${className}`} title={title}>
      {withDot && <span className="dot" />}
      {children}
    </span>
  );
}
