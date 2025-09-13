"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { DurationSelect } from "@/components/duration-select";
import { X, Save, AlertCircle } from "lucide-react";
import { useServiceForm, type ServiceFormData } from "@/hooks/use-service-form";
import { useServiceHeaders } from "@/hooks/use-service-headers";
import type { Service } from "./service-table";

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
  const [submitting, setSubmitting] = useState(false);

  // Use custom hooks for form management
  const { formData, updateFormData, hasUnsavedChanges } = useServiceForm({
    service,
    defaultDuration,
  });

  const { middlewareText, setMiddlewareText, hostHeader, setHostHeader } = useServiceHeaders({
    formData,
    updateFormData,
  });

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
                  onChange={(e) => updateFormData({ name: e.target.value })}
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
                    onChange={(e) => updateFormData({ subdomain: e.target.value })}
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
                  onChange={(e) => updateFormData({ targetIp: e.target.value })}
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
                  onChange={(e) => updateFormData({ targetPort: parseInt(e.target.value) || 80 })}
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
                  onCheckedChange={(checked) => updateFormData({ isHttps: checked })}
                  disabled={submitting}
                />
                <Label htmlFor="isHttps">Target uses HTTPS</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => updateFormData({ enabled: checked })}
                  disabled={submitting}
                />
                <Label htmlFor="enabled">Enable service</Label>
              </div>

              <DurationSelect
                value={formData.enableDurationMinutes}
                onValueChange={(duration) => updateFormData({ enableDurationMinutes: duration })}
                disabled={submitting}
              />

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