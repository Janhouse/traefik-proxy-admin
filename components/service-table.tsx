"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Power,
  PowerOff,
  Edit,
  Trash2,
  Shield,
  ExternalLink,
  Clock,
  Copy,
  Link as LinkIcon,
  Users,
  Key,
  Search,
  Settings,
} from "lucide-react";
import { ServiceCountdown } from "@/components/service-countdown";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { HealthChip } from "@/components/traefik/health-chip";
import { StatusBadge, MetaBadge } from "@/components/traefik/status-badge";
import { MiniBars, healthToTone } from "@/components/traefik/mini-bars";
import { toast } from "@/components/toaster";
import {
  parseMiddlewareNames,
  primaryHostname,
  publicUrl,
  targetAddress,
  serviceEntrypoints,
} from "@/lib/service-display";
import {
  countMatchers,
  isGroup,
  parseMatchRules,
  type RuleNode,
} from "@/lib/route-rule";
import type { BackendHealthResponse, MetricsResponse } from "@/lib/traefik-client-types";

export interface Service {
  id: string;
  name: string;
  subdomain?: string | null;
  hostnameMode: "subdomain" | "apex" | "custom";
  customHostnames?: string | null;
  domainId: string;
  targetIp: string;
  targetPort: number;
  entrypoint?: string | null;
  entrypoints?: string | null; // JSON string[]
  matchRules?: string | null; // JSON RuleNode[] (matchers + groups)
  isHttps: boolean;
  insecureSkipVerify: boolean;
  enabled: boolean;
  enabledAt?: string | null;
  enableDurationMinutes?: number | null;
  middlewares?: string;
  requestHeaders?: string;
  createdAt: string;
  updatedAt: string;
  domain?: {
    id: string;
    name: string;
    domain: string;
    useWildcardCert: boolean;
    certResolver: string;
    isDefault: boolean;
  };
  hasSharedLink?: boolean;
  hasSso?: boolean;
  hasBasicAuth?: boolean;
  basicAuthCount?: number;
}

