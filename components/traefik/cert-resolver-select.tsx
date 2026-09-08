"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useTraefikCertResolvers } from "@/hooks/use-traefik";

interface CertResolverSelectProps {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  placeholder?: string;
}

/**
 * Single-value combobox over the cert resolvers inferred from the Traefik
 * API (routers / entrypoint defaults / managed config). Free text is ALWAYS
 * allowed: Traefik has no resolver API, so inference can't see resolvers
 * nothing references yet — typing stays the source of truth, the dropdown
 * is a shortcut.
 */
export function CertResolverSelect({
  value,
  onChange,
  disabled,
  id,
  required,
  placeholder = "e.g., letsencrypt",
}: CertResolverSelectProps) {
  const { certResolvers } = useTraefikCertResolvers();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const options = useMemo(
    () => certResolvers?.resolvers ?? [],
    [certResolvers]
  );
  const trimmed = value.trim();
  const exact = options.some((o) => o.name === trimmed);
  // While the typed value exactly matches an option, keep the full list
  // visible so switching resolvers doesn't require clearing the field first.
  const filtered = useMemo(() => {
    if (exact || !trimmed) return options;
    const q = trimmed.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, trimmed, exact]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const undiscovered =
    !!certResolvers?.reachable && !!trimmed && !exact && options.length > 0;

  return (
    <div className="relative" ref={rootRef}>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" || e.key === "Enter") setOpen(false);
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      {open && !disabled && filtered.length > 0 && (
        <div className="tag-menu">
          {filtered.map((o) => (
            <div
              key={o.name}
              className="tag-opt"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.name);
                setOpen(false);
              }}
            >
              <span className="nm">{o.name}</span>
              <span className="ty">{o.source}</span>
            </div>
          ))}
        </div>
      )}
      {undiscovered && (
        <p className="mt-1 text-[12px] text-[var(--meta)]">
          Not seen via the Traefik API — make sure this resolver exists in the
          static configuration.
        </p>
      )}
    </div>
  );
}
