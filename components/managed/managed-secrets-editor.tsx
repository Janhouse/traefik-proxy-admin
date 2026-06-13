"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Minus, KeyRound, RotateCcw } from "lucide-react";
import type { ManagedSecretEdits } from "@/lib/managed-traefik-types";

interface ManagedSecretsEditorProps {
  /** Names of credentials already stored (values never leave the server). */
  existingNames: string[];
  edits: ManagedSecretEdits;
  onChange: (edits: ManagedSecretEdits) => void;
  disabled?: boolean;
  /** Suggested env var names derived from the configured DNS providers. */
  hint?: string;
}

/**
 * Write-only editor for DNS-provider credentials. Stored values are never
 * sent to the browser, so existing credentials show as "set" with an empty
 * field; typing replaces the value, and the X removes it. New rows add a
 * name + value. Everything is committed as a {@link ManagedSecretEdits} batch.
 */
export function ManagedSecretsEditor({
  existingNames,
  edits,
  onChange,
  disabled,
  hint,
}: ManagedSecretsEditorProps) {
  const removed = new Set(edits.remove);
  const replacementOf = (name: string) =>
    edits.upsert.find((u) => u.name === name)?.value ?? "";
  // New rows = upserts whose name isn't an existing credential (incl. the
  // single blank "add" row — kept unique by disabling Add while one exists).
  const newRows = edits.upsert.filter((u) => !existingNames.includes(u.name));
  const hasBlankRow = edits.upsert.some((u) => u.name === "");

  const setReplacement = (name: string, value: string) => {
    const rest = edits.upsert.filter((u) => u.name !== name);
    onChange({ ...edits, upsert: value ? [...rest, { name, value }] : rest });
  };
  const toggleRemove = (name: string) =>
    onChange({
      ...edits,
      remove: removed.has(name)
        ? edits.remove.filter((n) => n !== name)
        : [...edits.remove, name],
      // dropping a pending replacement when removing keeps intent clear
      upsert: removed.has(name)
        ? edits.upsert
        : edits.upsert.filter((u) => u.name !== name),
    });
  const updateNewRow = (oldName: string, patch: Partial<{ name: string; value: string }>) =>
    onChange({
      ...edits,
      upsert: edits.upsert.map((u) =>
        u.name === oldName && !existingNames.includes(u.name) ? { ...u, ...patch } : u
      ),
    });
  const removeNewRow = (name: string) =>
    onChange({
      ...edits,
      upsert: edits.upsert.filter(
        (u) => !(u.name === name && !existingNames.includes(u.name))
      ),
    });
  const addRow = () =>
    onChange({ ...edits, upsert: [...edits.upsert, { name: "", value: "" }] });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            DNS provider credentials
          </p>
          <p className="text-[12px] text-[var(--meta)]">
            Set as environment variables for Traefik (e.g.{" "}
            <span className="mono">CF_DNS_API_TOKEN</span>). Write-only — values
            are never shown again and can&apos;t be read back through the web.
            {hint ? ` ${hint}` : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={disabled || hasBlankRow}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add credential
        </Button>
      </div>

      {(existingNames.length > 0 || newRows.length > 0) && (
        <div className="space-y-2">
          {existingNames.map((name) => {
            const isRemoved = removed.has(name);
            return (
              <div
                key={`existing-${name}`}
                className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5"
              >
                <KeyRound className="h-4 w-4 shrink-0 text-[var(--meta)]" />
                <span
                  className={`mono min-w-0 flex-shrink truncate text-sm ${
                    isRemoved ? "text-[var(--meta)] line-through" : "text-foreground"
                  }`}
                >
                  {name}
                </span>
                {isRemoved ? (
                  <>
                    <span className="text-[12px] text-[var(--danger)]">
                      will be removed
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => toggleRemove(name)}
                      disabled={disabled}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Undo
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="rounded-full border border-[var(--border-soft)] px-2 py-0.5 text-[11px] text-[var(--meta)]">
                      set
                    </span>
                    <Input
                      type="password"
                      autoComplete="off"
                      className="ml-auto max-w-[280px]"
                      placeholder="Replace value…"
                      value={replacementOf(name)}
                      onChange={(e) => setReplacement(name, e.target.value)}
                      disabled={disabled}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove credential ${name}`}
                      onClick={() => toggleRemove(name)}
                      disabled={disabled}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}

          {newRows.map((row, i) => (
            <div
              key={`new-${i}`}
              className="grid grid-cols-1 gap-2 rounded-[var(--radius-sm)] border border-[var(--border-soft)] bg-[var(--surface-2)] p-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`secret-name-${i}`}>Env var name</Label>
                <Input
                  id={`secret-name-${i}`}
                  className="mono"
                  value={row.name}
                  onChange={(e) =>
                    updateNewRow(row.name, { name: e.target.value.toUpperCase() })
                  }
                  placeholder="CF_DNS_API_TOKEN"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`secret-value-${i}`}>Value</Label>
                <Input
                  id={`secret-value-${i}`}
                  type="password"
                  autoComplete="off"
                  value={row.value}
                  onChange={(e) => updateNewRow(row.name, { value: e.target.value })}
                  placeholder="secret value"
                  disabled={disabled}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove new credential"
                onClick={() => removeNewRow(row.name)}
                disabled={disabled}
              >
                <Minus className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {existingNames.length === 0 && newRows.length === 0 && (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-soft)] py-5 text-center text-muted-foreground">
          <p className="text-sm">No credentials set.</p>
          <p className="text-[12px] text-[var(--meta)]">
            Add provider credentials here for dnsChallenge resolvers.
          </p>
        </div>
      )}
    </div>
  );
}
