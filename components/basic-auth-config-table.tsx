"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Users,
  ChevronDown,
  ChevronRight,
  User,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";

export interface BasicAuthUser {
  id: string;
  configId: string;
  username: string;
}

export interface BasicAuthConfig {
  id: string;
  name: string;
  description?: string;
  users?: BasicAuthUser[];
}

interface BasicAuthConfigTableProps {
  configs: BasicAuthConfig[];
  expandedConfigs: Set<string>;
  loading: boolean;
  onToggleExpansion: (configId: string) => void;
  onAddConfig: () => void;
  onEditConfig: (config: BasicAuthConfig) => void;
  onDeleteConfig: (id: string) => Promise<void>;
  onAddUser: (configId: string) => void;
  onEditUser: (user: BasicAuthUser) => void;
  onDeleteUser: (id: string) => Promise<void>;
}

export function BasicAuthConfigTable({
  configs,
  expandedConfigs,
  loading,
  onToggleExpansion,
  onAddConfig,
  onEditConfig,
  onDeleteConfig,
  onAddUser,
  onEditUser,
  onDeleteUser,
}: BasicAuthConfigTableProps) {
  const [deletingConfig, setDeletingConfig] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);

  const handleDeleteConfig = async (id: string) => {
    setDeletingConfig(id);
    try {
      await onDeleteConfig(id);
    } finally {
      setDeletingConfig(null);
    }
  };

  const handleDeleteUser = async (id: string) => {
    setDeletingUser(id);
    try {
      await onDeleteUser(id);
    } finally {
      setDeletingUser(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Basic Authentication Configurations
          </CardTitle>
          <CardDescription>
            Loading configurations...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Basic Authentication Configurations
            </CardTitle>
            <CardDescription>
              Manage basic authentication configurations and users for your services
            </CardDescription>
          </div>
          <Button onClick={onAddConfig} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add Configuration
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {configs.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No configurations found
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Get started by creating your first basic authentication configuration.
            </p>
            <Button onClick={onAddConfig}>
              <Plus className="mr-2 h-4 w-4" />
              Add Configuration
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map((config) => {
              const isExpanded = expandedConfigs.has(config.id);

              return (
                <div key={config.id} className="border rounded-lg">
                  <div className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onToggleExpansion(config.id)}
                          className="p-1 h-auto"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <h3 className="font-medium">{config.name}</h3>
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <Users className="h-3 w-3" />
                            {config.users?.length || 0} users
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEditConfig(config)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={deletingConfig === config.id}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          }
                          title="Delete Configuration"
                          description={`Are you sure you want to delete "${config.name}"? This will also delete all associated users and cannot be undone.`}
                          confirmText="Delete"
                          onConfirm={() => handleDeleteConfig(config.id)}
                          variant="destructive"
                        />
                      </div>
                    </div>
                  </div>

                  {config.description && (
                    <div className="px-4 pb-2">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {config.description}
                      </p>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="border-t p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <h4 className="font-medium">Users</h4>
                        <Button
                          size="sm"
                          onClick={() => onAddUser(config.id)}
                          className="w-full sm:w-auto"
                        >
                          <User className="h-4 w-4 mr-1" />
                          Add User
                        </Button>
                      </div>

                      {config.users && config.users.length > 0 ? (
                        <div className="space-y-2">
                          {config.users.map((user) => (
                            <div key={user.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-500" />
                                <span className="font-medium">{user.username}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onEditUser(user)}
                                  className="w-full sm:w-auto"
                                >
                                  <Edit className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                                <ConfirmDialog
                                  trigger={
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={deletingUser === user.id}
                                      className="text-red-600 hover:text-red-700 w-full sm:w-auto"
                                    >
                                      <Trash2 className="h-4 w-4 mr-1" />
                                      Delete
                                    </Button>
                                  }
                                  title="Delete User"
                                  description={`Are you sure you want to delete user "${user.username}"?`}
                                  confirmText="Delete"
                                  onConfirm={() => handleDeleteUser(user.id)}
                                  variant="destructive"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                          No users configured. Add users to enable authentication.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}