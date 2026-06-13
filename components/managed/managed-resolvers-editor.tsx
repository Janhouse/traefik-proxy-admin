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
} from "@/lib/managed-traefik-types";

interface ManagedResolversEditorProps {
  value: ManagedCertResolver[];
  onChange: (resolvers: ManagedCertResolver[]) => void;
  /** Managed entrypoint names — options for the httpChallenge entrypoint. */
  entrypointNames: string[];
  disabled?: boolean;
}

const CHALLENGE_LABELS: Record<AcmeChallenge, string> = {
  tlsChallenge: "TLS challenge (default)",
  httpChallenge: "HTTP challenge (port 80)",
  dnsChallenge: "DNS challenge (wildcards)",
};

export function ManagedResolversEditor({
  value,
  onChange,
  entrypointNames,
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

      {value.map((resolver, index) => (
        <div
          key={index}
          className="space-y-3 rounded-[var(--radius-sm)] border border-[var(--border-soft)] bg-[var(--surface-2)] p-3"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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

          <div className="flex items-end justify-between gap-3">
            <div className="max-w-[280px] flex-1">
              {resolver.challenge === "httpChallenge" && (
                <div className="space-y-1.5">
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
                <div className="space-y-1.5">
                  <Label htmlFor={`cr-dns-${index}`}>DNS provider</Label>
                  <Input
                    id={`cr-dns-${index}`}
                    value={resolver.dnsProvider || ""}
                    onChange={(e) => update(index, { dnsProvider: e.target.value })}
                    placeholder="cloudflare"
                    disabled={disabled}
                  />
                  <p className="text-[12px] text-[var(--meta)]">
                    Set this provider&apos;s API credentials below under{" "}
                    <span className="font-medium text-foreground">
                      DNS provider credentials
                    </span>{" "}
                    — no need to edit the compose file.
                  </p>
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remove resolver ${resolver.name || index + 1}`}
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
          <p className="text-sm">No resolvers — HTTPS services need at least one.</p>
        </div>
      )}
    </div>
  );
}
