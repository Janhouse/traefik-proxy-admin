"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/app-layout";
import { BasicAuthConfigTable } from "@/components/basic-auth-config-table";
import { BasicAuthConfigDialog } from "@/components/basic-auth-config-dialog";
import { BasicAuthUserDialog } from "@/components/basic-auth-user-dialog";
import { useBasicAuth } from "@/hooks/use-basic-auth";
import type { BasicAuthConfig, BasicAuthUser } from "@/components/basic-auth-config-table";

export default function SecurityPage() {
  const {
    configs,
    loading,
    fetchConfigs,
    saveConfig,
    deleteConfig,
    saveUser,
    deleteUser,
  } = useBasicAuth();

  // UI state
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set());

  // Config dialog state
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<BasicAuthConfig | null>(null);

  // User dialog state
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<BasicAuthUser | null>(null);
  const [userParentConfigId, setUserParentConfigId] = useState<string>("");

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const toggleConfigExpansion = (configId: string) => {
    const newExpanded = new Set(expandedConfigs);
    if (newExpanded.has(configId)) {
      newExpanded.delete(configId);
    } else {
      newExpanded.add(configId);
    }
    setExpandedConfigs(newExpanded);
  };

  const handleAddConfig = () => {
    setEditingConfig(null);
    setShowConfigDialog(true);
  };

  const handleEditConfig = (config: BasicAuthConfig) => {
    setEditingConfig(config);
    setShowConfigDialog(true);
  };

  const handleAddUser = (configId: string) => {
    setUserParentConfigId(configId);
    setEditingUser(null);
    setShowUserDialog(true);
  };

  const handleEditUser = (user: BasicAuthUser) => {
    setUserParentConfigId(user.configId);
    setEditingUser(user);
    setShowUserDialog(true);
  };

  const handleConfigSubmit = async (data: { name: string; description: string }) => {
    await saveConfig(data, editingConfig);
  };

  const handleUserSubmit = async (data: { username: string; password: string; configId: string }) => {
    await saveUser(data, editingUser);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Security Management</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage basic authentication configurations and users
          </p>
        </div>

        <BasicAuthConfigTable
          configs={configs}
          expandedConfigs={expandedConfigs}
          loading={loading}
          onToggleExpansion={toggleConfigExpansion}
          onAddConfig={handleAddConfig}
          onEditConfig={handleEditConfig}
          onDeleteConfig={deleteConfig}
          onAddUser={handleAddUser}
          onEditUser={handleEditUser}
          onDeleteUser={deleteUser}
        />

        <BasicAuthConfigDialog
          open={showConfigDialog}
          onOpenChange={setShowConfigDialog}
          editingConfig={editingConfig}
          onSubmit={handleConfigSubmit}
        />

        <BasicAuthUserDialog
          open={showUserDialog}
          onOpenChange={setShowUserDialog}
          editingUser={editingUser}
          parentConfigId={userParentConfigId}
          onSubmit={handleUserSubmit}
        />
      </div>
    </AppLayout>
  );
}