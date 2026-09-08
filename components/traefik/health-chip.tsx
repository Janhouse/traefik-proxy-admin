import type { BackendHealthState } from "@/lib/traefik-client-types";

const DEFAULT_LABEL: Record<BackendHealthState, string> = {
  up: "Reachable",
  down: "Unreachable",
  unknown: "Checking",
  na: "—",
};

const DEFAULT_TITLE: Record<BackendHealthState, string> = {
  up: "Traefik / probe can reach the upstream target",
  down: "The upstream target is not reachable",
  unknown: "Awaiting a health signal from Traefik",
  na: "Not probed while disabled",
};

export function HealthChip({
  state,
  label,
  title,
  className = "",
}: {
  state: BackendHealthState;
  label?: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={`health ${state} ${className}`}
      title={title ?? DEFAULT_TITLE[state]}
    >
      <span className="hdot" />
      {label ?? DEFAULT_LABEL[state]}
    </span>
  );
}
