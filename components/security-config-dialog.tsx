"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Plus,
  X,
  AlertCircle,
  Clock,
  Users,
  Link,
  Key,
  Info,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SecurityType, SecurityConfig } from "@/lib/dto/service-security.dto";

interface BasicAuthConfig {
  id: string;
  name: string;
  description?: string;
}

interface SecurityConfigDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  serviceId: string;
  editingConfig?: (SecurityConfig & { id: string }) | null;
  onSave: (config: SecurityConfig & { id?: string }) => Promise<void>;
  onCancel?: () => void;
  // Configuration limits
  hasSharedLink?: boolean;
  hasSso?: boolean;
  basicAuthCount?: number;
}

interface FormData {
  type: SecurityType;
  isEnabled: boolean;
  priority: number;
  config: {
    // Shared link config
    expiresInHours?: number;
    sessionDurationMinutes?: number;
    // SSO config
    groups?: string[];
    users?: string[];
    // Basic auth config
    basicAuthConfigId?: string;
  };
}

interface FormErrors {
  type?: string;
  priority?: string;
  expiresInHours?: string;
  sessionDurationMinutes?: string;
  groups?: string;
  users?: string;
  basicAuthConfigId?: string;
}

const securityTypeOptions = [
  {
    value: "shared_link" as const,
    label: "Shared Link",
    description: "Time-limited access links",
    icon: Link,
  },
  {
    value: "sso" as const,
    label: "SSO Authentication",
    description: "Single Sign-On authentication",
    icon: Users,
  },
  {
    value: "basic_auth" as const,
    label: "Basic Authentication",
    description: "Username and password authentication",
    icon: Key,
  },
];

