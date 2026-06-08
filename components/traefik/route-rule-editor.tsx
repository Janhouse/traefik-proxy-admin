"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NextLink from "next/link";
import {
  Plus,
  X,
  ChevronDown,
  Check,
  Globe,
  Lock,
  Network,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { useTraefikEntrypoints, useRouteConflicts } from "@/hooks/use-traefik";
import { toast } from "@/components/toaster";
import {
  MATCHER_TYPES,
  METHODS,
  matcherDef,
  hostToken,
  assembleRule,
  tokenizeRule,
  type MatchRule,
  type MatchType,
  type HostnameMode,
} from "@/lib/route-rule";

interface DomainLite {
  id: string;
  name: string;
  domain: string;
  isDefault: boolean;
}

interface RouteRuleValue {
  domainId: string;
  subdomain: string | null;
  hostnameMode: HostnameMode;
  entrypoints: string[];
  matchRules: MatchRule[];
}

interface RouteRuleEditorProps {
  initial: {
    domainId: string;
    subdomain: string;
    hostnameMode: HostnameMode;
    customHostnames?: string | null;
    entrypoints: string[];
    matchRules: MatchRule[];
  };
  domains: DomainLite[];
  serviceId?: string;
  onChange: (v: RouteRuleValue) => void;
  onBlockedChange?: (blocked: boolean) => void;
  disabled?: boolean;
}

function parseCustomList(json?: string | null): string[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

function epIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("secure") || n.includes("443")) return <Lock />;
  if (n.includes("web") || n.includes("http") || n.includes("80")) return <Globe />;
  return <Network />;
}

