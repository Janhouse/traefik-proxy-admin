"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { X, Save, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DURATION_PRESETS } from "@/lib/duration-presets";
import type { Service } from "./service-table";

type ServiceFormData = Omit<Service, "id" | "createdAt" | "updatedAt">;

interface ServiceFormProps {
  service: Service | null;
  baseDomain: string;
  defaultDuration?: number;
  onSubmit: (data: ServiceFormData) => Promise<void>;
  onCancel: () => void;
}

export function ServiceForm({
  service,
  baseDomain,
  defaultDuration,
  onSubmit,
  onCancel,
}: ServiceFormProps) {
  const defaultFormData: ServiceFormData = {
    name: "",
    subdomain: "",
    targetIp: "",
    targetPort: 80,
    isHttps: true,
    enabled: true,
    enabledAt: null,
    enableDurationMinutes: defaultDuration || null,
    middlewares: "",
    requestHeaders: "",
  };

  const [formData, setFormData] = useState<ServiceFormData>(defaultFormData);
  const [originalFormData, setOriginalFormData] = useState<ServiceFormData>(defaultFormData);
  const [middlewareText, setMiddlewareText] = useState("");
  const [hostHeader, setHostHeader] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Initialize form when service prop changes
  useEffect(() => {
    if (service) {
      const serviceData: ServiceFormData = {
        name: service.name,
        subdomain: service.subdomain,
        targetIp: service.targetIp,
        targetPort: service.targetPort,
        isHttps: service.isHttps,
        enabled: service.enabled,
        enabledAt: service.enabledAt,
        enableDurationMinutes: service.enableDurationMinutes,
        middlewares: service.middlewares || "",
        requestHeaders: service.requestHeaders || "",
      };
      setFormData(serviceData);
      setOriginalFormData(serviceData);
      setMiddlewareText(service.middlewares || "");

      // Parse existing request headers to extract Host header
      let existingHostHeader = "";
      if (service.requestHeaders) {
        try {
          const headers = JSON.parse(service.requestHeaders);
          existingHostHeader = headers.Host || "";
        } catch (e) {
          // If parsing fails, treat as empty
        }
      }
      setHostHeader(existingHostHeader);
    } else {
      setFormData(defaultFormData);
      setOriginalFormData(defaultFormData);
      setMiddlewareText("");
      setHostHeader("");
    }
  }, [service, defaultDuration]);

  // Update middlewares when text changes
  useEffect(() => {
    const processedMiddlewares = middlewareText
      .split(",")
      .map(m => m.trim())
      .filter(m => m.length > 0)
      .join(",");

    setFormData(prev => ({
      ...prev,
      middlewares: processedMiddlewares
    }));
  }, [middlewareText]);

  // Update request headers when Host header changes
  useEffect(() => {
    const headers: Record<string, string> = {};

    // Add Host header if provided
    if (hostHeader.trim()) {
      headers.Host = hostHeader.trim();
    }

    // Convert to JSON string
    const headersJson = Object.keys(headers).length > 0 ? JSON.stringify(headers) : "";

    setFormData(prev => ({
      ...prev,
      requestHeaders: headersJson
    }));
  }, [hostHeader]);

  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(originalFormData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm("You have unsaved changes. Are you sure you want to cancel?");
      if (!confirmed) return;
    }
    onCancel();
  };

  return (
    <UnsavedChangesGuard
      hasUnsavedChanges={hasUnsavedChanges}
      onDiscard={onCancel}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {service ? "Edit Service" : "Add New Service"}
              </CardTitle>
              <CardDescription>
                {service
                  ? "Update service configuration"
                  : "Configure a new proxy service"
                }
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={submitting}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Service Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Service"
                  required
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subdomain">Subdomain</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="subdomain"
                    value={formData.subdomain}
                    onChange={(e) => setFormData({ ...formData, subdomain: e.target.value })}
                    placeholder="myservice"
                    required
                    disabled={submitting}
                  />
                  <span className="text-sm text-gray-500">.{baseDomain}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetIp">Target IP</Label>
                <Input
                  id="targetIp"
                  value={formData.targetIp}
                  onChange={(e) => setFormData({ ...formData, targetIp: e.target.value })}
                  placeholder="192.168.1.100"
                  required
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetPort">Target Port</Label>
                <Input
                  id="targetPort"
                  type="number"
                  value={formData.targetPort}
                  onChange={(e) => setFormData({ ...formData, targetPort: parseInt(e.target.value) || 80 })}
                  placeholder="80"
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="isHttps"
                  checked={formData.isHttps}
                  onCheckedChange={(checked) => setFormData({ ...formData, isHttps: checked })}
                  disabled={submitting}
                />
                <Label htmlFor="isHttps">Target uses HTTPS</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  disabled={submitting}
                />
                <Label htmlFor="enabled">Enable service</Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Auto-disable Duration</Label>
                <Select
                  value={formData.enableDurationMinutes?.toString() || "null"}
                  onValueChange={(value) => {
                    const duration = value === "null" ? null : parseInt(value);
                    setFormData({ ...formData, enableDurationMinutes: duration });
                  }}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_PRESETS.map((preset) => (
                      <SelectItem key={preset.value?.toString() || "null"} value={preset.value?.toString() || "null"}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Service will automatically disable after this duration.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="middlewares">Middlewares (comma-separated)</Label>
                <Input
                  id="middlewares"
                  value={middlewareText}
                  onChange={(e) => setMiddlewareText(e.target.value)}
                  placeholder="auth@file, ratelimit@file"
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500">
                  Optional Traefik middlewares to apply to this service
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hostHeader">Host Header Override</Label>
                <Input
                  id="hostHeader"
                  value={hostHeader}
                  onChange={(e) => setHostHeader(e.target.value)}
                  placeholder="internal-service.local"
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500">
                  Override the Host header sent to the target service
                </p>
              </div>
            </div>

            {hasUnsavedChanges && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  You have unsaved changes
                </span>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                <Save className="mr-2 h-4 w-4" />
                {submitting ? "Saving..." : service ? "Update Service" : "Create Service"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </UnsavedChangesGuard>
  );
}