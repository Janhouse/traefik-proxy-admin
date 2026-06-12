"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { Section, FieldCol } from "@/components/form-section";
import { DurationSelect } from "@/components/duration-select";
import { MiddlewareSelect } from "@/components/traefik/middleware-select";
import { RouteRuleEditor } from "@/components/traefik/route-rule-editor";
import { Save } from "lucide-react";
import { useServiceForm, type ServiceFormData } from "@/hooks/use-service-form";
import { useDomains } from "@/lib/hooks/use-domains";
import { parseMiddlewareNames, serviceEntrypoints } from "@/lib/service-display";
import { parseMatchRules, type HostnameMode } from "@/lib/route-rule";
import type { Service } from "./service-table";

interface ServiceFormProps {
  service: Service | null;
  defaultDuration?: number;
  onSubmit: (data: ServiceFormData) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}

function extractHostHeader(requestHeaders?: string | null): string {
  if (!requestHeaders) return "";
  try {
    let headers: unknown = JSON.parse(requestHeaders);
    if (typeof headers === "string") headers = JSON.parse(headers);
    if (headers && typeof headers === "object" && "Host" in headers) {
      return String((headers as Record<string, string>).Host || "");
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function ServiceForm({
  service,
  defaultDuration,
  onSubmit,
  onCancel,
  submitting = false,
}: ServiceFormProps) {
  const { formData, updateFormData, hasUnsavedChanges } = useServiceForm({
    service,
    defaultDuration,
  });
  const { domains, fetchDomains } = useDomains();
  const [hostHeader, setHostHeader] = useState(() =>
    extractHostHeader(service?.requestHeaders)
  );
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const mwNames: string[] = Array.isArray(formData.middlewares)
    ? formData.middlewares
    : parseMiddlewareNames(formData.middlewares ?? "");

  const routeInitial = useMemo(
    () => ({
      domainId: service?.domainId || "",
      subdomain: service?.subdomain || "",
      hostnameMode: (service?.hostnameMode as HostnameMode) || "subdomain",
      customHostnames: service?.customHostnames ?? null,
      entrypoints: service ? serviceEntrypoints(service) : [],
      matchRules: parseMatchRules(service?.matchRules ?? null),
    }),
    [service]
  );

  const handleHostHeader = (value: string) => {
    setHostHeader(value);
    updateFormData({
      requestHeaders: (value.trim()
        ? { Host: value.trim() }
        : "") as unknown as string,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    await onSubmit({ ...formData, middlewares: mwNames });
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      const ok = window.confirm("You have unsaved changes. Discard and leave?");
      if (!ok) return;
    }
    onCancel();
  };

  return (
    <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedChanges}>
      <form onSubmit={handleSubmit} className="mx-auto max-w-[920px]">
        {/* Service name */}
        <div className="mb-7 flex flex-col gap-1.5">
          <Label htmlFor="name">Service Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => updateFormData({ name: e.target.value })}
            placeholder="My Service"
            required
            disabled={submitting}
          />
          <span className="text-[12px] text-[var(--meta)]">
            A human label for this route — used in lists and generated router
            names.
          </span>
        </div>

        {/* 1 — Domain & routing */}
        <Section
          n={1}
          title="Domain & routing"
          desc="Build the match rule — the Host rule composes the public hostname — and pick entrypoints."
        >
          <RouteRuleEditor
            initial={routeInitial}
            domains={domains}
            serviceId={service?.id}
            onChange={(v) => updateFormData(v)}
            onBlockedChange={setBlocked}
            disabled={submitting}
          />
        </Section>

        {/* 2 — Target backend */}
        <Section
          n={2}
          title="Target backend"
          desc="Where Traefik forwards the request."
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            <FieldCol label="Target IP">
              <Input
                className="font-mono"
                value={formData.targetIp}
                onChange={(e) => updateFormData({ targetIp: e.target.value })}
                placeholder="192.168.1.100"
                required
                disabled={submitting}
              />
            </FieldCol>
            <FieldCol label="Target Port">
              <Input
                type="number"
                className="font-mono"
                value={formData.targetPort}
                onChange={(e) =>
                  updateFormData({ targetPort: parseInt(e.target.value) || 80 })
                }
                placeholder="80"
                required
                disabled={submitting}
              />
            </FieldCol>

            <div className="md:col-span-2 flex flex-wrap items-center gap-3.5">
              <label className="flex cursor-pointer items-center gap-2.5">
                <Switch
                  checked={formData.isHttps}
                  onCheckedChange={(c) => updateFormData({ isHttps: c })}
                  disabled={submitting}
                />
                <span className="text-[13.5px] font-semibold">
                  Target uses HTTPS
                </span>
              </label>
              <span className="text-[12px] text-[var(--meta)]">
                Forward to <span className="mono">https://</span> instead of{" "}
                <span className="mono">http://</span> upstream.
              </span>
            </div>

            {formData.isHttps && (
              <div className="md:col-span-2 flex flex-wrap items-center gap-3.5">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <Switch
                    checked={formData.insecureSkipVerify}
                    onCheckedChange={(c) =>
                      updateFormData({ insecureSkipVerify: c })
                    }
                    disabled={submitting}
                  />
                  <span className="text-[13.5px] font-semibold">
                    Skip TLS certificate validation
                  </span>
                </label>
                <span className="text-[12px] text-[var(--meta)]">
                  For self-signed or invalid upstream certificates.
                </span>
              </div>
            )}

            <FieldCol label="Host Header Override (optional)" full>
              <Input
                className="font-mono"
                value={hostHeader}
                onChange={(e) => handleHostHeader(e.target.value)}
                placeholder="internal-service.local"
                disabled={submitting}
              />
              <span className="text-[12px] text-[var(--meta)]">
                Override the Host header sent upstream — useful for
                virtual-hosted backends.
              </span>
            </FieldCol>
          </div>
        </Section>

        {/* 3 — Middlewares */}
        <Section
          n={3}
          title="Middlewares"
          desc="Auth, rate-limit, headers — applied in order."
        >
          <FieldCol label="Apply middlewares" full>
            <MiddlewareSelect
              value={mwNames}
              onChange={(names) => updateFormData({ middlewares: names })}
              disabled={submitting}
            />
            <span className="text-[12px] text-[var(--meta)]">
              Pick middlewares discovered from the Traefik API. The pill shows
              where each is defined.
            </span>
          </FieldCol>
        </Section>

        {/* 4 — Lifecycle & access */}
        <Section
          n={4}
          title="Lifecycle & access"
          desc="Enable state and the auto-disable safety timer."
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            <div className="md:col-span-2 flex flex-wrap items-center gap-3.5">
              <label className="flex cursor-pointer items-center gap-2.5">
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={(c) => updateFormData({ enabled: c })}
                  disabled={submitting}
                />
                <span className="text-[13.5px] font-semibold">
                  Enable service
                </span>
              </label>
              <span className="text-[12px] text-[var(--meta)]">
                When on, this route is pushed to Traefik&rsquo;s dynamic config.
              </span>
            </div>
            <div>
              <DurationSelect
                value={formData.enableDurationMinutes}
                onValueChange={(d) =>
                  updateFormData({ enableDurationMinutes: d })
                }
                disabled={submitting}
              />
            </div>
          </div>
        </Section>

        <div className="mt-7 flex items-center justify-end gap-2.5 border-t pt-[18px]">
          {blocked && (
            <span className="mr-auto text-[12px] text-[var(--danger)]">
              Resolve the routing issues above before saving.
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="btn-brand"
            disabled={submitting || blocked}
          >
            <Save className="h-4 w-4" />
            {submitting
              ? "Saving…"
              : service
                ? "Update Service"
                : "Create Service"}
          </Button>
        </div>
      </form>
    </UnsavedChangesGuard>
  );
}

