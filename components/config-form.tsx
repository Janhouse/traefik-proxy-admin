"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DURATION_PRESETS } from "@/lib/duration-presets";
import { GlobalConfig } from "@/lib/hooks/use-config";

interface ConfigFormProps {
  config: GlobalConfig;
  onConfigChange: (config: GlobalConfig) => void;
  middlewareText: string;
  onMiddlewareTextChange: (text: string) => void;
}

export function ConfigForm({
  config,
  onConfigChange,
  middlewareText,
  onMiddlewareTextChange
}: ConfigFormProps) {
  return (
    <div className="space-y-6">
      {/* Domain & Certificate Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Domain & Certificate Settings</CardTitle>
          <CardDescription>
            Configure the base domain and certificate resolver for all services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                <strong>Domain & Certificate Settings</strong> are now managed individually in the <a href="/domains" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline">Domains page</a>.
                Each domain can have its own certificate resolver and wildcard certificate settings.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultEntrypoint">Default Entrypoint</Label>
              <Input
                id="defaultEntrypoint"
                placeholder="websecure (optional)"
                value={config.defaultEntrypoint || ""}
                onChange={(e) =>
                  onConfigChange({ ...config, defaultEntrypoint: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Default Traefik entrypoint for all services (optional)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultDuration">Default Service Duration</Label>
              <Select
                value={config.defaultEnableDurationMinutes?.toString() || "null"}
                onValueChange={(value) => {
                  const duration = value === "null" ? null : parseInt(value);
                  onConfigChange({ ...config, defaultEnableDurationMinutes: duration });
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
            Middlewares that will be applied to all services (one per line)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="middlewares">Middleware Names</Label>
            <Textarea
              id="middlewares"
              placeholder={`compression\nsecurity-headers\nrate-limit`}
              value={middlewareText}
              onChange={(e) => onMiddlewareTextChange(e.target.value)}
              className="min-h-[120px]"
            />
            <p className="text-xs text-muted-foreground">
              Enter middleware names, one per line. These will be applied before service-specific middlewares.
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
          <div className="rounded-lg bg-muted p-4">
            <pre className="text-sm">
{`Example service configuration:
Domain: myservice.[configured-domain]
Certificate: [per-domain cert resolver]${config.defaultEntrypoint ? `\nEntrypoint: ${config.defaultEntrypoint}` : ''}
Middlewares: [${middlewareText.split('\n').filter(m => m.trim()).join(', ')}] + auth + service-specific

Note: Domains and certificates are now configured individually in the Domains page.
Each domain can have its own certificate resolver and wildcard settings.`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}