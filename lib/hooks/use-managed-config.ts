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

  const applyResponse = useCallback(
    (
      data: ManagedModeResponse,
      opts: { force?: boolean; syncConfig?: boolean } = {}
    ) => {
      const { force = false, syncConfig = true } = opts;
      setManaged(data.managed);
      setAdminAuthConfigured(data.adminAuthConfigured);
      setStatus(data.status);
      if (force || !dirtyRef.current) {
        setSecretNames(data.secretNames);
        // syncConfig=false keeps the user's in-progress (e.g. rejected) config
        // edits instead of overwriting them with the server's last-saved copy.
        if (syncConfig && data.config) {
          setConfig(data.config);
          setOriginalConfig(data.config);
        }
      }
    },
    []
  );

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

  const errorsOf = async (res: Response, fallback: string): Promise<string[]> => {
    const body = (await res.json().catch(() => ({}))) as { errors?: string[] };
    return body.errors ?? [fallback];
  };

  const handleSave = useCallback(async () => {
    if (!config) return;
    setIsSaving(true);
    setErrors([]);
    const errs: string[] = [];
    let secretsSaved = false;
    let configSaved = false;
    try {
      // Credentials and static config are INDEPENDENT resources. A rejected
      // config must never hide a successful credential change (e.g. deleting
      // credentials while the config is mid-edit), and vice versa.
      if (secretsDirty) {
        // Drop unfilled "add" rows; the rest are validated server-side.
        const edits: ManagedSecretEdits = {
          remove: secretEdits.remove,
          upsert: secretEdits.upsert.filter((u) => u.name !== ""),
        };
        const res = await putJson("/api/traefik/managed/secrets", edits);
        if (res.ok) {
          secretsSaved = true;
          setSecretEdits(NO_EDITS);
        } else {
          errs.push(...(await errorsOf(res, "Failed to save credentials")));
        }
      }
      if (configDirty) {
        const res = await putJson("/api/traefik/managed", config);
        if (res.ok) configSaved = true;
        else errs.push(...(await errorsOf(res, "Failed to save managed configuration")));
      }

      // Reflect what actually persisted: always refresh names + status; only
      // adopt the server's config when ours saved, so a rejected config keeps
      // the user's edits to fix.
      const res = await fetch("/api/traefik/managed", { cache: "no-store" });
      if (res.ok) {
        applyResponse((await res.json()) as ManagedModeResponse, {
          force: true,
          syncConfig: configSaved || !configDirty,
        });
      }

      setErrors(errs);
      if (errs.length === 0) {
        toast("Managed Traefik config saved — applies on the next restart cycle");
      } else if (secretsSaved) {
        toast("Credentials saved; other changes were rejected — see the errors", "error");
      } else {
        toast("Changes were rejected — see the errors", "error");
      }
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
