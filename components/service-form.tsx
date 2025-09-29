"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { DurationSelect } from "@/components/duration-select";
import { X, Save, AlertCircle } from "lucide-react";
import { useServiceForm, type ServiceFormData } from "@/hooks/use-service-form";
import { useServiceHeaders } from "@/hooks/use-service-headers";
import { useDomains } from "@/lib/hooks/use-domains";
import type { Service } from "./service-table";

interface ServiceFormProps {
  service: Service | null;
  defaultDuration?: number;
  onSubmit: (data: ServiceFormData) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}

export function ServiceForm({
  service,
  defaultDuration,
  onSubmit,
  onCancel,
  submitting = false,
}: ServiceFormProps) {

  // Use custom hooks for form management
  const { formData, updateFormData, hasUnsavedChanges } = useServiceForm({
    service,
    defaultDuration,
  });

  const { middlewareText, setMiddlewareText, hostHeader, setHostHeader } = useServiceHeaders({
    formData,
    updateFormData,
  });

  const { domains, fetchDomains } = useDomains();

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // Set default domain if no domain is selected and we have domains
  useEffect(() => {
    if (!formData.domainId && domains.length > 0 && !service) {
      const defaultDomain = domains.find(d => d.isDefault) || domains[0];
      if (defaultDomain) {
        updateFormData({ domainId: defaultDomain.id });
      }
    }
  }, [domains, formData.domainId, service, updateFormData]);

  // Get the currently selected domain for display
  const selectedDomain = domains.find(d => d.id === formData.domainId);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
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
                <Label htmlFor="domain">Domain</Label>
                <Select
                  value={formData.domainId || ""}
                  onValueChange={(value) => {
                    // Ignore empty string changes - spurious event from Select component
                    if (value === "") {
                      return;
                    }
                    updateFormData({ domainId: value });
                  }}
                  disabled={submitting || domains.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {domains.map((domain) => (
                      <SelectItem key={domain.id} value={domain.id}>
                        {domain.name} ({domain.domain})
                        {domain.isDefault && " - Default"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hostnameMode">Hostname Mode</Label>
                <Select
                  value={formData.hostnameMode || "subdomain"}
                  onValueChange={(value: "subdomain" | "apex" | "custom") => {
                    updateFormData({
                      hostnameMode: value,
                      // Clear subdomain when switching to apex or custom mode
                      ...(value !== "subdomain" && { subdomain: undefined }),
                      // Clear custom hostnames when switching away from custom mode
                      ...(value !== "custom" && { customHostnames: undefined }),
                    });
                  }}
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select hostname mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subdomain">Subdomain</SelectItem>
                    <SelectItem value="apex">Apex Domain</SelectItem>
                    <SelectItem value="custom">Custom Hostnames</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {formData.hostnameMode === "subdomain" && "Service will be accessible at [subdomain]." + (selectedDomain?.domain || "domain.com")}
                  {formData.hostnameMode === "apex" && "Service will be accessible at " + (selectedDomain?.domain || "domain.com")}
                  {formData.hostnameMode === "custom" && "Service will be accessible at custom hostnames you specify"}
                </p>
              </div>

              {formData.hostnameMode === "subdomain" && (
                <div className="space-y-2">
                  <Label htmlFor="subdomain">Subdomain</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="subdomain"
                      value={formData.subdomain || ""}
                      onChange={(e) => updateFormData({ subdomain: e.target.value })}
                      placeholder="myservice"
                      required
                      disabled={submitting}
                    />
                    <span className="text-sm text-gray-500">
                      .{selectedDomain?.domain || "domain.com"}
                    </span>
                  </div>
                </div>
              )}

              {formData.hostnameMode === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="customHostnames">Custom Hostnames</Label>
                  <Textarea
                    id="customHostnames"
                    value={(() => {
                      try {
                        return formData.customHostnames
                          ? JSON.parse(formData.customHostnames).join('\n')
                          : "";
                      } catch (error) {
                        console.warn("Failed to parse custom hostnames:", error);
                        return formData.customHostnames || "";
                      }
                    })()}
                    onChange={(e) => {
                      const hostnames = e.target.value
                        .split('\n')
                        .map(h => h.trim())
                        .filter(h => h.length > 0);
                      updateFormData({
                        customHostnames: hostnames.length > 0 ? JSON.stringify(hostnames) : null
                      });
                    }}
                    placeholder="app.example.com&#10;api.example.com&#10;www.example.com"
                    rows={4}
                    disabled={submitting}
                  />
                  <p className="text-xs text-gray-500">
                    Enter one hostname per line. These hostnames will be used as-is for routing.
                  </p>
                </div>
              )}

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

              <div className="space-y-2">
                <Label htmlFor="entrypoint">Entrypoint (optional)</Label>
                <Input
                  id="entrypoint"
                  value={formData.entrypoint || ""}
                  onChange={(e) => updateFormData({ entrypoint: e.target.value || null })}
                  placeholder="websecure"
                  disabled={submitting}
                />
                <p className="text-xs text-gray-500">
                  Override the default entrypoint for this service
                </p>
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

              {formData.isHttps && (
                <div className="flex items-center space-x-2">
                  <Switch
                    id="insecureSkipVerify"
                    checked={formData.insecureSkipVerify}
                    onCheckedChange={(checked) => updateFormData({ insecureSkipVerify: checked })}
                    disabled={submitting}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="insecureSkipVerify">Skip TLS Certificate Validation</Label>
                    <p className="text-xs text-gray-500">
                      Enable for services with self-signed or invalid certificates
                    </p>
                  </div>
                </div>
              )}

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