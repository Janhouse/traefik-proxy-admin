"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Section } from "@/components/form-section";
import { ManagedStaticSection } from "@/components/managed/managed-static-section";
import { EntrypointSelect } from "@/components/traefik/entrypoint-select";
import { MiddlewareSelect } from "@/components/traefik/middleware-select";
import { DURATION_PRESETS } from "@/lib/duration-presets";
import { GlobalConfig } from "@/lib/hooks/use-config";

interface ConfigFormProps {
  config: GlobalConfig;
  onConfigChange: (config: GlobalConfig) => void;
}

export function ConfigForm({ config, onConfigChange }: ConfigFormProps) {
  return (
    <div>
      <Section
        n={1}
        title="Panel & defaults"
        desc={
          <>
            Where this panel lives and what new services start with. Domains
            and certificates are managed per-domain on the{" "}
            <a
              href="/domains"
              className="text-[var(--info)] underline hover:text-foreground transition-colors"
            >
              Domains page
            </a>
            .
          </>
        }
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminPanelDomain">Admin Panel Domain</Label>
            <Input
              id="adminPanelDomain"
              placeholder="admin.example.com or localhost:3000"
              value={config.adminPanelDomain}
              onChange={(e) =>
                onConfigChange({ ...config, adminPanelDomain: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Domain where this admin panel is accessible (used in forward-auth
              and Traefik configuration examples)
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="defaultDuration">Default Service Duration</Label>
            <Select
              value={config.defaultEnableDurationMinutes?.toString() || "null"}
              onValueChange={(value) => {
                // Ignore spurious empty-string events from the Select component
                if (value === "") return;
                const duration = value === "null" ? null : parseInt(value);
                onConfigChange({
                  ...config,
                  defaultEnableDurationMinutes: Number.isNaN(duration as number)
                    ? null
                    : duration,
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_PRESETS.map((preset) => (
                  <SelectItem key={preset.value?.toString() || "null"} value={preset.value?.toString() || "null"}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Default duration for new services before auto-disable
            </p>
          </div>
        </div>
      </Section>

      <Section
        n={2}
        title="Default entrypoints"
        desc="Entrypoints used when a service has none selected."
      >
        <EntrypointSelect
          value={config.defaultEntrypoints}
          onChange={(eps) =>
            onConfigChange({ ...config, defaultEntrypoints: eps })
          }
          helpText="Services without explicit entrypoints get one router per default; cert-trigger routers bind to the TLS ones."
        />
      </Section>

      <Section
        n={3}
        title="Global middlewares"
        desc="Applied to every service, in order, before service-specific middlewares."
      >
        <div className="flex flex-col gap-1.5">
          <MiddlewareSelect
            value={config.globalMiddlewares}
            onChange={(names) =>
              onConfigChange({ ...config, globalMiddlewares: names })
            }
          />
          <p className="text-xs text-muted-foreground">
            Pick middlewares discovered from the Traefik API — same selector as
            on the service form.
          </p>
        </div>
      </Section>

      {/* Renders nothing unless TRAEFIK_MANAGED is on (has its own Save). */}
      <ManagedStaticSection />
    </div>
  );
}
