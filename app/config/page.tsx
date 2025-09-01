"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import Link from "next/link";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DURATION_PRESETS } from "@/lib/duration-presets";

interface GlobalConfig {
  baseDomain: string;
  certResolver: string;
  globalMiddlewares: string[];
  adminPanelDomain: string;
  defaultEntrypoint?: string;
  defaultEnableDurationMinutes?: number | null;
}

export default function ConfigPage() {
  const [config, setConfig] = useState<GlobalConfig>({
    baseDomain: "",
    certResolver: "",
    globalMiddlewares: [],
    adminPanelDomain: "localhost:3000",
    defaultEnableDurationMinutes: 720,
  });
  const [originalConfig, setOriginalConfig] = useState<GlobalConfig>({
    baseDomain: "",
    certResolver: "",
    globalMiddlewares: [],
    adminPanelDomain: "localhost:3000",
    defaultEnableDurationMinutes: 720,
  });
  const [middlewareText, setMiddlewareText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const hasUnsavedChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const data = await response.json();
        // Ensure all fields have values to prevent controlled/uncontrolled input issues
        const fullConfig = {
          baseDomain: data.baseDomain || "",
          certResolver: data.certResolver || "",
          globalMiddlewares: Array.isArray(data.globalMiddlewares) ? data.globalMiddlewares : [],
          adminPanelDomain: data.adminPanelDomain || "localhost:3000",
          defaultEntrypoint: data.defaultEntrypoint || "",
          defaultEnableDurationMinutes: data.defaultEnableDurationMinutes ?? 720,
        };
        setConfig(fullConfig);
        setOriginalConfig(fullConfig);
        setMiddlewareText(fullConfig.globalMiddlewares.join("\n"));
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const middlewares = middlewareText
        .split("\n")
        .map((m) => m.trim())
        .filter((m) => m.length > 0);

      const configToSave = {
        ...config,
        globalMiddlewares: middlewares,
      };

      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configToSave),
      });

      if (response.ok) {
        const updatedConfig = await response.json();
        // Ensure all fields are properly set
        const safeConfig = {
          baseDomain: updatedConfig.baseDomain || "",
          certResolver: updatedConfig.certResolver || "",
          globalMiddlewares: Array.isArray(updatedConfig.globalMiddlewares) ? updatedConfig.globalMiddlewares : [],
          adminPanelDomain: updatedConfig.adminPanelDomain || "localhost:3000",
          defaultEntrypoint: updatedConfig.defaultEntrypoint || "",
          defaultEnableDurationMinutes: updatedConfig.defaultEnableDurationMinutes ?? 720,
        };
        setConfig(safeConfig);
        setOriginalConfig(safeConfig);
        setMiddlewareText(safeConfig.globalMiddlewares.join("\n"));
      } else {
        console.error("Failed to save config:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("Error saving config:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setConfig(originalConfig);
    setMiddlewareText(originalConfig.globalMiddlewares.join("\n"));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedChanges} onDiscard={handleDiscard}>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Services
                </Link>
              </Button>
            </UnsavedChangesGuard>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Global Configuration</h1>
              <p className="text-muted-foreground">
                Configure global settings for Traefik and SSL certificates
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {hasUnsavedChanges && (
              <Button variant="outline" onClick={handleDiscard}>
                Discard Changes
              </Button>
            )}
            <Button onClick={handleSave} disabled={isSaving || !hasUnsavedChanges}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>

        {/* Configuration Form */}
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
                <Label htmlFor="baseDomain">Base Domain</Label>
                <Input
                  id="baseDomain"
                  placeholder="exposed.example.com"
                  value={config.baseDomain}
                  onChange={(e) =>
                    setConfig({ ...config, baseDomain: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Services will be accessible as subdomain.basedomain
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="certResolver">Certificate Resolver</Label>
                <Input
                  id="certResolver"
                  placeholder="letsencrypt-dns"
                  value={config.certResolver}
                  onChange={(e) =>
                    setConfig({ ...config, certResolver: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Traefik certificate resolver name for SSL certificates
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultEntrypoint">Default Entrypoint</Label>
                <Input
                  id="defaultEntrypoint"
                  placeholder="websecure (optional)"
                  value={config.defaultEntrypoint || ""}
                  onChange={(e) =>
                    setConfig({ ...config, defaultEntrypoint: e.target.value })
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
                    setConfig({ ...config, defaultEnableDurationMinutes: duration });
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
                    setConfig({ ...config, adminPanelDomain: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Domain where this admin panel is accessible (used in Traefik configuration examples)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
                onChange={(e) => setMiddlewareText(e.target.value)}
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
Domain: myservice.${config.baseDomain || 'example.com'}
Certificate: ${config.certResolver || 'letsencrypt-dns'}${config.defaultEntrypoint ? `\nEntrypoint: ${config.defaultEntrypoint}` : ''}
Middlewares: [${middlewareText.split('\n').filter(m => m.trim()).join(', ')}] + auth + service-specific
Wildcard Certificate: Both ${config.baseDomain || 'example.com'} and *.${config.baseDomain || 'example.com'}`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}