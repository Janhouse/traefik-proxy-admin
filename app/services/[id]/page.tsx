"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Edit,
  Power,
  PowerOff,
  Shield,
  ExternalLink,
  Copy,
  Network,
  Server,
  Activity,
  Clock,
  BarChart3,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { Button } from "@/components/ui/button";
import { StatusBadge, MetaBadge } from "@/components/traefik/status-badge";
import { HealthChip } from "@/components/traefik/health-chip";
import { MiniBars, healthToTone } from "@/components/traefik/mini-bars";
import { ServiceCountdown } from "@/components/service-countdown";
import { toast } from "@/components/toaster";
import { useServices } from "@/hooks/use-services";
import { useBackendHealth, useTraefikMetrics } from "@/hooks/use-traefik";
import {
  parseMiddlewareNames,
  primaryHostname,
  publicUrl,
  targetAddress,
  serviceEntrypoints,
} from "@/lib/service-display";
import {
  assembleRule,
  assembleRuleFromTree,
  parseMatchRules,
  treeHasHost,
} from "@/lib/route-rule";
import { useDomains } from "@/lib/hooks/use-domains";
import type { Service } from "@/components/service-table";

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const serviceId = params.id as string;
  const { fetchServiceById, toggleService } = useServices();
  const { health } = useBackendHealth(15000);
  const { metrics } = useTraefikMetrics(15000);
  // Host rules in the tree may reference any managed domain, not just the
  // service's joined one — fetch the list to resolve them in the rule display.
  const { domains, fetchDomains } = useDomains();

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const found = await fetchServiceById(serviceId);
    if (found) setService(found);
    else router.push("/services");
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetchDomains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          Loading service…
        </div>
      </AppLayout>
    );
  }
  if (!service) return null;

  const host = primaryHostname(service);
  const url = publicUrl(service);
  const middlewares = parseMiddlewareNames(service.middlewares);
  // Tree-format services carry their own Host rules; legacy services keep the
  // host in the columns and join it with assembleRule.
  const tree = parseMatchRules(service.matchRules ?? null);
  const resolveDomain = (id: string) =>
    domains.find((d) => d.id === id)?.domain ??
    (service.domain?.id === id ? service.domain.domain : null);
  const ruleText = treeHasHost(tree)
    ? assembleRuleFromTree(tree, resolveDomain)
    : assembleRule(
        primaryHostname(service) || service.domain?.domain || "",
        tree
      );
  const h = health?.services[service.id];
  const healthState = h?.state ?? (service.enabled ? "unknown" : "na");
  const m = metrics?.services[service.id];
  const tone = healthToTone(healthState);

  const onToggle = async () => {
    setBusy(true);
    try {
      await toggleService(service.id);
      await load();
      toast(service.enabled ? "Service disabled" : "Service enabled");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout>
      <PageBand
        eyebrow="Service"
        title={service.name}
        subtitle={
          host ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[var(--brand-2)] hover:underline"
            >
              {host}
            </a>
          ) : (
            "No hostname configured"
          )
        }
        backHref="/services"
        backLabel="Back to Services"
        actions={
          <>
            <StatusBadge enabled={service.enabled} />
            <Button
              variant="outline"
              onClick={() => router.push(`/services/${service.id}/security`)}
            >
              <Shield className="h-4 w-4" />
              Security
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/services/${service.id}/edit`)}
            >
              <Edit className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              className={
                service.enabled
                  ? "text-[var(--danger)] hover:text-[var(--danger)]"
                  : "text-[var(--success)] hover:text-[var(--success)]"
              }
              onClick={onToggle}
            >
              {service.enabled ? (
                <PowerOff className="h-4 w-4" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              {service.enabled ? "Disable" : "Enable"}
            </Button>
          </>
        }
      />

      <PageMain>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* Left column */}
          <div className="flex flex-col gap-4">
            <Panel title="Routing" icon={<Network className="h-[18px] w-[18px]" />}>
              <KV label="Public URL">
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
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--meta)] hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </span>
                ) : (
                  "—"
                )}
              </KV>
              <KV label="Hostname mode">{service.hostnameMode}</KV>
              <KV label="Domain">{service.domain?.domain || "—"}</KV>
              <KV label="Entrypoints (one router each)">
                {serviceEntrypoints(service).length ? (
                  serviceEntrypoints(service).join(", ")
                ) : (
                  <span className="text-[var(--meta)]">global default</span>
                )}
              </KV>
              <KV label="Rule">
                <span className="break-all text-[11px]">{ruleText}</span>
              </KV>
              <KV label="Target">{targetAddress(service)}</KV>
              <KV label="Upstream scheme">
                {service.isHttps ? (
                  <MetaBadge variant="https">HTTPS</MetaBadge>
                ) : (
                  "http"
                )}
              </KV>
              {service.isHttps && (
                <KV label="Skip TLS verify">
                  {service.insecureSkipVerify ? "yes" : "no"}
                </KV>
              )}
            </Panel>

            <Panel
              title="Middlewares"
              icon={<Server className="h-[18px] w-[18px]" />}
            >
              {middlewares.length === 0 ? (
                <p className="py-1 text-sm text-muted-foreground">
                  No middlewares applied.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 py-1">
                  {middlewares.map((m) => (
                    <span key={m} className="tag !cursor-default">
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">
            <Panel
              title="Config state"
              icon={<Activity className="h-[18px] w-[18px]" />}
            >
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge enabled={service.enabled} />
              </div>
              <KV label="In Traefik">
                {service.enabled ? "pushed to dynamic config" : "not pushed"}
              </KV>
              {service.enabled && service.enabledAt && (
                <KV label="Enabled at">
                  {new Date(service.enabledAt).toLocaleString()}
                </KV>
              )}
              <KV label="Auto-disable">
                {service.enableDurationMinutes
                  ? `${service.enableDurationMinutes} min window`
                  : "never"}
              </KV>
              {service.enabled &&
                service.enabledAt &&
                service.enableDurationMinutes != null && (
                  <div className="mt-2 flex items-center gap-1.5 border-t pt-2 text-[12px]">
                    <Clock className="h-3.5 w-3.5 text-[var(--warn)]" />
                    <ServiceCountdown
                      enabledAt={service.enabledAt}
                      durationMinutes={service.enableDurationMinutes}
                      enabled={service.enabled}
                      onExpired={load}
                    />
                  </div>
                )}
            </Panel>

            <Panel
              title="Backend health"
              icon={<Server className="h-[18px] w-[18px]" />}
            >
              <div className="mb-2">
                <HealthChip state={healthState} />
              </div>
              <KV label="Servers passing">
                {h && h.total > 0 ? `${h.up} / ${h.total}` : "—"}
              </KV>
              <KV label="Source">
                {h?.source === "traefik"
                  ? "Traefik health check"
                  : h?.source === "probe"
                    ? "direct TCP probe"
                    : "—"}
              </KV>
              <KV label="Last checked">
                {health?.checkedAt
                  ? new Date(health.checkedAt).toLocaleTimeString()
                  : "—"}
              </KV>
              {!health?.configured && (
                <p className="mt-2 border-t pt-2 text-[12px] text-[var(--meta)]">
                  Set <span className="mono">TRAEFIK_API_URL</span> for Traefik
                  health checks; falling back to direct probes.
                </p>
              )}
            </Panel>

            <Panel
              title="Traffic (last 1h)"
              icon={<BarChart3 className="h-[18px] w-[18px]" />}
            >
              {!metrics?.configured || !metrics?.available || !m ? (
                <p className="py-2 text-[12px] text-[var(--meta)]">
                  Metrics not available — enable Traefik prometheus metrics
                  (<span className="mono">--metrics.prometheus</span> with router
                  labels).
                </p>
              ) : (
                <>
                  <div className="mb-3 flex items-end gap-3 pt-1">
                    <MiniBars bars={m.bars} tone={tone} large />
                    <span className="font-mono text-[22px] font-bold leading-none">
                      {Math.round(m.reqPerSec)}
                      <span className="text-[13px] font-normal text-[var(--meta)]">
                        /s
                      </span>
                    </span>
                  </div>
                  <KV label="Error rate">
                    <span
                      className={
                        m.errorRate > 0 ? "text-[var(--danger)]" : undefined
                      }
                    >
                      {(m.errorRate * 100).toFixed(1)}%
                    </span>
                  </KV>
                  <KV label="Avg latency">
                    {m.avgLatencyMs == null ? "—" : `${m.avgLatencyMs} ms`}
                  </KV>
                  <KV label="Requests (1h)">{m.total1h.toLocaleString()}</KV>
                  <KV label="Status mix">
                    <span className="flex gap-2.5">
                      <span className="text-[var(--success)]">
                        {m.statusClasses.c2xx}
                      </span>
                      <span className="text-[var(--info)]">
                        {m.statusClasses.c3xx}
                      </span>
                      <span className="text-[var(--warn)]">
                        {m.statusClasses.c4xx}
                      </span>
                      <span className="text-[var(--danger)]">
                        {m.statusClasses.c5xx}
                      </span>
                    </span>
                  </KV>
                </>
              )}
            </Panel>
          </div>
        </div>
      </PageMain>
    </AppLayout>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border bg-card shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-3 border-b border-[var(--border-soft)] px-[18px] py-4">
        {icon && <span className="text-[var(--brand)]">{icon}</span>}
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      <div className="px-[18px] py-2">{children}</div>
    </div>
  );
}

function KV({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border-soft)] py-2.5 text-[13px] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-[var(--fg-2)]">{children}</span>
    </div>
  );
}
