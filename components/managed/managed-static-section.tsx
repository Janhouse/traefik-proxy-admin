"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/form-section";
import { ManagedEntrypointsEditor } from "@/components/managed/managed-entrypoints-editor";
import { ManagedResolversEditor } from "@/components/managed/managed-resolvers-editor";
import { useManagedConfig } from "@/lib/hooks/use-managed-config";
import type { ManagedLogLevel } from "@/lib/managed-traefik-types";
import { AlertTriangle, CheckCircle2, Clock, Save } from "lucide-react";

const LOG_LEVELS: ManagedLogLevel[] = ["ERROR", "WARN", "INFO", "DEBUG"];

function StatusChip({
  pending,
  lastFetchedAt,
}: {
  pending: boolean;
  lastFetchedAt: string | null;
}) {
  if (!lastFetchedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-[12px] text-[var(--meta)]">
        <Clock className="h-3.5 w-3.5" />
        Traefik hasn&apos;t fetched the static config yet
      </span>
    );
  }
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--warn,orange)_40%,transparent)] bg-[var(--warn-soft,rgba(255,165,0,.12))] px-2.5 py-1 text-[12px]">
        <Clock className="h-3.5 w-3.5" />
        Waiting for Traefik restart — picked up within ~30s
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--ok,green)_40%,transparent)] bg-[var(--ok-soft,rgba(0,128,0,.12))] px-2.5 py-1 text-[12px]">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Applied — Traefik fetched this config at{" "}
      {new Date(lastFetchedAt).toLocaleTimeString()}
    </span>
  );
}

/**
 * Config-page section shown only in fully-managed mode (TRAEFIK_MANAGED).
 * Edits Traefik's static config (entrypoints + ACME resolvers); the bundled
 * wrapper script fetches it and restarts Traefik on change, so this section
 * has its own Save and an applied/pending indicator.
 */
export function ManagedStaticSection() {
  const {
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
  } = useManagedConfig();

  if (!managed || !config) return null;

  return (
    <Section
      n={4}
      title="Managed Traefik"
      desc="This panel owns Traefik's static configuration. Saving here rewrites traefik.yml; the bundled wrapper restarts Traefik automatically on its next poll."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {status && (
            <StatusChip
              pending={status.pending}
              lastFetchedAt={status.lastFetchedAt}
            />
          )}
          {!adminAuthConfigured && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-[var(--danger)]/10 px-2.5 py-1 text-[12px] text-[var(--danger)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              ADMIN_PANEL_AUTH is not set — the panel route is published without
              authentication
            </span>
          )}
        </div>

        {errors.length > 0 && (
          <div className="rounded-md border border-[var(--danger)] bg-[var(--danger)]/10 p-3">
            {errors.map((e, i) => (
              <p key={i} className="text-sm text-[var(--danger)]">
                {e}
              </p>
            ))}
          </div>
        )}

        <ManagedEntrypointsEditor
          value={config.entrypoints}
          onChange={(entrypoints) => setConfig({ ...config, entrypoints })}
          disabled={isSaving}
        />

        <ManagedResolversEditor
          value={config.certResolvers}
          onChange={(certResolvers) => setConfig({ ...config, certResolvers })}
          entrypointNames={config.entrypoints.map((e) => e.name)}
          disabled={isSaving}
        />

        <div className="max-w-[200px] space-y-1.5">
          <Label htmlFor="managed-log-level">Traefik log level</Label>
          <Select
            value={config.logLevel ?? "INFO"}
            onValueChange={(v) => {
              // Ignore spurious empty-string events from the Select component
              if (v === "") return;
              setConfig({ ...config, logLevel: v as ManagedLogLevel });
            }}
            disabled={isSaving}
          >
            <SelectTrigger id="managed-log-level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOG_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-3 border-t border-[var(--border-soft)] pt-4">
          {hasUnsavedChanges && (
            <Button variant="outline" onClick={handleDiscard} disabled={isSaving}>
              Discard
            </Button>
          )}
          <Button
            className="btn-brand"
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving…" : "Save Managed Config"}
          </Button>
        </div>
      </div>
    </Section>
  );
}