interface ServiceTableProps {
  services: Service[];
  loading: boolean;
  health?: BackendHealthResponse | null;
  metrics?: MetricsResponse | null;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onManageSecurity?: (service: Service) => void;
  onGenerateShareLink?: (serviceId: string) => Promise<void>;
  onRefresh: () => void;
}

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "∞";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h${m}m` : `${h}h`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  return h ? `${d}d${h}h` : `${d}d`;
}

/** Host rules ARE the hostname (shown as the URL), so the "+N rules" badge
 * counts only the non-Host refinements. */
function countExtraMatchers(nodes: RuleNode[]): number {
  let hosts = 0;
  const walk = (list: RuleNode[]) => {
    for (const n of list) {
      if (isGroup(n)) walk(n.children);
      else if (n.type === "Host") hosts++;
    }
  };
  walk(nodes);
  return countMatchers(nodes) - hosts;
}

type Filter = "all" | "enabled" | "disabled";

export function ServiceTable({
  services,
  loading,
  health,
  metrics,
  onDelete,
  onToggle,
  onManageSecurity,
  onGenerateShareLink,
  onRefresh,
}: ServiceTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...services].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [services]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((s) => {
      const status = s.enabled ? "enabled" : "disabled";
      if (filter !== "all" && status !== filter) return false;
      if (!q) return true;
      const haystack = [
        s.name,
        primaryHostname(s),
        targetAddress(s),
        ...parseMiddlewareNames(s.middlewares),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sorted, query, filter]);

  const enabledCount = services.filter((s) => s.enabled).length;
  const unreachableCount = health
    ? services.filter((s) => health.services[s.id]?.state === "down").length
    : 0;

  const handleToggle = async (id: string) => {
    setBusy(id);
    try {
      await onToggle(id);
    } finally {
      setBusy(null);
    }
  };
  const handleDelete = async (id: string) => {
    setBusy(id);
    try {
      await onDelete(id);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[var(--radius-lg)] border bg-card p-10 text-center text-muted-foreground">
        Loading services…
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--meta)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, domain, target IP…"
            autoComplete="off"
            className="w-full rounded-[var(--radius-sm)] border bg-[var(--surface-2)] py-2 pl-9 pr-3 text-[13.5px] outline-none focus:border-[var(--brand)] focus:shadow-[var(--ring-glow)]"
          />
        </div>
        <div className="inline-flex gap-0.5 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] p-[3px]">
          {(["all", "enabled", "disabled"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-[5px] px-3 py-1.5 text-[12.5px] font-semibold capitalize transition-colors ${
                filter === f
                  ? "bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Two-signal legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <StatusBadge enabled />
          config is live in Traefik
        </span>
        <span className="flex items-center gap-2">
          <HealthChip state="up" label="Reachable" />
          <span className="text-[var(--meta)]">·</span>
          <HealthChip state="down" label="Unreachable" />
          backend health
        </span>
        {unreachableCount > 0 && (
          <span className="font-mono text-[var(--danger)]">
            {unreachableCount} backend{unreachableCount > 1 ? "s" : ""} unreachable
          </span>
        )}
        <span className="ml-auto font-mono text-[var(--meta)]">
          {filtered.length} of {services.length} · {enabledCount} enabled
        </span>
      </div>

      {services.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border bg-card p-12 text-center">
          <Settings className="mx-auto mb-4 h-12 w-12 text-[var(--meta)]" />
          <h3 className="mb-2 text-lg font-medium">No services yet</h3>
          <p className="mb-4 text-muted-foreground">
            Get started by creating your first proxy route.
          </p>
          <Button
            className="btn-brand"
            onClick={() => router.push("/services/add")}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Service
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((service) => {
            const host = primaryHostname(service);
            const url = publicUrl(service);
            const middlewares = parseMiddlewareNames(service.middlewares);
            const matcherCount = countExtraMatchers(
              parseMatchRules(service.matchRules ?? null)
            );
            const h = health?.services[service.id];
            const healthState = h?.state ?? (service.enabled ? "unknown" : "na");
            const m = metrics?.services[service.id];
            const tone = healthToTone(healthState);

            return (
              <article
                key={service.id}
                className={`svc ${service.enabled ? "is-enabled" : "is-disabled"}`}
              >
                {/* top row */}
                <div className="mb-3 flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => router.push(`/services/${service.id}`)}
                    className="text-[15px] font-semibold tracking-tight hover:text-[var(--brand)]"
                  >
                    {service.name}
                  </button>
                  <StatusBadge enabled={service.enabled} />
                  {service.enabled && healthState === "down" && (
                    <MetaBadge variant="danger" withDot title="Backend health check failing">
                      Backend down
                    </MetaBadge>
                  )}
                  {serviceEntrypoints(service).map((ep) => (
                    <MetaBadge
                      key={ep}
                      variant="https"
                      title="A dedicated router is generated on this entrypoint"
                    >
                      {ep}
                    </MetaBadge>
                  ))}
                  {matcherCount > 0 && (
                    <MetaBadge
                      variant="info"
                      title="Additional match rules refine this route"
                    >
                      +{matcherCount} rule{matcherCount > 1 ? "s" : ""}
                    </MetaBadge>
                  )}
                  {service.isHttps && (
                    <MetaBadge variant="info">HTTPS</MetaBadge>
                  )}
                  {service.hasSharedLink && (
                    <MetaBadge variant="info" title="Shared link auth">
                      <LinkIcon className="h-3 w-3" />
                    </MetaBadge>
                  )}
                  {service.hasSso && (
                    <MetaBadge variant="info" title="SSO auth">
                      <Users className="h-3 w-3" />
                    </MetaBadge>
                  )}
                  {service.hasBasicAuth && (
                    <MetaBadge variant="info" title="Basic auth">
                      <Key className="h-3 w-3" />
                      {service.basicAuthCount && service.basicAuthCount > 1
                        ? service.basicAuthCount
                        : null}
                    </MetaBadge>
                  )}

                  {/* actions */}
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {service.hasSharedLink && onGenerateShareLink && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === service.id}
                        onClick={async () => {
                          await onGenerateShareLink(service.id);
                          toast("Share link copied to clipboard");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Link
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onManageSecurity?.(service)}
                    >
                      <Shield className="h-3.5 w-3.5" />
                      Security
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        router.push(`/services/${service.id}/edit`)
                      }
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === service.id}
                      className={
                        service.enabled
                          ? "text-[var(--danger)] hover:text-[var(--danger)]"
                          : "text-[var(--success)] hover:text-[var(--success)]"
                      }
                      onClick={() => handleToggle(service.id)}
                    >
                      {service.enabled ? (
                        <PowerOff className="h-3.5 w-3.5" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                      {service.enabled ? "Disable" : "Enable"}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === service.id}
                          className="text-[var(--danger)] hover:text-[var(--danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      }
                      title="Delete Service"
                      description={`Delete "${service.name}"? This cannot be undone.`}
                      confirmText="Delete"
                      onConfirm={() => handleDelete(service.id)}
                      variant="destructive"
                    />
                  </div>
                </div>

                {/* detail grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <Field label="URL">
                    {host ? (
                      <span className="flex items-center gap-1.5">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--brand-2)] hover:underline"
                        >
                          {host}
                        </a>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(url);
                            toast("URL copied to clipboard");
                          }}
                          className="text-[var(--meta)] hover:text-foreground"
                          aria-label="Copy URL"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <span className="text-[var(--meta)]">—</span>
                    )}
                  </Field>
                  <Field label="Target">{targetAddress(service)}</Field>
                  <Field label={middlewares.length ? "Middlewares" : "Auto Duration"}>
                    {middlewares.length ? (
                      <span className="text-[12px]">{middlewares.join(", ")}</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-[var(--meta)]" />
                        {formatDuration(service.enableDurationMinutes)}
                      </span>
                    )}
                  </Field>
                  <Field label="Backend">
                    <HealthChip
                      state={healthState}
                      label={
                        healthState === "up"
                          ? "Reachable"
                          : healthState === "down"
                            ? "Unreachable"
                            : healthState === "na"
                              ? "—"
                              : "Checking"
                      }
                    />
                  </Field>
                  <Field label="Traffic · 1h">
                    <div
                      className={`traffic ${tone === "down" ? "is-down" : ""} ${
                        !m || tone === "na" ? "is-na" : ""
                      }`}
                    >
                      <MiniBars bars={m?.bars ?? []} tone={tone} />
                      <span className="rate">
                        {!m || tone === "na" ? (
                          "—"
                        ) : (
                          <>
                            {Math.round(m.reqPerSec)}
                            <span className="u">/s</span>
                          </>
                        )}
                      </span>
                    </div>
                  </Field>
                </div>

                {service.enabled &&
                  service.enabledAt &&
                  service.enableDurationMinutes != null && (
                    <div className="mt-2 border-t pt-2 text-[12px]">
                      <ServiceCountdown
                        enabledAt={service.enabledAt}
                        durationMinutes={service.enableDurationMinutes}
                        enabled={service.enabled}
                        onExpired={onRefresh}
                      />
                    </div>
                  )}
              </article>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No services match your search.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--meta)]">
        {label}
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[13px] text-[var(--fg-2)]">
        {children}
      </div>
    </div>
  );
}
