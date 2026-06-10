"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/toaster";

export interface GlobalConfig {
  globalMiddlewares: string[];
  adminPanelDomain: string;
  defaultEntrypoint?: string;
  defaultEnableDurationMinutes?: number | null;
}

const defaultConfig: GlobalConfig = {
  globalMiddlewares: [],
  adminPanelDomain: "localhost:3000",
  defaultEnableDurationMinutes: 720,
};

/** Normalize an API payload so every field is a stable controlled value. */
function normalizeConfig(data: Partial<GlobalConfig>): GlobalConfig {
  return {
    globalMiddlewares: Array.isArray(data.globalMiddlewares)
      ? data.globalMiddlewares
      : [],
    adminPanelDomain: data.adminPanelDomain || "localhost:3000",
    defaultEntrypoint: data.defaultEntrypoint || "",
    defaultEnableDurationMinutes: data.defaultEnableDurationMinutes ?? 720,
  };
}

export function useConfig() {
  const [config, setConfig] = useState<GlobalConfig>(defaultConfig);
  const [originalConfig, setOriginalConfig] = useState<GlobalConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Middlewares now live directly in `config`, so edits to them count here —
  // previously they sat in a separate text state and never enabled Save.
  const hasUnsavedChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const fullConfig = normalizeConfig(await response.json());
        setConfig(fullConfig);
        setOriginalConfig(fullConfig);
      }
    } catch (error) {
      console.error("Error fetching config:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const configToSave = {
        ...config,
        globalMiddlewares: config.globalMiddlewares
          .map((m) => m.trim())
          .filter((m) => m.length > 0),
      };

      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configToSave),
      });

      if (response.ok) {
        const safeConfig = normalizeConfig(await response.json());
        setConfig(safeConfig);
        setOriginalConfig(safeConfig);
        toast("Configuration saved");
      } else {
        const body = await response.text();
        console.error("Failed to save config:", response.status, body);
        toast("Failed to save configuration", "error");
      }
    } catch (error) {
      console.error("Error saving config:", error);
      toast("Failed to save configuration", "error");
    } finally {
      setIsSaving(false);
    }
  }, [config]);

  const handleDiscard = useCallback(() => {
    setConfig(originalConfig);
  }, [originalConfig]);

  return {
    config,
    setConfig,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    handleSave,
    handleDiscard,
    fetchConfig,
  };
}
