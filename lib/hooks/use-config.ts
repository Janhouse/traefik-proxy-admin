"use client";

import { useState, useEffect, useCallback } from "react";

export interface GlobalConfig {
  baseDomain: string;
  certResolver: string;
  globalMiddlewares: string[];
  adminPanelDomain: string;
  defaultEntrypoint?: string;
  defaultEnableDurationMinutes?: number | null;
}

const defaultConfig: GlobalConfig = {
  baseDomain: "",
  certResolver: "",
  globalMiddlewares: [],
  adminPanelDomain: "localhost:3000",
  defaultEnableDurationMinutes: 720,
};

export function useConfig() {
  const [config, setConfig] = useState<GlobalConfig>(defaultConfig);
  const [originalConfig, setOriginalConfig] = useState<GlobalConfig>(defaultConfig);
  const [middlewareText, setMiddlewareText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const hasUnsavedChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const data = await response.json();
        // Ensure all fields have values to prevent controlled/uncontrolled input issues
        const fullConfig = {
          baseDomain: data.baseDomain || "",
          certResolver: data.certResolver || "",
          globalMiddlewares: Array.isArray(data.globalMiddlewares) ? data.globalMiddlewares : [],
          adminPanelDomain: data.adminPanelDomain || "localhost:3000",
          defaultEntrypoint: data.defaultEntrypoint || "",
          defaultEnableDurationMinutes: data.defaultEnableDurationMinutes ?? 720,
        };
        setConfig(fullConfig);
        setOriginalConfig(fullConfig);
        setMiddlewareText(fullConfig.globalMiddlewares.join("\n"));
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
      const middlewares = middlewareText
        .split("\n")
        .map((m) => m.trim())
        .filter((m) => m.length > 0);

      const configToSave = {
        ...config,
        globalMiddlewares: middlewares,
      };

      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configToSave),
      });

      if (response.ok) {
        const updatedConfig = await response.json();
        // Ensure all fields are properly set
        const safeConfig = {
          baseDomain: updatedConfig.baseDomain || "",
          certResolver: updatedConfig.certResolver || "",
          globalMiddlewares: Array.isArray(updatedConfig.globalMiddlewares) ? updatedConfig.globalMiddlewares : [],
          adminPanelDomain: updatedConfig.adminPanelDomain || "localhost:3000",
          defaultEntrypoint: updatedConfig.defaultEntrypoint || "",
          defaultEnableDurationMinutes: updatedConfig.defaultEnableDurationMinutes ?? 720,
        };
        setConfig(safeConfig);
        setOriginalConfig(safeConfig);
        setMiddlewareText(safeConfig.globalMiddlewares.join("\n"));
      } else {
        console.error("Failed to save config:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("Error saving config:", error);
    } finally {
      setIsSaving(false);
    }
  }, [config, middlewareText]);

  const handleDiscard = useCallback(() => {
    setConfig(originalConfig);
    setMiddlewareText(originalConfig.globalMiddlewares.join("\n"));
  }, [originalConfig]);

  return {
    config,
    setConfig,
    middlewareText,
    setMiddlewareText,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    handleSave,
    handleDiscard,
    fetchConfig,
  };
}