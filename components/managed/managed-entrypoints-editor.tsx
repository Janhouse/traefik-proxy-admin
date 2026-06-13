"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Minus } from "lucide-react";
import type { ManagedEntrypoint } from "@/lib/managed-traefik-types";

interface ManagedEntrypointsEditorProps {
  value: ManagedEntrypoint[];
  onChange: (entrypoints: ManagedEntrypoint[]) => void;
  /** Resolver names defined in THIS managed config — the only valid choices
   * for an entrypoint's default certificate resolver. */
  resolverNames: string[];
  disabled?: boolean;
}

const NO_REDIRECT = "none";
const NO_RESOLVER = "__none__";

export function ManagedEntrypointsEditor({
  value,
  onChange,
  resolverNames,
  disabled,
}: ManagedEntrypointsEditorProps) {
  const update = (index: number, patch: Partial<ManagedEntrypoint>) =>
    onChange(value.map((ep, i) => (i === index ? { ...ep, ...patch } : ep)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { name: "", port: 0 }]);

  // Toggling TLS nudges the canonical port pair (unset/80 ↔ 443); a custom
  // port (e.g. 8443) is left untouched.
  const toggleTls = (index: number, ep: ManagedEntrypoint, enabled: boolean) => {
    const port = enabled
      ? !ep.port || ep.port === 80
        ? 443
        : ep.port
      : ep.port === 443
        ? 80
        : ep.port;
    update(index, {
      port,
      tls: enabled ? { enabled: true, certResolver: ep.tls?.certResolver } : null,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Entrypoints</p>
          <p className="text-[12px] text-[var(--meta)]">
            Ports Traefik listens on. Renaming one does not update services that
            reference the old name.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
          <Plus className="mr-1 h-3 w-3" />
          Add entrypoint
        </Button>
      </div>

      {value.map((ep, index) => (
        <div
          key={index}
          className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--border-soft)] bg-[var(--surface-2)] p-3"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`ep-name-${index}`}>Name</Label>
              <Input
                id={`ep-name-${index}`}
                value={ep.name}
                onChange={(e) => update(index, { name: e.target.value })}
                placeholder="websecure"
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ep-port-${index}`}>Port</Label>
              <Input
                id={`ep-port-${index}`}
                type="number"
                min={1}
                max={65535}
                value={ep.port || ""}
                onChange={(e) => {
                  const port = parseInt(e.target.value, 10);
                  update(index, { port: Number.isNaN(port) ? 0 : port });
                }}
                placeholder={ep.tls?.enabled ? "443" : "80"}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ep-redirect-${index}`}>Redirect to</Label>
              <Select
                value={ep.redirectToEntrypoint || NO_REDIRECT}
                onValueChange={(v) => {
                  // Ignore spurious empty-string events from the Select component
                  if (v === "") return;
                  update(index, {
                    redirectToEntrypoint: v === NO_REDIRECT ? null : v,
                  });
                }}
                disabled={disabled}
              >
                <SelectTrigger id={`ep-redirect-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_REDIRECT}>No redirect</SelectItem>
                  {value
                    .filter((o) => o.name && o.name !== ep.name)
                    .map((o) => (
                      <SelectItem key={o.name} value={o.name}>
                        → {o.name} (https)
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-1 items-end gap-3">
              <div className="flex h-9 items-center gap-2">
                <Switch
                  id={`ep-tls-${index}`}
                  checked={!!ep.tls?.enabled}
                  onCheckedChange={(enabled) => toggleTls(index, ep, enabled)}
                  disabled={disabled}
                />
                <Label htmlFor={`ep-tls-${index}`}>TLS by default</Label>
              </div>
              {ep.tls?.enabled && (
                <div className="max-w-[280px] flex-1 space-y-1.5">
                  <Label htmlFor={`ep-resolver-${index}`}>Certificate resolver</Label>
                  <Select
                    value={ep.tls.certResolver || NO_RESOLVER}
                    onValueChange={(v) => {
                      // Ignore spurious empty-string events from the Select component
                      if (v === "") return;
                      update(index, {
                        tls: {
                          enabled: true,
                          certResolver: v === NO_RESOLVER ? undefined : v,
                        },
                      });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger id={`ep-resolver-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_RESOLVER}>
                        No automatic certificate
                      </SelectItem>
                      {resolverNames
                        .filter(Boolean)
                        .map((n) => (
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
                        ))}
                      {ep.tls.certResolver &&
                        !resolverNames.includes(ep.tls.certResolver) && (
                          <SelectItem value={ep.tls.certResolver}>
                            {ep.tls.certResolver} (not defined)
                          </SelectItem>
                        )}
                    </SelectContent>
                  </Select>
                  {resolverNames.length === 0 && (
                    <p className="text-[12px] text-[var(--meta)]">
                      Define a resolver below, then pick it here — or leave it on
                      &ldquo;No automatic certificate&rdquo; to serve a default cert.
                    </p>
                  )}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove entrypoint ${ep.name || index + 1}`}
              onClick={() => remove(index)}
              disabled={disabled}
            >
              <Minus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      {value.length === 0 && (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-soft)] py-6 text-center text-muted-foreground">
          <p className="text-sm">No entrypoints — Traefik needs at least one.</p>
        </div>
      )}
    </div>
  );
}
