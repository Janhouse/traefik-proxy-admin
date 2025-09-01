"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Link, Users, Settings, ExternalLink, RefreshCw, FileText, Power } from "lucide-react";
import NextLink from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UnsavedChangesGuard } from "@/components/unsaved-changes-guard";
import { TraefikConfigDialog } from "@/components/traefik-config-dialog";
import { ServiceCountdown } from "@/components/service-countdown";
import { DURATION_PRESETS } from "@/lib/duration-presets";
import { getEffectiveDuration, calculateExpiryTime, isForeverDuration } from "@/lib/duration-utils";

interface Service {
  id: string;
  name: string;
  subdomain: string;
  targetIp: string;
  targetPort: number;
  isHttps: boolean;
  enabled: boolean;
  enabledAt?: string;
  enableDurationMinutes?: number | null;
  authMethod: "none" | "shared_link" | "sso";
  ssoGroups?: string;
  ssoUsers?: string;
  middlewares?: string;
  createdAt: string;
  updatedAt: string;
}


export default function AdminPanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [baseDomain, setBaseDomain] = useState("example.com");
  const [defaultDuration, setDefaultDuration] = useState<number | undefined>(12);

  const defaultService: Omit<Service, "id" | "createdAt" | "updatedAt"> = {
    name: "",
    subdomain: "",
    targetIp: "",
    targetPort: 80,
    isHttps: false,
    enabled: true,
    enableDurationMinutes: undefined, // Will use global default
    authMethod: "none",
    middlewares: "",
  };

  const [formData, setFormData] = useState(defaultService);
  const [originalFormData, setOriginalFormData] = useState(defaultService);
  const [middlewareText, setMiddlewareText] = useState("");
  
  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(originalFormData) || 
    (formData.middlewares !== middlewareText.split('\n').filter(m => m.trim()).join(','));

  // Function to format duration for button display
  const formatDurationForButton = (durationMinutes: number | null | undefined): string => {
    if (durationMinutes === null) return "∞";
    if (durationMinutes === undefined) {
      // Use default duration
      const preset = DURATION_PRESETS.find(p => p.value === defaultDuration);
      return preset ? preset.label.replace(/\s+/g, '').toLowerCase() : "12h";
    }
    
    const preset = DURATION_PRESETS.find(p => p.value === durationMinutes);
    if (preset) {
      return preset.label.replace(/\s+/g, '').toLowerCase();
    }
    
    // Custom duration, format it
    if (durationMinutes < 60) return `${durationMinutes}m`;
    if (durationMinutes < 1440) return `${Math.round(durationMinutes / 60)}h`;
    return `${Math.round(durationMinutes / 1440)}d`;
  };

  const fetchServices = useCallback(async () => {
    try {
      const response = await fetch("/api/services");
      if (response.ok) {
        const data = await response.json();
        setServices(data);
      }
    } catch (error) {
      console.error("Failed to fetch services:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBaseDomain = async () => {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const data = await response.json();
        setBaseDomain(data.baseDomain);
        setDefaultDuration(data.defaultEnableDurationMinutes);
      }
    } catch (error) {
      console.error("Failed to fetch config:", error);
    }
  };

  useEffect(() => {
    fetchServices();
    fetchBaseDomain();
    
    // Set up polling to refresh services every 15 seconds
    // This ensures expired services are automatically disabled in the UI
    const interval = setInterval(() => {
      fetchServices();
    }, 15000);
    
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const middlewares = middlewareText
        .split('\n')
        .map(m => m.trim())
        .filter(m => m.length > 0)
        .join(',');
      
      const dataToSubmit = {
        ...formData,
        middlewares: middlewares || null,
        enableDurationMinutes: formData.enableDurationMinutes === undefined ? defaultDuration : formData.enableDurationMinutes,
      };
      
      const url = editingService ? `/api/services/${editingService.id}` : "/api/services";
      const method = editingService ? "PUT" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToSubmit),
      });

      if (response.ok) {
        await fetchServices();
        handleCloseForm();
      }
    } catch (error) {
      console.error("Failed to save service:", error);
    }
  };
  
  const handleCloseForm = () => {
    setShowForm(false);
    setEditingService(null);
    setFormData(defaultService);
    setOriginalFormData(defaultService);
    setMiddlewareText("");
  };

  const handleEdit = (service: Service) => {
    const serviceData = {
      name: service.name,
      subdomain: service.subdomain,
      targetIp: service.targetIp,
      targetPort: service.targetPort,
      isHttps: service.isHttps,
      enabled: service.enabled,
      enableDurationMinutes: service.enableDurationMinutes,
      authMethod: service.authMethod,
      ssoGroups: service.ssoGroups,
      ssoUsers: service.ssoUsers,
      middlewares: service.middlewares || "",
    };
    
    setEditingService(service);
    setFormData(serviceData);
    setOriginalFormData(serviceData);
    setMiddlewareText((service.middlewares || "").split(',').filter(m => m.trim()).join('\n'));
    setShowForm(true);
  };
  
  const handleAddNew = () => {
    setFormData(defaultService);
    setOriginalFormData(defaultService);
    setMiddlewareText("");
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/services/${id}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        await fetchServices();
      }
    } catch (error) {
      console.error("Failed to delete service:", error);
    }
  };

  const generateShareLink = async (serviceId: string) => {
    try {
      const response = await fetch("/api/services/share-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceId,
          expiresInHours: 24,
          sessionDurationMinutes: 60,
        }),
      });
      
      if (response.ok) {
        const { shareUrl } = await response.json();
        navigator.clipboard.writeText(shareUrl);
      }
    } catch (error) {
      console.error("Failed to generate share link:", error);
    }
  };

  const toggleService = async (serviceId: string) => {
    try {
      const response = await fetch(`/api/services/${serviceId}/toggle`, {
        method: "POST",
      });
      
      if (response.ok) {
        await fetchServices();
      }
    } catch (error) {
      console.error("Failed to toggle service:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Traefik Proxy Admin</h1>
            <p className="text-muted-foreground">
              Manage your dynamic proxy configurations
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ThemeToggle />
            <TraefikConfigDialog
              trigger={
                <Button variant="outline" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Traefik Setup
                </Button>
              }
            />
            <Button variant="outline" asChild>
              <NextLink href="/config" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Global Config
              </NextLink>
            </Button>
            <Button variant="outline" asChild>
              <NextLink href="/sessions" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Sessions
              </NextLink>
            </Button>
            <Button onClick={handleAddNew} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Service
            </Button>
          </div>
        </div>

        {/* Service Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>
                {editingService ? "Edit Service" : "Add New Service"}
              </CardTitle>
              <CardDescription>
                {editingService 
                  ? "Update the service configuration" 
                  : "Create a new proxy service configuration"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Service Name</Label>
                    <Input
                      id="name"
                      placeholder="My Application"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="subdomain">Subdomain</Label>
                    <Input
                      id="subdomain"
                      placeholder="myapp"
                      value={formData.subdomain}
                      onChange={(e) => setFormData({ ...formData, subdomain: e.target.value })}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Will be accessible at {formData.subdomain || 'subdomain'}.{baseDomain}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="targetIp">Target IP</Label>
                    <Input
                      id="targetIp"
                      placeholder="192.168.1.100"
                      value={formData.targetIp}
                      onChange={(e) => setFormData({ ...formData, targetIp: e.target.value })}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="targetPort">Target Port</Label>
                    <Input
                      id="targetPort"
                      type="number"
                      placeholder="8080"
                      value={formData.targetPort}
                      onChange={(e) => setFormData({ ...formData, targetPort: parseInt(e.target.value) || 80 })}
                      required
                    />
                  </div>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="isHttps"
                      checked={formData.isHttps}
                      onCheckedChange={(checked) => setFormData({ ...formData, isHttps: checked })}
                    />
                    <Label htmlFor="isHttps">Target uses HTTPS</Label>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="enabled"
                        checked={formData.enabled}
                        onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                      />
                      <Label htmlFor="enabled">Service enabled</Label>
                    </div>
                    {editingService?.enabled && editingService?.enabledAt && (
                      <div className="text-xs text-muted-foreground">
                        <ServiceCountdown 
                          enabledAt={editingService.enabledAt} 
                          enabled={editingService.enabled}
                          durationMinutes={getEffectiveDuration(formData.enableDurationMinutes, defaultDuration)}
                          onExpired={fetchServices}
                        />
                        {(() => {
                          const effectiveDuration = getEffectiveDuration(formData.enableDurationMinutes, defaultDuration);
                          
                          if (isForeverDuration(effectiveDuration)) {
                            return (
                              <div className="mt-1 text-green-600 dark:text-green-400">
                                Service will remain enabled forever
                              </div>
                            );
                          }
                          
                          const expiryTime = calculateExpiryTime(editingService.enabledAt, effectiveDuration);
                          return expiryTime && (
                            <div className="mt-1">
                              Will auto-disable at: {expiryTime.toLocaleString()}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="enableDuration">Auto-disable Duration</Label>
                  <Select
                    value={formData.enableDurationMinutes === undefined ? "default" : formData.enableDurationMinutes?.toString() || "null"}
                    onValueChange={(value) => {
                      const duration = value === "default" ? undefined : value === "null" ? null : parseInt(value);
                      console.log("Duration selected:", value, "→", duration);
                      setFormData({ ...formData, enableDurationMinutes: duration });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">
                        Use Global Default ({DURATION_PRESETS.find(p => p.value === defaultDuration)?.label || "12 hours"})
                      </SelectItem>
                      {DURATION_PRESETS.map((preset) => (
                        <SelectItem key={preset.value?.toString() || "null"} value={preset.value?.toString() || "null"}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose how long the service stays enabled before auto-disabling.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="authMethod">Authentication Method</Label>
                  <Select
                    value={formData.authMethod}
                    onValueChange={(value) => setFormData({ ...formData, authMethod: value as "none" | "shared_link" | "sso" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Authentication</SelectItem>
                      <SelectItem value="shared_link">Shared Link</SelectItem>
                      <SelectItem value="sso">SSO Authentication</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {formData.authMethod === "sso" && (
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ssoGroups">Allowed Groups (JSON)</Label>
                      <Input
                        id="ssoGroups"
                        value={formData.ssoGroups || ""}
                        onChange={(e) => setFormData({ ...formData, ssoGroups: e.target.value })}
                        placeholder='["group1", "group2"]'
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="ssoUsers">Allowed Users (JSON)</Label>
                      <Input
                        id="ssoUsers"
                        value={formData.ssoUsers || ""}
                        onChange={(e) => setFormData({ ...formData, ssoUsers: e.target.value })}
                        placeholder='["user1", "user2"]'
                      />
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="middlewares">Additional Middlewares</Label>
                  <Textarea
                    id="middlewares"
                    placeholder={`rate-limit\ncors\ncustom-headers`}
                    value={middlewareText}
                    onChange={(e) => setMiddlewareText(e.target.value)}
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter middleware names, one per line. These will be applied after global middlewares.
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <Button type="submit">
                    {editingService ? "Update Service" : "Create Service"}
                  </Button>
                  {hasUnsavedChanges ? (
                    <UnsavedChangesGuard 
                      hasUnsavedChanges={hasUnsavedChanges} 
                      onDiscard={handleCloseForm}
                    >
                      <Button type="button" variant="outline">
                        Cancel
                      </Button>
                    </UnsavedChangesGuard>
                  ) : (
                    <Button type="button" variant="outline" onClick={handleCloseForm}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        )}


        {/* Services List */}
        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
            <CardDescription>
              {services.length === 0 
                ? "No services configured yet. Add your first service to get started."
                : `${services.length} service${services.length === 1 ? '' : 's'} configured`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {services.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Settings className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No services yet</h3>
                <p className="text-muted-foreground mb-4">
                  Add your first service to start proxying traffic through Traefik.
                </p>
                <Button onClick={handleAddNew}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Service
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {services
                  .sort((a, b) => {
                    // Sort enabled services first, then by name
                    if (a.enabled !== b.enabled) {
                      return b.enabled ? 1 : -1;
                    }
                    return a.name.localeCompare(b.name);
                  })
                  .map((service) => (
                  <div 
                    key={service.id} 
                    className={`p-6 ${
                      service.enabled 
                        ? "bg-green-50 dark:bg-green-950/20 border-l-4 border-l-green-500" 
                        : "opacity-60"
                    }`}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{service.name}</h3>
                          <Badge variant={service.enabled ? "default" : "secondary"}>
                            {service.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                          <Badge variant="outline">
                            {service.authMethod === 'none' ? 'Public' : service.authMethod.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <ExternalLink className="h-4 w-4" />
                          <span>{service.subdomain}.{baseDomain}</span>
                          <span>→</span>
                          <span>
                            {service.isHttps ? "https" : "http"}://{service.targetIp}:{service.targetPort}
                          </span>
                        </div>
                        {service.enabledAt && (
                          <ServiceCountdown 
                            enabledAt={service.enabledAt} 
                            enabled={service.enabled}
                            durationMinutes={getEffectiveDuration(service.enableDurationMinutes, defaultDuration)}
                            onExpired={fetchServices}
                          />
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={service.enabled ? "outline" : "default"}
                          size="sm"
                          onClick={() => toggleService(service.id)}
                          className={service.enabled ? "" : "relative overflow-hidden"}
                        >
                          <Power className="mr-2 h-4 w-4" />
                          {service.enabled ? (
                            "Disable"
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>Enable</span>
                              <div className="bg-primary-foreground/20 px-2 py-0.5 rounded-md text-xs font-mono font-bold">
                                {formatDurationForButton(getEffectiveDuration(service.enableDurationMinutes, defaultDuration))}
                              </div>
                            </div>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(service)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        {service.authMethod === "shared_link" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateShareLink(service.id)}
                          >
                            <Link className="mr-2 h-4 w-4" />
                            Share
                          </Button>
                        )}
                        <ConfirmDialog
                          trigger={
                            <Button variant="outline" size="sm">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          }
                          title="Delete Service"
                          description={`Are you sure you want to delete "${service.name}"? This action cannot be undone.`}
                          confirmText="Delete"
                          onConfirm={() => handleDelete(service.id)}
                          variant="destructive"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}