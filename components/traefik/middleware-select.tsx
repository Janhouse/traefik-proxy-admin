"use client";

import { useTraefikMiddlewares } from "@/hooks/use-traefik";
import { TagSelect, type TagOption } from "./tag-select";

export function MiddlewareSelect({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (names: string[]) => void;
  disabled?: boolean;
}) {
  const { middlewares, loading } = useTraefikMiddlewares();
  const configured = !!middlewares?.configured;
  const reachable = !!middlewares?.reachable;
  const available = configured && reachable;

  const options: TagOption[] = (middlewares?.middlewares || []).map((m) => ({
    name: m.name,
    type: m.type,
    provider: m.provider,
  }));

  return (
    <div>
      <TagSelect
        value={value}
        onChange={onChange}
        options={options}
        allowCustom={!available}
        disabled={disabled}
        inputId="middlewares"
        placeholder={
          available
            ? "Search Traefik middlewares…"
            : "Type a middleware name…"
        }
      />
      {!loading && !available && (
        <p className="mt-1.5 text-[12px] text-[var(--warn)]">
          {configured
            ? "Traefik API unreachable — enter middleware names manually."
            : "Set TRAEFIK_API_URL to pick from discovered middlewares. Enter names manually for now."}
        </p>
      )}
    </div>
  );
}
