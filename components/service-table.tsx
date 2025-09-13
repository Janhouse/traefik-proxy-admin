"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Plus,
  Power,
  PowerOff,
  Edit,
  Trash2,
  Shield,
  ExternalLink,
  Clock,
  Copy,
  Link,
  Users,
  Key,
} from "lucide-react";
import { ServiceCountdown } from "@/components/service-countdown";
import { ConfirmDialog } from "@/components/confirm-dialog";

export interface Service {
  id: string;
  name: string;
  subdomain: string;
  targetIp: string;
  targetPort: number;
  isHttps: boolean;
  enabled: boolean;
  enabledAt?: string | null;
  enableDurationMinutes?: number | null;
  middlewares?: string;
  requestHeaders?: string;
  createdAt: string;
  updatedAt: string;
  // Security configuration indicators
  hasSharedLink?: boolean;
  hasSso?: boolean;
  hasBasicAuth?: boolean;
  basicAuthCount?: number;
}

interface ServiceTableProps {
  services: Service[];
  loading: boolean;
  baseDomain: string;
  onAddNew: () => void;
  onEdit: (service: Service) => void;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onManageSecurity: (service: Service) => void;
  onGenerateShareLink?: (serviceId: string) => Promise<void>;
  onRefresh: () => void;
}

export function ServiceTable({
  services,
  loading,
  baseDomain,
  onAddNew,
  onEdit,
  onDelete,
  onToggle,
  onManageSecurity,
  onGenerateShareLink,
  onRefresh,
}: ServiceTableProps) {
  const [deletingService, setDeletingService] = useState<string | null>(null);
  const [togglingService, setTogglingService] = useState<string | null>(null);

  const formatDurationForButton = (durationMinutes: number | null | undefined): string => {
    if (!durationMinutes) return "∞";

    if (durationMinutes < 60) {
      return `${durationMinutes}min`;
    } else if (durationMinutes < 1440) {
      const hours = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      return mins > 0 ? `${hours}h${mins}min` : `${hours}h`;
    } else {
      const days = Math.floor(durationMinutes / 1440);
      const hours = Math.floor((durationMinutes % 1440) / 60);
      const mins = durationMinutes % 60;

      let result = `${days}d`;
      if (hours > 0) result += `${hours}h`;
      if (mins > 0) result += `${mins}min`;

      return result;
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingService(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingService(null);
    }
  };

  const handleToggle = async (id: string) => {
    setTogglingService(id);
    try {
      await onToggle(id);
    } finally {
      setTogglingService(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Services
          </CardTitle>
          <CardDescription>Loading services...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Services
            </CardTitle>
            <CardDescription>
              Manage your Traefik proxy services
            </CardDescription>
          </div>
          <Button onClick={onAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            Add Service
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {services.length === 0 ? (
          <div className="text-center py-8">
            <Settings className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No services found
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Get started by creating your first service.
            </p>
            <Button onClick={onAddNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Service
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {services
              .sort((a, b) => {
                // Sort enabled services first
                if (a.enabled && !b.enabled) return -1;
                if (!a.enabled && b.enabled) return 1;
                return a.name.localeCompare(b.name);
              })
              .map((service) => (
              <div
                key={service.id}
                className={`border rounded-lg p-4 transition-opacity ${
                  service.enabled ? "" : "opacity-50 bg-gray-50 dark:bg-gray-800/50"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{service.name}</h3>
                      <Badge variant={service.enabled ? "default" : "secondary"}>
                        {service.enabled ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {service.isHttps && (
                        <Badge variant="outline" className="text-green-600">
                          HTTPS
                        </Badge>
                      )}
                      {/* Security indicators */}
                      {service.hasSharedLink && (
                        <Badge
                          variant="outline"
                          className="text-blue-600 px-1 py-0"
                          title="Shared Link Authentication"
                        >
                          <Link className="h-3 w-3" />
                        </Badge>
                      )}
                      {service.hasSso && (
                        <Badge
                          variant="outline"
                          className="text-purple-600 px-1 py-0"
                          title="Single Sign-On (SSO) Authentication"
                        >
                          <Users className="h-3 w-3" />
                        </Badge>
                      )}
                      {service.hasBasicAuth && (
                        <Badge
                          variant="outline"
                          className="text-orange-600 px-1 py-0"
                          title={`Basic Authentication${service.basicAuthCount && service.basicAuthCount > 1 ? ` (${service.basicAuthCount} configs)` : ''}`}
                        >
                          <Key className="h-3 w-3" />
                          {service.basicAuthCount && service.basicAuthCount > 1 && (
                            <span className="ml-1 text-xs">{service.basicAuthCount}</span>
                          )}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {service.hasSharedLink && onGenerateShareLink && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onGenerateShareLink(service.id)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy Link
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onManageSecurity(service)}
                    >
                      <Shield className="h-4 w-4 mr-1" />
                      Security
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(service)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggle(service.id)}
                      disabled={togglingService === service.id}
                      className={
                        service.enabled
                          ? "text-red-600 hover:text-red-700"
                          : "text-green-600 hover:text-green-700"
                      }
                    >
                      {service.enabled ? (
                        <PowerOff className="h-4 w-4 mr-1" />
                      ) : (
                        <Power className="h-4 w-4 mr-1" />
                      )}
                      {service.enabled ? "Disable" : "Enable"}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deletingService === service.id}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
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

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div>
                    <label className="text-gray-500 dark:text-gray-400">URL</label>
                    <div className="flex items-center gap-1">
                      <span className="font-mono">
                        {service.subdomain}.{baseDomain}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-1"
                        onClick={() => window.open(`https://${service.subdomain}.${baseDomain}`, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-gray-500 dark:text-gray-400">Target</label>
                    <p className="font-mono">
                      {service.targetIp}:{service.targetPort}
                    </p>
                  </div>

                  <div>
                    <label className="text-gray-500 dark:text-gray-400">Auto Duration</label>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-gray-400" />
                      <span>{formatDurationForButton(service.enableDurationMinutes)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-gray-500 dark:text-gray-400">Status</label>
                    {service.enabled && service.enabledAt && service.enableDurationMinutes ? (
                      <ServiceCountdown
                        enabledAt={service.enabledAt}
                        durationMinutes={service.enableDurationMinutes}
                        enabled={service.enabled}
                        onExpired={onRefresh}
                      />
                    ) : service.enabled ? (
                      <p className="text-green-600">Running</p>
                    ) : (
                      <p className="text-gray-500">Stopped</p>
                    )}
                  </div>
                </div>

                {service.middlewares && (
                  <div className="mt-3 pt-3 border-t">
                    <label className="text-gray-500 dark:text-gray-400 text-xs">Middlewares</label>
                    <p className="text-xs font-mono text-gray-600 dark:text-gray-300">
                      {service.middlewares}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}