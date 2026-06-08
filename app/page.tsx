"use client";

import { useEffect } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import {
  Settings,
  CheckCircle,
  Activity,
  AlertTriangle,
  Plus,
  Server,
  Globe,
  Shield,
  Users2,
  ArrowUpRight,
  Network,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageBand, PageMain } from "@/components/page-band";
import { Button } from "@/components/ui/button";
import { HealthChip } from "@/components/traefik/health-chip";
import { StatusBadge } from "@/components/traefik/status-badge";
import { useServices } from "@/hooks/use-services";
import { useBackendHealth, useTraefikRuntime } from "@/hooks/use-traefik";
import { primaryHostname, targetAddress } from "@/lib/service-display";

export default function DashboardPage() {
  const { services, loading, fetchServices } = useServices();
  const { health } = useBackendHealth(15000);
  const { runtime } = useTraefikRuntime();
  const router = useRouter();

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const enabled = services.filter((s) => s.enabled);
  const reachable = services.filter(
    (s) => health?.services[s.id]?.state === "up"
  ).length;
  const unreachable = services.filter(
    (s) => health?.services[s.id]?.state === "down"
  ).length;

  const feed = [...services].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <AppLayout>
      <PageBand
        eyebrow="Overview"
        title="Dashboard"
        subtitle="Proxy routes, backend reachability and live Traefik runtime at a glance."
        actions={
          <Button className="btn-brand" onClick={() => router.push("/services/add")}>
            <Plus className="h-4 w-4" />
            Add Service
          </Button>
        }
      />

      <PageMain>
        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <Stat
            icon={<Settings />}
            num={services.length}
            label="Services"
            accent
          />
          <Stat icon={<CheckCircle />} num={enabled.length} label="Enabled" />
          <Stat
            icon={<Activity />}
            num={health ? reachable : "—"}
            label="Backends reachable"
            color="var(--success)"
          />
          <Stat
            icon={<AlertTriangle />}
            num={health ? unreachable : "—"}
            label="Backends unreachable"
            color={unreachable > 0 ? "var(--danger)" : undefined}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
          {/* Service health feed */}
          <Panel
            title="Service health"
            icon={<Server className="h-[18px] w-[18px]" />}
            action={
              <NextLink
                href="/services"
                className="text-[13px] font-medium text-[var(--brand)] hover:underline"
              >
                All services →
              </NextLink>
            }
          >
            {loading ? (
              <p className="p-2 text-sm text-muted-foreground">Loading…</p>
            ) : feed.length === 0 ? (
              <div className="px-1 py-8 text-center text-sm text-muted-foreground">
                No services yet.{" "}
                <NextLink href="/services/add" className="text-[var(--brand)] hover:underline">
                  Add one →
                </NextLink>
              </div>
            ) : (
              <div className="flex flex-col">
                {feed.map((s) => {
                  const state =
                    health?.services[s.id]?.state ??
                    (s.enabled ? "unknown" : "na");
                  return (
                    <button
                      key={s.id}
                      onClick={() => router.push(`/services/${s.id}`)}
                      className="flex items-center gap-3 border-b border-[var(--border-soft)] py-2.5 text-left last:border-0 hover:opacity-80"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">
                          {s.name}
                        </span>
                        <span className="block truncate font-mono text-[12px] text-[var(--meta)]">
                          {primaryHostname(s) || targetAddress(s)}
                        </span>
                      </span>
                      <StatusBadge enabled={s.enabled} />
                      <span className="w-[110px] text-right">
                        <HealthChip
                          state={state}
                          label={
                            state === "up"
                              ? "Reachable"
                              : state === "down"
                                ? "Unreachable"
                                : state === "na"
                                  ? "—"
                                  : "Checking"
                          }
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Right rail */}
          <div className="flex flex-col gap-4">
            <Panel
              title="Traefik runtime"
              icon={<Network className="h-[18px] w-[18px]" />}
            >
              <TraefikRuntimeSummary runtime={runtime} />
            </Panel>

            <div className="grid grid-cols-2 gap-3">
              <Launch
                href="/runtime"
                icon={<Network />}
                title="Runtime"
                desc="Live routers & services"
              />
              <Launch
                href="/domains"
                icon={<Globe />}
                title="Domains"
                desc="Base domains & certs"
              />
              <Launch
                href="/security"
                icon={<Shield />}
                title="Security"
                desc="Auth configs"
              />
              <Launch
                href="/sessions"
                icon={<Users2 />}
                title="Sessions"
                desc="Active sessions"
              />
            </div>
          </div>
        </div>
      </PageMain>
    </AppLayout>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────────── */

function Stat({
  icon,
  num,
  label,
  accent,
  color,
}: {
  icon: React.ReactNode;
  num: React.ReactNode;
  label: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div className={`stat ${accent ? "accent" : ""}`}>
      <div className="ico [&_svg]:h-[19px] [&_svg]:w-[19px]">{icon}</div>
      <div className="num" style={color ? { color } : undefined}>
        {num}
      </div>
      <div className="mt-1.5 text-[13px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border bg-card shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-3 border-b border-[var(--border-soft)] px-[18px] py-4">
        {icon && <span className="text-[var(--brand)]">{icon}</span>}
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="px-[18px] py-3">{children}</div>
    </div>
  );
}

function Launch({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <NextLink href={href} className="launch">
      <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-[var(--meta)]" />
      <div className="ico [&_svg]:h-[20px] [&_svg]:w-[20px]">{icon}</div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{desc}</p>
    </NextLink>
  );
}

function TraefikRuntimeSummary({
  runtime,
}: {
  runtime: ReturnType<typeof useTraefikRuntime>["runtime"];
}) {
  if (!runtime) {
    return <p className="py-2 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!runtime.configured) {
    return (
      <div className="callout info my-1">
        <AlertTriangle className="ico" />
        <div>
          <h4 className="text-[13.5px] font-semibold">Traefik API not configured</h4>
          <p className="text-[13px] text-[var(--fg-2)]">
            Set <span className="mono">TRAEFIK_API_URL</span> to surface backend
            health and the live runtime.
          </p>
        </div>
      </div>
    );
  }
  if (!runtime.reachable) {
    return (
      <div className="callout warn my-1">
        <AlertTriangle className="ico" />
        <div>
          <h4 className="text-[13.5px] font-semibold">Traefik API unreachable</h4>
          <p className="text-[13px] text-[var(--fg-2)]">
            Configured, but the API didn&rsquo;t respond. Health falls back to
            direct probes.
          </p>
        </div>
      </div>
    );
  }
  const c = runtime.counts;
  const rows: [string, React.ReactNode][] = [
    ["Version", <span key="v" className="mono">{runtime.version?.version || "—"}</span>],
    ["Entrypoints", <span key="e" className="mono">{runtime.entrypoints.map((e) => e.name).join(", ") || "—"}</span>],
    ["HTTP routers", <span key="r" className="mono">{c.httpRouters}</span>],
    ["HTTP services", <span key="s" className="mono">{c.httpServices}</span>],
    ["Middlewares", <span key="m" className="mono">{c.middlewares}</span>],
  ];
  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center gap-2">
        <HealthChip state="up" label="Connected" />
      </div>
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="flex items-center justify-between gap-4 border-b border-[var(--border-soft)] py-2 text-[13px] last:border-0"
        >
          <span className="text-muted-foreground">{k}</span>
          {v}
        </div>
      ))}
      <NextLink
        href="/runtime"
        className="mt-2 text-[13px] font-medium text-[var(--brand)] hover:underline"
      >
        Open runtime explorer →
      </NextLink>
    </div>
  );
}
