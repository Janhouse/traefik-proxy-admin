"use client";

import { useState, useCallback } from "react";
import type { BasicAuthConfig, BasicAuthUser } from "@/components/basic-auth-config-table";

export function useBasicAuth() {
  const [configs, setConfigs] = useState<BasicAuthConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/security/basic-auth-configs");
      if (response.ok) {
        const data = await response.json();
        setConfigs(data);
      } else {
        console.error("Failed to fetch configurations");
      }
    } catch (error) {
      console.error("Error fetching configurations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveConfig = useCallback(async (
    configData: { name: string; description: string },
    editingConfig?: BasicAuthConfig | null
  ) => {
    const url = editingConfig
      ? `/api/security/basic-auth-configs/${editingConfig.id}`
      : "/api/security/basic-auth-configs";
    const method = editingConfig ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(configData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to save configuration");
    }

    await fetchConfigs();
  }, [fetchConfigs]);

  const deleteConfig = useCallback(async (id: string) => {
    const response = await fetch(`/api/security/basic-auth-configs/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete configuration");
    }

    await fetchConfigs();
  }, [fetchConfigs]);

  const saveUser = useCallback(async (
    userData: { username: string; password: string; configId: string },
    editingUser?: BasicAuthUser | null
  ) => {
    const url = editingUser
      ? `/api/security/basic-auth-users/${editingUser.id}`
      : `/api/security/basic-auth-configs/${userData.configId}/users`;
    const method = editingUser ? "PUT" : "POST";

    const requestBody = editingUser && !userData.password
      ? { username: userData.username } // Don't send empty password for updates
      : userData;

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Failed to save user");
    }

    await fetchConfigs();
  }, [fetchConfigs]);

  const deleteUser = useCallback(async (id: string) => {
    const response = await fetch(`/api/security/basic-auth-users/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete user");
    }

    await fetchConfigs();
  }, [fetchConfigs]);

  return {
    configs,
    loading,
    fetchConfigs,
    saveConfig,
    deleteConfig,
    saveUser,
    deleteUser,
  };
}