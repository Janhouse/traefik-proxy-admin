"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <div className="space-y-6">
      {/* Domain & Certificate Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Domain &amp; Certificate Settings</CardTitle>
          <CardDescription>
            Configure the base domain and certificate resolver for all services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm text-[var(--fg-2)] bg-[var(--info-soft)] border border-[color-mix(in_oklab,var(--info)_28%,transparent)] p-3 rounded-[var(--radius-md)]">
                <strong className="text-foreground">Domain &amp; Certificate Settings</strong> are now managed individually in the{" "}
                <a
                  href="/domains"
                  className="text-[var(--info)] underline hover:text-foreground transition-colors"
                >
                  Domains page
                </a>
                . Each domain can have its own certificate resolver and wildcard certificate settings.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Default Entrypoints</Label>
              <EntrypointSelect
                value={config.defaultEntrypoints}
                onChange={(eps) =>
                  onConfigChange({ ...config, defaultEntrypoints: eps })
                }
                helpText="Used when a service has no entrypoints selected; cert-trigger routers bind to the TLS ones."
              />
            </div>
            <div className="space-y-2">
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
            <div className="space-y-2 md:col-span-2">
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
                Domain where this admin panel is accessible (used in Traefik configuration examples)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Global Middlewares */}
      <Card>
        <CardHeader>
          <CardTitle>Global Middlewares</CardTitle>
          <CardDescription>
            Middlewares applied to every service, before service-specific ones
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="middlewares">Apply middlewares</Label>
            <MiddlewareSelect
              value={config.globalMiddlewares}
              onChange={(names) =>
                onConfigChange({ ...config, globalMiddlewares: names })
              }
            />
            <p className="text-xs text-muted-foreground">
              Pick middlewares discovered from the Traefik API — same selector
              as on the service form. Applied in order before service-specific
              middlewares.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Preview</CardTitle>
          <CardDescription>
            Preview of how your configuration will be applied
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="code">
            <div className="code-head">
              <span className="code-glyph">&lt;&gt;</span>
              <span className="fname">preview</span>
            </div>
            <pre>{`Example service configuration:
Domain: myservice.[configured-domain]
Certificate: [per-domain cert resolver]${config.defaultEntrypoints.length ? `\nEntrypoints: ${config.defaultEntrypoints.join(', ')}` : ''}
Middlewares: [${config.globalMiddlewares.join(', ')}] + auth + service-specific

Note: Domains and certificates are now configured individually in the Domains page.
Each domain can have its own certificate resolver and wildcard settings.`}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
