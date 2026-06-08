"use client";

import { useMemo, useState } from "react";
import { Search, AlertTriangle, RefreshCw } from "lucide-react";
import { HealthChip } from "@/components/traefik/health-chip";
import { ProviderPill } from "@/components/traefik/provider-pill";
import { useTraefikRuntime, useTraefikCertificates } from "@/hooks/use-traefik";
import type {
  BackendHealthState,
  CertificatesResponse,
} from "@/lib/traefik-client-types";

type TabKey =
  | "http-routers"
  | "http-services"
  | "middlewares"
  | "tcp-routers"
  | "tcp-services"
  | "tcp-middlewares"
  | "udp-routers"
  | "udp-services"
  | "plugins"
  | "certs";

export function RuntimeExplorer() {
  const { runtime, loading } = useTraefikRuntime(10000);
  const [tab, setTab] = useState<TabKey>("http-routers");
  const [query, setQuery] = useState("");
  const {
    certificates: certs,
    loading: certsLoading,
    refresh: refreshCerts,
  } = useTraefikCertificates(tab === "certs");

  if (loading && !runtime) {
    return (
      <div className="rounded-[var(--radius-lg)] border bg-card p-10 text-center text-muted-foreground">
        Connecting to Traefik…
      </div>
    );
  }

  if (!runtime?.configured) {
    return (
      <div className="callout info">
        <AlertTriangle className="ico" />
        <div>
          <h4 className="text-[13.5px] font-semibold">
            Traefik API not configured
          </h4>
          <p className="text-[13px] text-[var(--fg-2)]">
            Set the <span className="mono">TRAEFIK_API_URL</span> environment
            variable (e.g. <span className="mono">http://localhost:8080</span>)
            and enable the Traefik API to mirror its runtime here.
          </p>
        </div>
      </div>
    );
  }

  if (!runtime.reachable) {
    return (
      <div className="callout warn">
        <AlertTriangle className="ico" />
        <div>
          <h4 className="text-[13.5px] font-semibold">
            Traefik API unreachable
          </h4>
          <p className="text-[13px] text-[var(--fg-2)]">
            {runtime.error ||
              "Configured, but the Traefik API did not respond."}
          </p>
        </div>
      </div>
    );
  }

  const c = runtime.counts;
  const GROUPS: { label: string; tabs: { key: TabKey; label: string; count: number }[] }[] =
    [
      {
        label: "HTTP",
        tabs: [
          { key: "http-routers", label: "Routers", count: c.httpRouters },
          { key: "http-services", label: "Services", count: c.httpServices },
          { key: "middlewares", label: "Middlewares", count: c.middlewares },
        ],
      },
      {
        label: "TCP",
        tabs: [
          { key: "tcp-routers", label: "Routers", count: c.tcpRouters },
          { key: "tcp-services", label: "Services", count: c.tcpServices },
          { key: "tcp-middlewares", label: "Middlewares", count: c.tcpMiddlewares },
        ],
      },
      {
        label: "UDP",
        tabs: [
          { key: "udp-routers", label: "Routers", count: c.udpRouters },
          { key: "udp-services", label: "Services", count: c.udpServices },
        ],
      },
      {
        label: "Other",
        tabs: [
          { key: "plugins", label: "Plugins", count: c.plugins },
          {
            key: "certs",
            label: "Certificates",
            count: certs?.certificates.length ?? 0,
          },
        ],
      },
    ];

  return (
    <div>
      {/* grouped tabs */}
      <div className="rt-tabbar mb-[18px]">
        {GROUPS.map((g) => (
          <div className="rt-tabgroup" key={g.label}>
            <span className="gl">{g.label}</span>
            <div className="gt">
              {g.tabs.map((t) => (
                <button
                  key={t.key}
                  className={`rt-tab ${tab === t.key ? "on" : ""}`}
                  onClick={() => {
                    setTab(t.key);
                    setQuery("");
                  }}
                >
                  {t.label}
                  <span className="cnt">{t.count}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* search + legend */}
      <div className="mb-3.5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--meta)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter the current tab…"
            autoComplete="off"
            className="w-full rounded-[var(--radius-sm)] border bg-[var(--surface-2)] py-2 pl-9 pr-3 text-[13.5px] outline-none focus:border-[var(--brand)] focus:shadow-[var(--ring-glow)]"
          />
        </div>
        {tab === "certs" && (
          <button
            onClick={() => refreshCerts()}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2.5 py-2 text-[12.5px] font-semibold hover:border-[var(--border-strong)]"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${certsLoading ? "animate-spin" : ""}`}
            />
            Re-probe
          </button>
        )}
        <span className="font-mono text-[12.5px] text-[var(--meta)]">
          version {runtime.version?.version || "—"} ·{" "}
          {runtime.entrypoints.length} entrypoint
          {runtime.entrypoints.length === 1 ? "" : "s"}
        </span>
      </div>

      {tab === "http-routers" && (
        <RuntimeTable
          minWidth={760}
          query={query}
          head={[
            "Router",
            "Rule",
            "Entrypoints",
            "Service",
            "Middlewares",
            "Provider",
            "Health",
          ]}
          rows={runtime.httpRouters.map((r) => ({
            search: `${r.name} ${r.rule} ${r.service} ${r.provider} ${r.entryPoints.join(" ")} ${r.middlewares.join(" ")}`,
            cells: [
              <span key="n" className="nm">{r.name}</span>,
              <span key="r" className="rt-rule">{r.rule}</span>,
              <span key="e" className="mono">{r.entryPoints.join(", ") || "—"}</span>,
              <span key="s" className="mono">{r.service}</span>,
              <span key="m" className="mono text-[12px]">{r.middlewares.join(", ") || "—"}</span>,
              <ProviderPill key="p" provider={r.provider} />,
              <RouterHealth key="h" state={r.health} status={r.status} />,
            ],
          }))}
          empty="No HTTP routers loaded."
        />
      )}

      {tab === "http-services" && (
        <RuntimeTable
          minWidth={680}
          query={query}
          head={["Service", "Type", "Servers", "Passing", "Provider"]}
          rows={runtime.httpServices.map((s) => ({
            search: `${s.name} ${s.type} ${s.servers.join(" ")} ${s.provider}`,
            cells: [
              <span key="n" className="nm">{s.name}</span>,
              <span key="t">{s.type}</span>,
              <span key="s" className="mono text-[12px]">{s.servers.join(", ") || "—"}</span>,
              <PassingCell key="p" state={s.health} up={s.up} total={s.total} />,
              <ProviderPill key="pr" provider={s.provider} />,
            ],
          }))}
          empty="No HTTP services loaded."
        />
      )}

      {tab === "middlewares" && (
        <RuntimeTable
          minWidth={620}
          query={query}
          head={["Middleware", "Type", "Provider", "Used by"]}
          rows={runtime.middlewares.map((m) => ({
            search: `${m.name} ${m.type} ${m.provider} ${m.usedBy.join(" ")}`,
            cells: [
              <span key="n" className="nm">{m.name}</span>,
              <span key="t">{m.type || "—"}</span>,
              <ProviderPill key="p" provider={m.provider} />,
              <span key="u" className="mono text-[12px]">{m.usedBy.join(", ") || "—"}</span>,
            ],
          }))}
          empty="No middlewares loaded."
        />
      )}

      {tab === "tcp-routers" && (
        <RuntimeTable
          minWidth={680}
          query={query}
          head={["Router", "Rule", "Entrypoints", "Service", "TLS", "Provider"]}
          rows={runtime.tcpRouters.map((r) => ({
            search: `${r.name} ${r.rule} ${r.service} ${r.provider} ${r.tls}`,
            cells: [
              <span key="n" className="nm">{r.name}</span>,
              <span key="r" className="rt-rule">{r.rule}</span>,
              <span key="e" className="mono">{r.entryPoints.join(", ") || "—"}</span>,
              <span key="s" className="mono">{r.service}</span>,
              <span key="t">{r.tls ? <span className="badge-state info">{r.tls}</span> : <span className="text-[var(--meta)]">—</span>}</span>,
              <ProviderPill key="p" provider={r.provider} />,
            ],
          }))}
          empty="No TCP routers loaded."
        />
      )}

      {tab === "tcp-services" && (
        <RuntimeTable
          minWidth={520}
          query={query}
          head={["Service", "Servers", "Provider"]}
          rows={runtime.tcpServices.map((s) => ({
            search: `${s.name} ${s.servers.join(" ")} ${s.provider}`,
            cells: [
              <span key="n" className="nm">{s.name}</span>,
              <span key="s" className="mono text-[12px]">{s.servers.join(", ") || "—"}</span>,
              <ProviderPill key="p" provider={s.provider} />,
            ],
          }))}
          empty="No TCP services loaded."
        />
      )}

      {tab === "tcp-middlewares" && (
        <RuntimeTable
          minWidth={620}
          query={query}
          head={["Middleware", "Type", "Provider", "Used by"]}
          rows={runtime.tcpMiddlewares.map((m) => ({
            search: `${m.name} ${m.type} ${m.provider} ${m.usedBy.join(" ")}`,
            cells: [
              <span key="n" className="nm">{m.name}</span>,
              <span key="t">{m.type || "—"}</span>,
              <ProviderPill key="p" provider={m.provider} />,
              <span key="u" className="mono text-[12px]">{m.usedBy.join(", ") || "—"}</span>,
            ],
          }))}
          empty="No TCP middlewares loaded."
        />
      )}

      {tab === "udp-routers" && (
        <RuntimeTable
          minWidth={520}
          query={query}
          head={["Router", "Entrypoints", "Service", "Provider", "Status"]}
          rows={runtime.udpRouters.map((r) => ({
            search: `${r.name} ${r.service} ${r.provider} ${r.entryPoints.join(" ")} ${r.status}`,
            cells: [
              <span key="n" className="nm">{r.name}</span>,
              <span key="e" className="mono">{r.entryPoints.join(", ") || "—"}</span>,
              <span key="s" className="mono">{r.service}</span>,
              <ProviderPill key="p" provider={r.provider} />,
              <span key="st">{r.status || "—"}</span>,
            ],
          }))}
          empty="No UDP routers loaded."
        />
      )}

      {tab === "udp-services" && (
        <RuntimeTable
          minWidth={420}
          query={query}
          head={["Service", "Servers", "Provider"]}
          rows={runtime.udpServices.map((s) => ({
            search: `${s.name} ${s.servers.join(" ")} ${s.provider}`,
            cells: [
              <span key="n" className="nm">{s.name}</span>,
              <span key="s" className="mono text-[12px]">{s.servers.join(", ") || "—"}</span>,
              <ProviderPill key="p" provider={s.provider} />,
            ],
          }))}
          empty="No UDP services loaded."
        />
      )}

      {tab === "plugins" && (
        <RuntimeTable
          minWidth={520}
          query={query}
          head={["Plugin / middleware", "Type", "Provider"]}
          rows={runtime.plugins.map((p) => ({
            search: `${p.name} ${p.type} ${p.provider}`,
            cells: [
              <span key="n" className="nm">{p.name}</span>,
              <span key="t" className="mono text-[12px]">{p.type}</span>,
              <ProviderPill key="p" provider={p.provider} />,
            ],
          }))}
          empty="No plugin middlewares detected via the Traefik API."
        />
      )}

      {tab === "certs" && (
        <CertsPanel data={certs} loading={certsLoading} query={query} />
      )}

      <p className="mt-4 text-[12px] text-[var(--meta)]">
        Read-only mirror of the Traefik API (
        <span className="mono">/api/http|tcp|udp/*</span>,{" "}
        <span className="mono">/api/entrypoints</span>). Certificates are read by
        live TLS probes (SNI) since the API exposes none. Editing happens on the
        Services screen.
      </p>
    </div>
  );
}

/* ── certificates ───────────────────────────────────────────────────────────── */

function CertsPanel({
  data,
  loading,
  query,
}: {
  data: CertificatesResponse | null;
  loading: boolean;
  query: string;
}) {
  if (loading && !data) {
    return (
      <div className="rounded-[var(--radius-lg)] border bg-card p-10 text-center text-muted-foreground">
        Probing certificates over TLS…
      </div>
    );
  }
  if (!data) return null;
  if (data.error && data.certificates.length === 0) {
    return (
      <div className="callout warn">
        <AlertTriangle className="ico" />
        <div>
          <h4 className="text-[13.5px] font-semibold">
            Couldn&rsquo;t read certificates
          </h4>
          <p className="text-[13px] text-[var(--fg-2)]">{data.error}</p>
        </div>
      </div>
    );
  }

  return (
    <RuntimeTable
      minWidth={760}
      query={query}
      head={["Common name", "Domains", "Issuer", "Expires", "Status"]}
      rows={data.certificates.map((ct) => ({
        search: `${ct.commonName} ${ct.domains.join(" ")} ${ct.sans.join(" ")} ${ct.issuer}`,
        cells: [
          <span key="n" className="nm">
            {ct.commonName}
            {ct.selfSigned && (
              <span className="ml-2 text-[11px] font-normal text-[var(--meta)]">
                self-signed
              </span>
            )}
          </span>,
          <span key="d" className="mono text-[12px]">{ct.domains.join(", ")}</span>,
          <span key="i">{ct.issuer}</span>,
          <span key="e" className="mono text-[12px]">
            {new Date(ct.notAfter).toLocaleDateString()}
          </span>,
          <ExpiryPill key="x" days={ct.daysRemaining} />,
        ],
      }))}
      empty={
        data.target
          ? `No TLS-enabled routers served a certificate from ${data.target}.`
          : "No TLS certificates found."
      }
    />
  );
}

function ExpiryPill({ days }: { days: number }) {
  const tone = days < 14 ? "danger" : days < 30 ? "warn" : "ok";
  const label =
    days < 0
      ? `expired ${Math.abs(days)}d ago`
      : days === 0
        ? "expires today"
        : `${days}d left`;
  return <span className={`exp-pill ${tone}`}>{label}</span>;
}

/* ── table ────────────────────────────────────────────────────────────────── */

interface Row {
  search: string;
  cells: React.ReactNode[];
}

function RuntimeTable({
  head,
  rows,
  query,
  minWidth,
  empty,
}: {
  head: string[];
  rows: Row[];
  query: string;
  minWidth: number;
  empty: string;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.search.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="table-wrap">
      <table className="rt-table" style={{ minWidth }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={head.length}>
                <div className="py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? empty : "No rows match your filter."}
                </div>
              </td>
            </tr>
          ) : (
            filtered.map((r, i) => (
              <tr key={i}>
                {r.cells.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function RouterHealth({
  state,
  status,
}: {
  state: BackendHealthState;
  status: string;
}) {
  if (status === "disabled") {
    return <HealthChip state="unknown" label="disabled" />;
  }
  return (
    <HealthChip
      state={state}
      label={state === "up" ? "up" : state === "down" ? "down" : "—"}
    />
  );
}

function PassingCell({
  state,
  up,
  total,
}: {
  state: BackendHealthState;
  up: number;
  total: number;
}) {
  if (state === "unknown" && total === 0) {
    return <HealthChip state="na" label="—" />;
  }
  return <HealthChip state={state} label={`${up} / ${total}`} />;
}
