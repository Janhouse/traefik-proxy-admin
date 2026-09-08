"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { ProviderPill } from "./provider-pill";

export interface TagOption {
  name: string;
  type?: string;
  provider?: string;
}

interface TagSelectProps {
  value: string[];
  onChange: (names: string[]) => void;
  options: TagOption[];
  /** Allow adding a typed value that isn't in `options` (free text). */
  allowCustom?: boolean;
  placeholder?: string;
  disabled?: boolean;
  inputId?: string;
}

/**
 * Chip multi-select. Picks from `options` (e.g. Traefik-discovered
 * middlewares). Values already selected but missing from `options` render as
 * "gone" chips so they're preserved + flagged rather than silently dropped.
 */
export function TagSelect({
  value,
  onChange,
  options,
  allowCustom = false,
  placeholder = "Search…",
  disabled = false,
  inputId,
}: TagSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const optionByName = useMemo(() => {
    const m = new Map<string, TagOption>();
    options.forEach((o) => m.set(o.name, o));
    return m;
  }, [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        !value.includes(o.name) &&
        (!q ||
          o.name.toLowerCase().includes(q) ||
          (o.type || "").toLowerCase().includes(q))
    );
  }, [options, value, query]);

  const trimmed = query.trim();
  const canAddCustom =
    allowCustom &&
    trimmed.length > 0 &&
    !value.includes(trimmed) &&
    !options.some((o) => o.name === trimmed);

  const rowCount = filtered.length + (canAddCustom ? 1 : 0);

  useEffect(() => setCursor(0), [query, open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const add = (name: string) => {
    if (!name || value.includes(name)) return;
    onChange([...value, name]);
    setQuery("");
  };
  const remove = (name: string) =>
    onChange(value.filter((n) => n !== name));

  const commitCursor = () => {
    if (canAddCustom && cursor === filtered.length) {
      add(trimmed);
    } else if (filtered[cursor]) {
      add(filtered[cursor].name);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitCursor();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setCursor((c) => Math.min(c + 1, rowCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <div
        className="tags"
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus();
            setOpen(true);
          }
        }}
      >
        {value.map((name) => {
          const opt = optionByName.get(name);
          const gone = !opt;
          return (
            <span key={name} className={`tag ${gone ? "gone" : ""}`}>
              {name}
              {opt?.provider ? (
                <span className="prov">{opt.provider}</span>
              ) : gone ? (
                <span className="prov">missing</span>
              ) : null}
              <button
                type="button"
                className="rm"
                aria-label={`Remove ${name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(name);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          id={inputId}
          ref={inputRef}
          className="tag-input"
          type="text"
          autoComplete="off"
          placeholder={value.length === 0 ? placeholder : ""}
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && !disabled && (rowCount > 0 || query) && (
        <div className="tag-menu">
          {filtered.map((o, i) => (
            <div
              key={o.name}
              className={`tag-opt ${i === cursor ? "cur" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                add(o.name);
              }}
            >
              <span className="nm">{o.name}</span>
              {o.type && <span className="ty">{o.type}</span>}
              {o.provider && (
                <span className="loc">
                  <ProviderPill provider={o.provider} />
                </span>
              )}
            </div>
          ))}
          {canAddCustom && (
            <div
              className={`tag-opt ${cursor === filtered.length ? "cur" : ""}`}
              onMouseEnter={() => setCursor(filtered.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                add(trimmed);
              }}
            >
              <span className="nm">Add &ldquo;{trimmed}&rdquo;</span>
              <span className="ty">custom</span>
            </div>
          )}
          {rowCount === 0 && (
            <div className="tag-empty">
              No matching options{query ? ` for “${query}”` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