export function RouteRuleEditor({
  initial,
  domains,
  serviceId,
  onChange,
  onBlockedChange,
  disabled,
}: RouteRuleEditorProps) {
  const [domainId, setDomainId] = useState(initial.domainId);
  const [sub, setSub] = useState(initial.subdomain || "");
  const [mode, setMode] = useState<"subdomain" | "apex">(
    initial.hostnameMode === "apex" ? "apex" : "subdomain"
  );
  const [eps, setEps] = useState<string[]>(initial.entrypoints);
  const [matchers, setMatchers] = useState<MatchRule[]>(initial.matchRules);
  const [converted, setConverted] = useState(false);

  const [domainOpen, setDomainOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const domainRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const convertedOnce = useRef(false);

  const { entrypoints } = useTraefikEntrypoints();
  const { conflicts } = useRouteConflicts();

  const domainName = domains.find((d) => d.id === domainId)?.domain || "";

  // default domain
  useEffect(() => {
    if (!domainId && domains.length) {
      const def = domains.find((d) => d.isDefault) || domains[0];
      if (def) setDomainId(def.id);
    }
  }, [domains, domainId]);

  // one-time legacy `custom` conversion → primary sub/apex + Host matchers
  useEffect(() => {
    if (convertedOnce.current) return;
    if (initial.hostnameMode !== "custom" || initial.matchRules.length) return;
    const hosts = parseCustomList(initial.customHostnames);
    const dn = domains.find((d) => d.id === (domainId || initial.domainId))?.domain;
    if (!hosts.length || !dn) return;
    convertedOnce.current = true;
    const first = hosts[0];
    let extra = hosts.slice(1);
    if (first === dn) {
      setMode("apex");
      setSub("");
    } else if (first.endsWith("." + dn)) {
      setMode("subdomain");
      setSub(first.slice(0, first.length - dn.length - 1));
    } else {
      // first host isn't under this domain — keep it as a Host matcher, apex primary
      setMode("apex");
      setSub("");
      extra = hosts;
    }
    setMatchers(extra.map((h) => ({ type: "Host", conn: "OR", value: h })));
    setConverted(true);
  }, [domains, domainId, initial]);

  // emit upward on any change
  useEffect(() => {
    onChange({
      domainId,
      subdomain: mode === "subdomain" ? sub || null : null,
      hostnameMode: mode,
      entrypoints: eps,
      matchRules: matchers,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId, sub, mode, eps, matchers]);

  // close popovers on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (domainRef.current && !domainRef.current.contains(e.target as Node))
        setDomainOpen(false);
      if (addRef.current && !addRef.current.contains(e.target as Node))
        setAddOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const primaryHost = hostToken(mode, sub, domainName || "domain.com");
  const rule = useMemo(
    () => assembleRule(primaryHost, matchers),
    [primaryHost, matchers]
  );
  const tokens = useMemo(() => tokenizeRule(rule), [rule]);

  const epList = useMemo(() => entrypoints?.entrypoints || [], [entrypoints]);
  // include any saved entrypoint not reported by the API
  const epNames = useMemo(() => {
    const names = epList.map((e) => e.name);
    for (const e of eps) if (!names.includes(e)) names.push(e);
    return names;
  }, [epList, eps]);

  // conflict: same primary host + overlapping entrypoint on another router
  const conflict = useMemo(() => {
    if (!conflicts?.reachable || !domainName) return null;
    for (const r of conflicts.routers) {
      if (r.managedServiceId && serviceId && r.managedServiceId === serviceId)
        continue; // this service
      if (!r.hosts.includes(primaryHost)) continue;
      const overlap = r.entryPoints.some((e) => eps.includes(e));
      if (!overlap) continue;
      return r;
    }
    return null;
  }, [conflicts, primaryHost, eps, serviceId, domainName]);

  const blocked = !!conflict && !conflict.managedServiceId;
  useEffect(() => {
    onBlockedChange?.(blocked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  // ── matcher ops ──────────────────────────────────────────────────────────
  const addMatcher = (type: MatchType) => {
    setMatchers((m) => [
      ...m,
      { type, conn: type === "Host" ? "OR" : "AND", value: "", key: "", method: "GET" },
    ]);
    setAddOpen(false);
  };
  const updateMatcher = (i: number, patch: Partial<MatchRule>) =>
    setMatchers((m) => m.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeMatcher = (i: number) =>
    setMatchers((m) => m.filter((_, j) => j !== i));
  const toggleEp = (name: string) =>
    setEps((cur) =>
      cur.includes(name) ? cur.filter((e) => e !== name) : [...cur, name]
    );

  return (
    <div className="flex flex-col gap-[18px]">
      {/* host super-input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold">Public hostname</label>
        <div
          className={`host-wrap ${domainOpen ? "menu-open" : ""}`}
          ref={domainRef}
        >
          <div className={`host-compose ${mode === "apex" ? "apex" : ""}`}>
            <div className="host-string">
              <span className="host-sub">
                <input
                  type="text"
                  value={sub}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Subdomain"
                  placeholder="subdomain"
                  disabled={disabled}
                  onChange={(e) =>
                    setSub(e.target.value.replace(/[^a-zA-Z0-9-.]/g, ""))
                  }
                />
              </span>
              <span className="host-dot">.</span>
              <button
                type="button"
                className="host-domain"
                disabled={disabled}
                onClick={() => setDomainOpen((v) => !v)}
              >
                <span>{domainName || "select domain"}</span>
                <ChevronDown className="caret" />
              </button>
            </div>
            <div className="host-toggle" role="group" aria-label="Hostname mode">
              <button
                type="button"
                className={mode === "subdomain" ? "on" : ""}
                onClick={() => setMode("subdomain")}
                disabled={disabled}
              >
                Subdomain
              </button>
              <button
                type="button"
                className={mode === "apex" ? "on" : ""}
                onClick={() => setMode("apex")}
                disabled={disabled}
              >
                Apex
              </button>
            </div>
          </div>
          {domainOpen && (
            <div className="host-menu">
              {domains.map((d) => (
                <div
                  key={d.id}
                  className={`host-opt ${d.id === domainId ? "sel cur" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setDomainId(d.id);
                    setDomainOpen(false);
                  }}
                >
                  <span className="hn">{d.domain}</span>
                  {d.isDefault && <span className="tag-default">default</span>}
                  <span className="ck">
                    <Check className="h-4 w-4" />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <span className="text-[12px] text-[var(--meta)]">
          Toggle <strong>Apex</strong> to route the bare domain. Public URL:{" "}
          <span className="mono">{primaryHost}</span>
        </span>
        {converted && (
          <span className="text-[12px] text-[var(--warn)]">
            Converted from custom hostnames — extra hosts became Host matchers
            below. Review before saving.
          </span>
        )}
      </div>

      {/* conflict banner */}
      {conflict && (
        <div className={`conflict ${conflict.managedServiceId ? "managed" : "external"}`}>
          <span className="c-ic">
            <AlertTriangle className="h-[17px] w-[17px]" />
          </span>
          <div className="c-body">
            <div className="c-title">
              {conflict.managedServiceId
                ? "This rule is already managed here"
                : "Conflicts with a router outside this tool"}
            </div>
            <div className="c-msg">
              <code>Host(`{primaryHost}`)</code> on{" "}
              <span className="prov-pill internal">
                {conflict.entryPoints.filter((e) => eps.includes(e)).join(", ")}
              </span>{" "}
              is already claimed by router{" "}
              <code>{conflict.routerName}</code>
              {conflict.managedServiceId
                ? " — editing here would duplicate it."
                : " defined outside the configurator — saving would collide at runtime."}
            </div>
            {conflict.managedServiceId ? (
              <div className="c-actions">
                <NextLink
                  className="text-[12px] font-semibold text-[var(--warn)] hover:underline"
                  href={`/services/${conflict.managedServiceId}`}
                >
                  View the owning service →
                </NextLink>
              </div>
            ) : (
              <div className="c-meta">
                Source{" "}
                <span className={`prov-pill ${conflict.provider}`}>
                  {conflict.provider}
                </span>{" "}
                · read-only here · saving is blocked
              </div>
            )}
          </div>
        </div>
      )}

      {/* entrypoints */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold">Entrypoints</label>
        <div className="ep-grid">
          {epNames.length === 0 && (
            <span className="text-[12px] text-[var(--meta)]">
              No entrypoints discovered — set TRAEFIK_API_URL.
            </span>
          )}
          {epNames.map((name) => {
            const info = epList.find((e) => e.name === name);
            const on = eps.includes(name);
            return (
              <button
                type="button"
                key={name}
                className={`ep-card ${on ? "on" : ""}`}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggleEp(name)}
              >
                <span className="ep-ic [&_svg]:h-[15px] [&_svg]:w-[15px]">
                  {epIcon(name)}
                </span>
                <span className="ep-meta">
                  <span className="ep-nm">{name}</span>
                  <span className="ep-sub">{info?.address || "—"}</span>
                </span>
                <Check className="ep-ck" />
              </button>
            );
          })}
        </div>
        <span className="text-[12px] text-[var(--meta)]">
          A router can bind several entrypoints. Empty = the global default.
        </span>
      </div>

      {/* matchers */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-[13px] font-semibold">
            Additional match rules{" "}
            <span className="font-normal text-[var(--meta)]">(optional)</span>
          </label>
          <div className="relative" ref={addRef}>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] font-semibold hover:border-[var(--border-strong)]"
              disabled={disabled}
              onClick={() => setAddOpen((v) => !v)}
            >
              <Plus className="h-3.5 w-3.5" /> Add rule
            </button>
            {addOpen && (
              <div className="addmatch-menu">
                {MATCHER_TYPES.map((t) => (
                  <div
                    key={t.key}
                    className="tag-opt"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addMatcher(t.key);
                    }}
                  >
                    <span className="flex flex-col">
                      <span className="nm">{t.label}</span>
                      <span className="ty">{t.desc}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="matchers">
          {matchers.map((m, i) => {
            const def = matcherDef(m.type);
            return (
              <div className="matcher-row" key={i}>
                <button
                  type="button"
                  className="m-conn"
                  data-conn={m.conn}
                  disabled={disabled}
                  onClick={() =>
                    updateMatcher(i, { conn: m.conn === "AND" ? "OR" : "AND" })
                  }
                  title="Toggle AND / OR"
                >
                  {m.conn === "OR" ? "OR" : "AND"}
                </button>
                <select
                  className="m-type rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2 py-2 text-[13px]"
                  value={m.type}
                  disabled={disabled}
                  onChange={(e) =>
                    updateMatcher(i, { type: e.target.value as MatchType })
                  }
                >
                  {MATCHER_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {def.fields.includes("method") ? (
                  <select
                    className="rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2 py-2 text-[13px] font-mono"
                    value={m.method || "GET"}
                    disabled={disabled}
                    onChange={(e) => updateMatcher(i, { method: e.target.value })}
                  >
                    {METHODS.map((mm) => (
                      <option key={mm} value={mm}>
                        {mm}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    {def.fields.includes("key") && (
                      <input
                        className="min-w-0 flex-1 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2.5 py-2 font-mono text-[13px]"
                        value={m.key || ""}
                        placeholder={def.ph[0]}
                        disabled={disabled}
                        onChange={(e) => updateMatcher(i, { key: e.target.value })}
                      />
                    )}
                    <input
                      className="min-w-0 flex-[2] rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2.5 py-2 font-mono text-[13px]"
                      value={m.value || ""}
                      placeholder={def.fields.includes("key") ? def.ph[1] : def.ph[0]}
                      disabled={disabled}
                      onChange={(e) => updateMatcher(i, { value: e.target.value })}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="grid h-8 w-8 flex-none place-items-center rounded-[var(--radius-sm)] text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                  disabled={disabled}
                  onClick={() => removeMatcher(i)}
                  aria-label="Remove rule"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
        <span className="text-[12px] text-[var(--meta)]">
          Refine beyond the host — path, header, query, method or client-IP. Path
          matchers forward the full path; add a stripPrefix middleware if your
          backend needs it.
        </span>
      </div>

      {/* rule preview */}
      <div className="rule-preview">
        <div className="rp-head">
          <span className="rp-k">Generated router rule</span>
          <button
            type="button"
            className="rp-copy"
            onClick={() => {
              navigator.clipboard?.writeText(rule);
              toast("Rule copied to clipboard");
            }}
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
        <code className="rp-code">
          {tokens.map((t, i) =>
            t.t === "txt" ? (
              <span key={i}>{t.v}</span>
            ) : (
              <span key={i} className={t.t}>
                {t.v}
              </span>
            )
          )}
        </code>
      </div>
    </div>
  );
}