export function SecurityConfigDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  serviceId,
  editingConfig,
  onSave,
  onCancel,
  hasSharedLink = false,
  hasSso = false,
  basicAuthCount = 0,
}: SecurityConfigDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [basicAuthConfigs, setBasicAuthConfigs] = useState<BasicAuthConfig[]>([]);
  const [loadingBasicAuth, setLoadingBasicAuth] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use controlled or internal state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = controlledOnOpenChange || setInternalOpen;

  const [formData, setFormData] = useState<FormData>({
    type: "shared_link",
    isEnabled: true,
    priority: 10,
    config: {
      expiresInHours: 24,
      sessionDurationMinutes: 60,
      groups: [],
      users: [],
      basicAuthConfigId: "",
    },
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [groupInput, setGroupInput] = useState("");
  const [userInput, setUserInput] = useState("");

  // Filter available security types based on existing configurations
  const getAvailableSecurityTypes = () => {
    if (editingConfig) {
      // When editing, allow the current type
      return securityTypeOptions;
    }

    return securityTypeOptions.filter(option => {
      switch (option.value) {
        case 'shared_link':
          return !hasSharedLink; // Only allow if no shared link exists
        case 'sso':
          return !hasSso; // Only allow if no SSO exists
        case 'basic_auth':
          return true; // Always allow basic auth (multiple allowed)
        default:
          return true;
      }
    });
  };

  // Load editing data
  useEffect(() => {
    if (editingConfig && isOpen) {
      setFormData({
        type: editingConfig.type,
        isEnabled: editingConfig.isEnabled,
        priority: editingConfig.priority,
        config: {
          ...editingConfig.config,
          groups: editingConfig.type === "sso" ? editingConfig.config.groups : [],
          users: editingConfig.type === "sso" ? editingConfig.config.users : [],
        },
      });
    } else if (isOpen) {
      // Reset form for new config
      setFormData({
        type: "shared_link",
        isEnabled: true,
        priority: 10,
        config: {
          expiresInHours: 24,
          sessionDurationMinutes: 60,
          groups: [],
          users: [],
          basicAuthConfigId: "",
        },
      });
    }
    setErrors({});
    setGroupInput("");
    setUserInput("");
  }, [editingConfig, isOpen]);

  // Load basic auth configs when dialog opens and basic auth is selected
  useEffect(() => {
    if (isOpen && (formData.type === "basic_auth" || editingConfig?.type === "basic_auth")) {
      fetchBasicAuthConfigs();
    }
  }, [isOpen, formData.type, editingConfig?.type]);

  const fetchBasicAuthConfigs = async () => {
    setLoadingBasicAuth(true);
    try {
      const response = await fetch("/api/security/basic-auth-configs");
      if (response.ok) {
        const data = await response.json();
        setBasicAuthConfigs(data);
      }
    } catch (error) {
      console.error("Failed to fetch basic auth configs:", error);
    } finally {
      setLoadingBasicAuth(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Priority validation
    if (formData.priority < 0 || formData.priority > 100) {
      newErrors.priority = "Priority must be between 0 and 100";
    }

    // Type-specific validation
    switch (formData.type) {
      case "shared_link":
        if (!formData.config.expiresInHours || formData.config.expiresInHours < 1) {
          newErrors.expiresInHours = "Expiration time must be at least 1 hour";
        }
        if (!formData.config.sessionDurationMinutes || formData.config.sessionDurationMinutes < 1) {
          newErrors.sessionDurationMinutes = "Session duration must be at least 1 minute";
        }
        break;

      case "sso":
        if (
          (!formData.config.groups || formData.config.groups.length === 0) &&
          (!formData.config.users || formData.config.users.length === 0)
        ) {
          newErrors.groups = "At least one group or user must be specified";
          newErrors.users = "At least one group or user must be specified";
        }
        break;

      case "basic_auth":
        if (!formData.config.basicAuthConfigId) {
          newErrors.basicAuthConfigId = "Basic auth configuration is required";
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Clean up config based on type
      const cleanConfig = { ...formData };

      switch (cleanConfig.type) {
        case "shared_link":
          cleanConfig.config = {
            expiresInHours: cleanConfig.config.expiresInHours!,
            sessionDurationMinutes: cleanConfig.config.sessionDurationMinutes!,
          };
          break;
        case "sso":
          cleanConfig.config = {
            groups: cleanConfig.config.groups!,
            users: cleanConfig.config.users!,
          };
          break;
        case "basic_auth":
          cleanConfig.config = {
            basicAuthConfigId: cleanConfig.config.basicAuthConfigId!,
          };
          break;
      }

      const configToSave = editingConfig
        ? { ...cleanConfig, id: editingConfig.id }
        : cleanConfig;

      await onSave(configToSave as SecurityConfig & { id?: string });
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to save security config:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    onCancel?.();
  };

  const addGroup = () => {
    if (groupInput.trim() && !formData.config.groups?.includes(groupInput.trim())) {
      setFormData({
        ...formData,
        config: {
          ...formData.config,
          groups: [...(formData.config.groups || []), groupInput.trim()],
        },
      });
      setGroupInput("");
      // Clear errors when adding valid data
      if (errors.groups || errors.users) {
        setErrors({ ...errors, groups: undefined, users: undefined });
      }
    }
  };

  const removeGroup = (group: string) => {
    setFormData({
      ...formData,
      config: {
        ...formData.config,
        groups: formData.config.groups?.filter((g) => g !== group) || [],
      },
    });
  };

  const addUser = () => {
    if (userInput.trim() && !formData.config.users?.includes(userInput.trim())) {
      setFormData({
        ...formData,
        config: {
          ...formData.config,
          users: [...(formData.config.users || []), userInput.trim()],
        },
      });
      setUserInput("");
      // Clear errors when adding valid data
      if (errors.groups || errors.users) {
        setErrors({ ...errors, groups: undefined, users: undefined });
      }
    }
  };

  const removeUser = (user: string) => {
    setFormData({
      ...formData,
      config: {
        ...formData.config,
        users: formData.config.users?.filter((u) => u !== user) || [],
      },
    });
  };

  const selectedTypeOption = securityTypeOptions.find((option) => option.value === formData.type);
  const TypeIcon = selectedTypeOption?.icon || Shield;

  const dialogContent = (
    <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <TypeIcon className="h-5 w-5" />
          {editingConfig ? "Edit Security Configuration" : "Add Security Configuration"}
        </DialogTitle>
        <DialogDescription>
          {editingConfig
            ? "Update the security configuration for this service."
            : "Create a new security configuration for this service."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Security Type Selection */}
        <div className="space-y-2">
          <Label htmlFor="type">Security Type</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => {
              setFormData({
                ...formData,
                type: value as SecurityType,
                config: {
                  expiresInHours: 24,
                  sessionDurationMinutes: 60,
                  groups: [],
                  users: [],
                  basicAuthConfigId: "",
                },
              });
              setErrors({});
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getAvailableSecurityTypes().map((option) => {
                const OptionIcon = option.icon;
                return (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <OptionIcon className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {option.description}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {errors.type && (
            <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {errors.type}
            </div>
          )}
        </div>

        {/* Basic Configuration */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="priority">Priority (0-100)</Label>
            <Input
              id="priority"
              type="number"
              min={0}
              max={100}
              value={formData.priority}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  priority: parseInt(e.target.value) || 0,
                })
              }
            />
            {errors.priority && (
              <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                {errors.priority}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Higher numbers have higher priority
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.isEnabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isEnabled: checked })
                }
              />
              <Label htmlFor="enabled">Configuration enabled</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Disabled configurations are ignored
            </p>
          </div>
        </div>

        {/* Type-specific Configuration */}
        {formData.type === "shared_link" && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link className="h-4 w-4" />
              Shared Link Configuration
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiresInHours">Link expires in (hours)</Label>
                <Input
                  id="expiresInHours"
                  type="number"
                  min={1}
                  value={formData.config.expiresInHours || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      config: {
                        ...formData.config,
                        expiresInHours: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                />
                {errors.expiresInHours && (
                  <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    {errors.expiresInHours}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="sessionDurationMinutes">Session duration (minutes)</Label>
                <Input
                  id="sessionDurationMinutes"
                  type="number"
                  min={1}
                  value={formData.config.sessionDurationMinutes || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      config: {
                        ...formData.config,
                        sessionDurationMinutes: parseInt(e.target.value) || 0,
                      },
                    })
                  }
                />
                {errors.sessionDurationMinutes && (
                  <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    {errors.sessionDurationMinutes}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-blue-700 dark:text-blue-300">
                Users can generate time-limited links to access this service without additional authentication.
              </span>
            </div>
          </div>
        )}

        {formData.type === "sso" && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              SSO Configuration
            </div>

            <div className="space-y-4">
              {/* Groups */}
              <div className="space-y-2">
                <Label>Allowed Groups</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter group name"
                    value={groupInput}
                    onChange={(e) => setGroupInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addGroup();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addGroup}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formData.config.groups && formData.config.groups.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.config.groups.map((group) => (
                      <Badge key={group} variant="outline" className="text-xs">
                        {group}
                        <button
                          type="button"
                          onClick={() => removeGroup(group)}
                          className="ml-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Users */}
              <div className="space-y-2">
                <Label>Allowed Users</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter username"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addUser();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addUser}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {formData.config.users && formData.config.users.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.config.users.map((user) => (
                      <Badge key={user} variant="outline" className="text-xs">
                        {user}
                        <button
                          type="button"
                          onClick={() => removeUser(user)}
                          className="ml-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(errors.groups || errors.users) && (
              <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                {errors.groups || errors.users}
              </div>
            )}

            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
              <Info className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                Users must authenticate through your SSO provider and be members of specified groups or users.
                Leave both empty to allow all authenticated users.
              </span>
            </div>
          </div>
        )}

        {formData.type === "basic_auth" && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Key className="h-4 w-4" />
              Basic Authentication Configuration
            </div>

            <div className="space-y-2">
              <Label htmlFor="basicAuthConfig">Basic Auth Configuration</Label>
              {loadingBasicAuth ? (
                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading configurations...</span>
                </div>
              ) : (
                <Select
                  value={formData.config.basicAuthConfigId || ""}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      config: {
                        ...formData.config,
                        basicAuthConfigId: value,
                      },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a configuration" />
                  </SelectTrigger>
                  <SelectContent>
                    {basicAuthConfigs.length === 0 ? (
                      <div className="p-2 text-center text-sm text-muted-foreground">
                        No configurations available
                      </div>
                    ) : (
                      basicAuthConfigs.map((config) => (
                        <SelectItem key={config.id} value={config.id}>
                          <div>
                            <div className="font-medium">{config.name}</div>
                            {config.description && (
                              <div className="text-xs text-muted-foreground">
                                {config.description}
                              </div>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              {errors.basicAuthConfigId && (
                <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  {errors.basicAuthConfigId}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Choose which basic authentication configuration to use.
                {basicAuthConfigs.length === 0 && (
                  <>
                    {" "}Create configurations in the{" "}
                    <span className="underline">Security section</span>.
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <Info className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm text-orange-700 dark:text-orange-300">
                Users must provide valid username and password credentials to access this service.
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingConfig ? "Update Configuration" : "Add Configuration"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );

  if (trigger) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        {dialogContent}
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {dialogContent}
    </Dialog>
  );
}