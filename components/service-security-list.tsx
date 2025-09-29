"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Shield,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SecurityConfigCard } from "@/components/security-config-card";
import { SecurityConfigDialog } from "@/components/security-config-dialog";
import type { SecurityConfig } from "@/lib/dto/service-security.dto";

type SecurityConfigWithId = SecurityConfig & { id: string };

interface ServiceSecurityListProps {
  serviceId: string;
  serviceName: string;
  className?: string;
}

interface SortableCardProps {
  config: SecurityConfigWithId;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => Promise<void>;
}

function SortableCard({ config, onEdit, onDelete, onToggleEnabled }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id });

  const style = {
    // Only apply transform when actively dragging, and make it more subtle
    transform: isDragging ? CSS.Transform.toString(transform) : undefined,
    transition,
    // Ensure proper z-index when dragging
    zIndex: isDragging ? 1000 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SecurityConfigCard
        config={config}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleEnabled={onToggleEnabled}
        isDragging={isDragging}
        dragHandle={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

export function ServiceSecurityList({ serviceId, serviceName, className }: ServiceSecurityListProps) {
  const [configs, setConfigs] = useState<SecurityConfigWithId[]>([]);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // UI state
  const [showDialog, setShowDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SecurityConfigWithId | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch security configurations
  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/services/${serviceId}/security-configs`);
      if (!response.ok) {
        throw new Error(`Failed to fetch configurations: ${response.status}`);
      }
      const data = await response.json();

      // Sort by priority (highest first)
      const sortedConfigs = data.sort((a: SecurityConfigWithId, b: SecurityConfigWithId) =>
        b.priority - a.priority
      );

      setConfigs(sortedConfigs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch configurations");
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // Auto-hide success messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);


  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setActiveId(null);
      return;
    }

    const oldIndex = configs.findIndex((config) => config.id === active.id);
    const newIndex = configs.findIndex((config) => config.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const reorderedConfigs = arrayMove(configs, oldIndex, newIndex);

      // Update priorities based on new positions
      const updatedConfigs = reorderedConfigs.map((config, index) => ({
        ...config,
        priority: reorderedConfigs.length - index, // Higher index = higher priority
      }));

      setConfigs(updatedConfigs);

      // Save new priorities to backend
      try {
        setSaving(true);
        await Promise.all(
          updatedConfigs.map((config) =>
            fetch(`/api/services/security-configs/${config.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ priority: config.priority }),
            })
          )
        );
        setSuccess("Configuration order updated successfully");
      } catch {
        setError("Failed to save new order");
        // Revert on error
        fetchConfigs();
      } finally {
        setSaving(false);
      }
    }

    setActiveId(null);
  };

  const handleSaveConfig = async (configData: SecurityConfig & { id?: string }) => {
    try {
      setSaving(true);
      setError(null);

      if (configData.id) {
        // Update existing config
        const response = await fetch(`/api/services/security-configs/${configData.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isEnabled: configData.isEnabled,
            priority: configData.priority,
            config: configData.config,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to update configuration: ${response.status}`);
        }
      } else {
        // Create new config
        const response = await fetch(`/api/services/${serviceId}/security-configs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId,
            securityType: configData.type,
            isEnabled: configData.isEnabled,
            priority: configData.priority,
            config: configData.config,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create configuration: ${response.status}`);
        }
      }

      await fetchConfigs();
      setSuccess(configData.id ? "Configuration updated successfully" : "Configuration added successfully");
      setEditingConfig(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
      throw err; // Re-throw to prevent dialog from closing
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/services/security-configs/${configId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Failed to delete configuration: ${response.status}`);
      }

      await fetchConfigs();
      setSuccess("Configuration deleted successfully");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (configId: string, enabled: boolean) => {
    try {
      setError(null);

      const response = await fetch(`/api/services/security-configs/${configId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: enabled }),
      });

      if (!response.ok) {
        throw new Error(`Failed to toggle configuration: ${response.status}`);
      }

      // Update local state immediately for better UX
      setConfigs(prev =>
        prev.map(config =>
          config.id === configId ? { ...config, isEnabled: enabled } : config
        )
      );

      setSuccess(`Configuration ${enabled ? "enabled" : "disabled"} successfully`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to toggle configuration");
    }
  };



  const activeConfig = activeId ? configs.find(config => config.id === activeId) : null;

  // Helper functions to check existing configurations
  const hasSharedLink = configs.some(config => config.type === 'shared_link');
  const hasSso = configs.some(config => config.type === 'sso');
  const basicAuthCount = configs.filter(config => config.type === 'basic_auth').length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Configurations
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage authentication and authorization rules for {serviceName}
          </p>
        </div>

        <Button
          onClick={() => setShowDialog(true)}
          size="sm"
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Configuration
        </Button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">{success}</span>
          </div>
        </div>
      )}

      {/* Configurations List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading configurations...</span>
          </div>
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Shield className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No security configurations</h3>
          <p className="text-muted-foreground mb-4">
            Add your first security configuration to control access to this service.
          </p>
          <Button onClick={() => setShowDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Configuration
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={configs.map(config => config.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {configs.map((config) => (
                <SortableCard
                  key={config.id}
                  config={config}
                  onEdit={() => {
                    setEditingConfig(config);
                    setShowDialog(true);
                  }}
                  onDelete={() => handleDeleteConfig(config.id)}
                  onToggleEnabled={(enabled) => handleToggleEnabled(config.id, enabled)}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeConfig && (
              <div className="rotate-2 opacity-95 shadow-2xl">
                <SecurityConfigCard
                  config={activeConfig}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onToggleEnabled={async () => {}}
                  isDragging
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Add/Edit Configuration Dialog */}
      <SecurityConfigDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) {
            setEditingConfig(null);
          }
        }}
        serviceId={serviceId}
        editingConfig={editingConfig}
        onSave={handleSaveConfig}
        onCancel={() => {
          setShowDialog(false);
          setEditingConfig(null);
        }}
        hasSharedLink={hasSharedLink}
        hasSso={hasSso}
        basicAuthCount={basicAuthCount}
      />
    </div>
  );
}