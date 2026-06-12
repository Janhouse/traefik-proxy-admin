"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/toaster";
import type {
  ManagedModeResponse,
  ManagedStaticConfig,
  ManagedStaticStatus,
} from "@/lib/managed-traefik-types";

/**
 * State for the managed-Traefik section: the editable static config plus the
 * applied/pending status, polled so the "waiting for Traefik restart" chip
 * flips green on its own once the wrapper picks the new config up.
 */
export function useManagedConfig(pollMs = 10_000) {
  // null = still loading; the section renders nothing until resolved
  const [managed, setManaged] = useState<boolean | null>(null);
  const [adminAuthConfigured, setAdminAuthConfigured] = useState(true);
  const [config, setConfig] = useState<ManagedStaticConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<ManagedStaticConfig | null>(null);
  const [status, setStatus] = useState<ManagedStaticStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const hasUnsavedChanges =
    !!config &&
    !!originalConfig &&
    JSON.stringify(config) !== JSON.stringify(originalConfig);

  // The poll must never clobber in-progress edits — read dirtiness via a ref.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  const applyResponse = useCallback((data: ManagedModeResponse, force = false) => {
    setManaged(data.managed);
    setAdminAuthConfigured(data.adminAuthConfigured);
    setStatus(data.status);
    if (data.config && (force || !dirtyRef.current)) {
      setConfig(data.config);
      setOriginalConfig(data.config);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/traefik/managed", { cache: "no-store" });
      if (res.ok) applyResponse((await res.json()) as ManagedModeResponse);
    } catch {
      /* swallow — section just keeps its last state */
    }
  }, [applyResponse]);

  useEffect(() => {
    refresh();
    if (pollMs > 0) {
      const id = setInterval(refresh, pollMs);
      return () => clearInterval(id);
    }
  }, [refresh, pollMs]);

  const handleSave = useCallback(async () => {
    if (!config) return;
    setIsSaving(true);
    setErrors([]);
    try {
      const res = await fetch("/api/traefik/managed", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        applyResponse((await res.json()) as ManagedModeResponse, true);
        toast("Managed Traefik config saved — applies on the next restart cycle");
      } else {
        const body = (await res.json().catch(() => ({}))) as { errors?: string[] };
        setErrors(body.errors ?? ["Failed to save managed configuration"]);
        toast("Managed config rejected — fix the errors and retry", "error");
      }
    } catch (error) {
      console.error("Error saving managed config:", error);
      toast("Failed to save managed configuration", "error");
    } finally {
      setIsSaving(false);
    }
  }, [config, applyResponse]);

  const handleDiscard = useCallback(() => {
    setConfig(originalConfig);
    setErrors([]);
  }, [originalConfig]);

  return {
    managed,
    adminAuthConfigured,
    config,
    setConfig,
    status,
    errors,
    isSaving,
    hasUnsavedChanges,
    handleSave,
    handleDiscard,
    refresh,
  };
}
