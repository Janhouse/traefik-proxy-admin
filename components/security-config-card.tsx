"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Edit,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Clock,
  Users,
  Link,
  Key,
  User,
  UserCheck,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SecurityConfig } from "@/lib/dto/service-security.dto";

interface SecurityConfigCardProps {
  config: SecurityConfig & { id: string };
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => Promise<void>;
  isDragging?: boolean;
  dragHandle?: React.ComponentProps<"div">;
  className?: string;
}

const securityTypeConfig = {
  shared_link: {
    icon: Link,
    label: "Shared Link",
    color: "bg-blue-500",
    description: "Time-limited access links",
  },
  sso: {
    icon: Users,
    label: "SSO",
    color: "bg-green-500",
    description: "Single Sign-On authentication",
  },
  basic_auth: {
    icon: Key,
    label: "Basic Auth",
    color: "bg-orange-500",
    description: "Username and password authentication",
  },
} as const;

function formatDuration(hours: number): string {
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (remainingHours === 0) {
    return `${days}d`;
  }
  return `${days}d ${remainingHours}h`;
}

function formatSessionDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}min`;
}

export function SecurityConfigCard({
  config,
  onEdit,
  onDelete,
  onToggleEnabled,
  isDragging = false,
  dragHandle,
  className,
}: SecurityConfigCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);

  const typeConfig = securityTypeConfig[config.type];
  const Icon = typeConfig.icon;

  const handleToggleEnabled = async (checked: boolean) => {
    setIsTogglingEnabled(true);
    try {
      await onToggleEnabled(checked);
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const renderConfigDetails = () => {
    switch (config.type) {
      case "shared_link":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Link expires:</span>
                <span className="font-medium">
                  {formatDuration(config.config.expiresInHours)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Session duration:</span>
                <span className="font-medium">
                  {formatSessionDuration(config.config.sessionDurationMinutes)}
                </span>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                Users can access this service through time-limited shared links. Each link
                expires after {formatDuration(config.config.expiresInHours)} and grants
                access for {formatSessionDuration(config.config.sessionDurationMinutes)}.
              </p>
            </div>
          </div>
        );

      case "sso":
        const hasGroups = config.config.groups.length > 0;
        const hasUsers = config.config.users.length > 0;

        return (
          <div className="space-y-3">
            {hasGroups && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Allowed Groups ({config.config.groups.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {config.config.groups.map((group) => (
                    <Badge key={group} variant="outline" className="text-xs">
                      {group}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {hasUsers && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Allowed Users ({config.config.users.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {config.config.users.map((user) => (
                    <Badge key={user} variant="outline" className="text-xs">
                      {user}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {!hasGroups && !hasUsers && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm text-yellow-700 dark:text-yellow-300">
                  No groups or users specified. All authenticated users will have access.
                </span>
              </div>
            )}

            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                Users must authenticate through your configured SSO provider
                {hasGroups || hasUsers
                  ? " and be a member of the specified groups or user list."
                  : "."
                }
              </p>
            </div>
          </div>
        );

      case "basic_auth":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Configuration ID:</span>
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                {config.config.basicAuthConfigId}
              </span>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                Users must provide valid username and password credentials
                from the selected basic authentication configuration.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card
      className={cn(
        "transition-all duration-200",
        isDragging && "opacity-50 shadow-lg",
        !config.isEnabled && "opacity-60",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {dragHandle && (
              <div
                {...dragHandle}
                className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded transition-colors"
                aria-label="Drag to reorder"
                style={{ touchAction: 'none' }}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", typeConfig.color, "text-white")}>
                <Icon className="h-4 w-4" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm">{typeConfig.label}</h3>
                  <Badge
                    variant={config.isEnabled ? "default" : "secondary"}
                    className="text-xs"
                  >
                    Priority {config.priority}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {typeConfig.description}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center space-x-2">
              <Switch
                id={`enabled-${config.id}`}
                checked={config.isEnabled}
                onCheckedChange={handleToggleEnabled}
                disabled={isTogglingEnabled}
                aria-label={`${config.isEnabled ? "Disable" : "Enable"} ${typeConfig.label} configuration`}
              />
              <Label
                htmlFor={`enabled-${config.id}`}
                className="text-xs text-muted-foreground cursor-pointer"
              >
                {config.isEnabled ? "Enabled" : "Disabled"}
              </Label>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 h-auto"
              aria-label={isExpanded ? "Collapse details" : "Expand details"}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            {renderConfigDetails()}

            <div className="flex flex-wrap gap-2 pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="flex items-center gap-2"
              >
                <Edit className="h-3 w-3" />
                <span className="hidden sm:inline">Edit</span>
              </Button>

              <ConfirmDialog
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                }
                title="Delete Security Configuration"
                description={`Are you sure you want to delete this ${typeConfig.label.toLowerCase()} configuration? This action cannot be undone.`}
                confirmText="Delete"
                onConfirm={onDelete}
                variant="destructive"
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}