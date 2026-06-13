"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/toaster";
import type {
  ManagedModeResponse,
  ManagedSecretEdits,
  ManagedStaticConfig,
  ManagedStaticStatus,
} from "@/lib/managed-traefik-types";

const NO_EDITS: ManagedSecretEdits = { upsert: [], remove: [] };

/**
 * State for the managed-Traefik section: the editable static config, the
 * write-only DNS credential edits, and the applied/pending status (polled so
 * the "waiting for Traefik restart" chip flips green on its own once the
 * wrapper picks the new config/credentials up).
 */
export function useManagedConfig(pollMs = 10_000) {
  // null = still loading; the section renders nothing until resolved
  const [managed, setManaged] = useState<boolean | null>(null);
  const [adminAuthConfigured, setAdminAuthConfigured] = useState(true);
  const [config, setConfig] = useState<ManagedStaticConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<ManagedStaticConfig | null>(null);
  const [secretNames, setSecretNames] = useState<string[]>([]);
  const [secretEdits, setSecretEdits] = useState<ManagedSecretEdits>(NO_EDITS);
  const [status, setStatus] = useState<ManagedStaticStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const configDirty =
    !!config &&
    !!originalConfig &&
    JSON.stringify(config) !== JSON.stringify(originalConfig);
  // A lone blank "add" row (no name, no value) doesn't count as a change.
  const secretsDirty =
    secretEdits.remove.length > 0 ||
    secretEdits.upsert.some((u) => u.name !== "" || u.value !== "");
  const hasUnsavedChanges = configDirty || secretsDirty;

  // The poll must never clobber in-progress edits — read dirtiness via a ref.
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  const applyResponse = useCallback((data: ManagedModeResponse, force = false) => {
    setManaged(data.managed);
    setAdminAuthConfigured(data.adminAuthConfigured);
    setStatus(data.status);
    if (force || !dirtyRef.current) {
      setSecretNames(data.secretNames);
      if (data.config) {
        setConfig(data.config);
        setOriginalConfig(data.config);
      }
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

  const putJson = (url: string, body: unknown) =>
    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const failFrom = async (res: Response, fallback: string) => {
    const body = (await res.json().catch(() => ({}))) as { errors?: string[] };
    setErrors(body.errors ?? [fallback]);
  };

  const handleSave = useCallback(async () => {
    if (!config) return;
    setIsSaving(true);
    setErrors([]);
    try {
      if (secretsDirty) {
        // Drop unfilled "add" rows; the rest are validated server-side.
        const edits: ManagedSecretEdits = {
          remove: secretEdits.remove,
          upsert: secretEdits.upsert.filter((u) => u.name !== ""),
        };
        const res = await putJson("/api/traefik/managed/secrets", edits);
        if (!res.ok) {
          await failFrom(res, "Failed to save credentials");
          toast("Credentials rejected — fix the errors and retry", "error");
          return;
        }
      }
      if (configDirty) {
        const res = await putJson("/api/traefik/managed", config);
        if (!res.ok) {
          await failFrom(res, "Failed to save managed configuration");
          toast("Managed config rejected — fix the errors and retry", "error");
          return;
        }
      }
      // Success: clear edits and pull fresh names/status.
      setSecretEdits(NO_EDITS);
      const res = await fetch("/api/traefik/managed", { cache: "no-store" });
      if (res.ok) applyResponse((await res.json()) as ManagedModeResponse, true);
      toast("Managed Traefik config saved — applies on the next restart cycle");
    } catch (error) {
      console.error("Error saving managed config:", error);
      toast("Failed to save managed configuration", "error");
    } finally {
      setIsSaving(false);
    }
  }, [config, configDirty, secretsDirty, secretEdits, applyResponse]);

  const handleDiscard = useCallback(() => {
    setConfig(originalConfig);
    setSecretEdits(NO_EDITS);
    setErrors([]);
  }, [originalConfig]);

  return {
    managed,
    adminAuthConfigured,
    config,
    setConfig,
    secretNames,
    secretEdits,
    setSecretEdits,
    status,
    errors,
    isSaving,
    hasUnsavedChanges,
    handleSave,
    handleDiscard,
    refresh,
  };
}
