"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Minus } from "lucide-react";
import type {
  AcmeChallenge,
  ManagedCertResolver,
  ManagedSecretEdits,
} from "@/lib/managed-traefik-types";
import { DNS_PROVIDERS, findDnsProvider } from "@/lib/dns-providers";
import { pendingValue, setValue } from "@/lib/managed-secret-edits";

interface ManagedResolversEditorProps {
  value: ManagedCertResolver[];
  onChange: (resolvers: ManagedCertResolver[]) => void;
  /** Managed entrypoint names — options for the httpChallenge entrypoint. */
  entrypointNames: string[];
  /** Stored credential names (values never reach the client). */
  secretNames: string[];
  secretEdits: ManagedSecretEdits;
  onSecretEditsChange: (edits: ManagedSecretEdits) => void;
  disabled?: boolean;
}

const CHALLENGE_LABELS: Record<AcmeChallenge, string> = {
  tlsChallenge: "TLS challenge (default)",
  httpChallenge: "HTTP challenge (port 80)",
  dnsChallenge: "DNS challenge (wildcards)",
};

const OTHER_PROVIDER = "__other__";

export function ManagedResolversEditor({
  value,
  onChange,
  entrypointNames,
  secretNames,
  secretEdits,
  onSecretEditsChange,
  disabled,
}: ManagedResolversEditorProps) {
  const update = (index: number, patch: Partial<ManagedCertResolver>) =>
    onChange(value.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () =>
    onChange([...value, { name: "", email: "", challenge: "tlsChallenge" }]);

  const challengePatch = (challenge: AcmeChallenge): Partial<ManagedCertResolver> => ({
    challenge,
    httpChallengeEntrypoint:
      challenge === "httpChallenge" ? entrypointNames[0] : undefined,
    ...(challenge !== "dnsChallenge" && { dnsProvider: undefined }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Certificate resolvers</p>
          <p className="text-[12px] text-[var(--meta)]">
            ACME accounts Traefik uses to obtain certificates. Storage is
            per-resolver under /data.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
          <Plus className="mr-1 h-3 w-3" />
          Add resolver
        </Button>
      </div>

      {value.map((resolver, index) => {
        // dnsProvider: undefined = nothing picked yet, "" = "Other" picked
        // (awaiting a custom code), otherwise a lego provider code.
        const known = findDnsProvider(resolver.dnsProvider);
        const providerSelectValue =
          resolver.dnsProvider === undefined ? "" : known ? known.code : OTHER_PROVIDER;

        return (
          <div
            key={index}
            className="relative space-y-3 rounded-[var(--radius-sm)] border border-[var(--border-soft)] bg-[var(--surface-2)] p-3"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2"
              aria-label={`Remove resolver ${resolver.name || index + 1}`}
              onClick={() => remove(index)}
              disabled={disabled}
            >
              <Minus className="h-3 w-3" />
            </Button>

            <div className="grid grid-cols-1 gap-3 pr-8 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`cr-name-${index}`}>Name</Label>
                <Input
                  id={`cr-name-${index}`}
                  value={resolver.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                  placeholder="letsencrypt"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`cr-email-${index}`}>ACME email</Label>
                <Input
                  id={`cr-email-${index}`}
                  type="email"
                  value={resolver.email}
                  onChange={(e) => update(index, { email: e.target.value })}
                  placeholder="you@example.com"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`cr-challenge-${index}`}>Challenge</Label>
                <Select
                  value={resolver.challenge}
                  onValueChange={(v) => {
                    // Ignore spurious empty-string events from the Select component
                    if (v === "") return;
                    update(index, challengePatch(v as AcmeChallenge));
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger id={`cr-challenge-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CHALLENGE_LABELS) as AcmeChallenge[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CHALLENGE_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {resolver.challenge === "httpChallenge" && (
              <div className="max-w-[280px] space-y-1.5">
                <Label htmlFor={`cr-http-ep-${index}`}>Challenge entrypoint</Label>
                <Select
                  value={resolver.httpChallengeEntrypoint || ""}
                  onValueChange={(v) => {
                    if (v === "") return;
                    update(index, { httpChallengeEntrypoint: v });
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger id={`cr-http-ep-${index}`}>
                    <SelectValue placeholder="Pick the :80 entrypoint" />
                  </SelectTrigger>
                  <SelectContent>
                    {entrypointNames
                      .filter((n) => n)
                      .map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {resolver.challenge === "dnsChallenge" && (
              <div className="space-y-3">
                <div className="max-w-[320px] space-y-1.5">
                  <Label htmlFor={`cr-dns-${index}`}>DNS provider</Label>
                  <Select
                    value={providerSelectValue}
                    onValueChange={(v) => {
                      if (v === "") return;
                      update(index, {
                        dnsProvider: v === OTHER_PROVIDER ? "" : v,
                      });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger id={`cr-dns-${index}`}>
                      <SelectValue placeholder="Choose a provider…" />
                    </SelectTrigger>
                    <SelectContent>
                      {DNS_PROVIDERS.map((p) => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={OTHER_PROVIDER}>Other (custom)…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {providerSelectValue === OTHER_PROVIDER && (
                  <div className="max-w-[320px] space-y-1.5">
                    <Label htmlFor={`cr-dns-code-${index}`}>Provider code</Label>
                    <Input
                      id={`cr-dns-code-${index}`}
                      className="mono"
                      value={resolver.dnsProvider || ""}
                      onChange={(e) => update(index, { dnsProvider: e.target.value })}
                      placeholder="e.g. exoscale"
                      disabled={disabled}
                    />
                    <p className="text-[12px] text-[var(--meta)]">
                      Use the lego provider code. Add its environment variables
                      under{" "}
                      <span className="font-medium text-foreground">
                        DNS provider credentials
                      </span>{" "}
                      below.
                    </p>
                  </div>
                )}

                {known && (
                  <div className="space-y-2">
                    <p className="text-[12px] text-[var(--meta)]">
                      {known.name} credentials — stored write-only and encrypted;
                      injected into Traefik on restart.
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {known.fields.map((f) => {
                        const stored = secretNames.includes(f.env);
                        const draft = pendingValue(secretEdits, f.env);
                        return (
                          <div key={f.env} className="space-y-1.5">
                            <Label htmlFor={`sec-${index}-${f.env}`}>
                              {f.label}
                              {f.required && (
                                <span className="text-[var(--danger)]"> *</span>
                              )}
                              <span className="mono ml-1.5 text-[11px] text-[var(--meta)]">
                                {f.env}
                              </span>
                            </Label>
                            <Input
                              id={`sec-${index}-${f.env}`}
                              type="password"
                              autoComplete="off"
                              value={draft ?? ""}
                              placeholder={
                                stored
                                  ? "•••• set — type to replace"
                                  : f.required
                                    ? "required"
                                    : "optional"
                              }
                              onChange={(e) =>
                                onSecretEditsChange(
                                  setValue(secretEdits, f.env, e.target.value)
                                )
                              }
                              disabled={disabled}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {value.length === 0 && (
        <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-soft)] py-6 text-center text-muted-foreground">
          <p className="text-sm">No resolvers — HTTPS services need at least one.</p>
        </div>
      )}
    </div>
  );
}
