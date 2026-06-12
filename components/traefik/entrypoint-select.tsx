"use client";

import { useMemo } from "react";
import { Check, Globe, Lock, Network } from "lucide-react";
import { useTraefikEntrypoints } from "@/hooks/use-traefik";

/** Traefik's dedicated API/dashboard entrypoint (api.insecure). Per the
 * Traefik docs it should never carry application traffic, so the picker
 * hides it unless the current selection already includes it. */
export const TRAEFIK_API_ENTRYPOINT = "traefik";

function epIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("secure") || n.includes("443")) return <Lock />;
  if (n.includes("web") || n.includes("http") || n.includes("80")) return <Globe />;
  return <Network />;
}

interface EntrypointSelectProps {
  value: string[];
  onChange: (entrypoints: string[]) => void;
  disabled?: boolean;
  helpText?: React.ReactNode;
}

/**
 * Toggle-grid picker over the entrypoints discovered from the Traefik API.
 * Selected-but-undiscovered names stay visible so a saved selection never
 * silently disappears when the API is unreachable.
 */
export function EntrypointSelect({
  value,
  onChange,
  disabled,
  helpText,
}: EntrypointSelectProps) {
  const { entrypoints } = useTraefikEntrypoints();
  const epList = useMemo(() => entrypoints?.entrypoints || [], [entrypoints]);

  const showTraefikEp = value.includes(TRAEFIK_API_ENTRYPOINT);
  const epNames = useMemo(() => {
    const names = epList
      .map((e) => e.name)
      .filter((n) => n !== TRAEFIK_API_ENTRYPOINT || showTraefikEp);
    for (const e of value) if (!names.includes(e)) names.push(e);
    return names;
  }, [epList, value, showTraefikEp]);

  const toggle = (name: string) =>
    onChange(
      value.includes(name) ? value.filter((e) => e !== name) : [...value, name]
    );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="ep-grid">
        {epNames.length === 0 && (
          <span className="text-[12px] text-[var(--meta)]">
            No entrypoints discovered — set TRAEFIK_API_URL.
          </span>
        )}
        {epNames.map((name) => {
          const info = epList.find((e) => e.name === name);
          const on = value.includes(name);
          return (
            <button
              type="button"
              key={name}
              className={`ep-card ${on ? "on" : ""}`}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggle(name)}
            >
              <span className="ep-ic [&_svg]:h-[15px] [&_svg]:w-[15px]">
                {epIcon(name)}
              </span>
              <span className="ep-meta">
                <span className="ep-nm">
                  {name}
                  {name === TRAEFIK_API_ENTRYPOINT && (
                    <span
                      className="ep-api-badge"
                      title="Traefik's dedicated API/dashboard entrypoint — it should not carry application traffic. Deselect it to remove it."
                    >
                      API
                    </span>
                  )}
                </span>
                <span className="ep-sub">{info?.address || "—"}</span>
              </span>
              <Check className="ep-ck" />
            </button>
          );
        })}
      </div>
      {helpText && (
        <span className="text-[12px] text-[var(--meta)]">{helpText}</span>
      )}
    </div>
  );
}
