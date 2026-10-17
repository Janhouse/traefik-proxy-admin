"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/toaster";
import { SHARE_AUTH_MODES, type ShareAuthMode } from "@/lib/harness/constants";
import type { HarnessSettings } from "@/lib/harness/settings-schema";

/* Comma-separated text <-> string[] for the list inputs. */
const toList = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

interface ZoneDraft {
  suffix: string;
  authModes: ShareAuthMode[];
  entrypoints: string;
  middlewares: string;
}

export function SettingsSection() {
  const [zones, setZones] = useState<ZoneDraft[]>([]);
  const [onlyMe, setOnlyMe] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((s: HarnessSettings) => {
    setZones(
      s.zones.map((z) => ({
        suffix: z.suffix,
        authModes: z.authModes,
        entrypoints: z.entrypoints.join(", "),
        middlewares: z.middlewares.join(", "),
      }))
    );
    setOnlyMe(s.onlyMeMiddlewares.join(", "));
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/harness/settings", { cache: "no-store" });
      if (res.ok) apply(await res.json());
      setLoaded(true);
    })();
  }, [apply]);

  const update = (i: number, patch: Partial<ZoneDraft>) =>
    setZones((prev) => prev.map((z, j) => (j === i ? { ...z, ...patch } : z)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: HarnessSettings = {
        zones: zones.map((z) => ({
          suffix: z.suffix.trim().toLowerCase(),
          authModes: z.authModes,
          entrypoints: toList(z.entrypoints),
          middlewares: toList(z.middlewares),
        })),
        onlyMeMiddlewares: toList(onlyMe),
      };
      const res = await fetch("/api/admin/harness/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Failed to save");
        return;
      }
      apply(result);
      toast("Harness settings saved");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading settings…</p>;

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {zones.map((zone, i) => (
        <div
          key={i}
          className="grid gap-3 rounded-[var(--radius-sm)] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4 md:grid-cols-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor={`zone-suffix-${i}`}>Hostname suffix</Label>
            <Input
              id={`zone-suffix-${i}`}
              value={zone.suffix}
              onChange={(e) => update(i, { suffix: e.target.value })}
              placeholder="e.example.com"
              className="font-mono"
            />
            <p className="text-[12px] text-[var(--meta)]">
              A domain with exactly this name must exist (its edge decides which Traefik serves it).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Allowed access modes</Label>
            <div className="flex flex-wrap gap-4 pt-1">
              {SHARE_AUTH_MODES.map((mode) => (
                <label key={mode} className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={zone.authModes.includes(mode)}
                    onCheckedChange={(on) =>
                      update(i, {
                        authModes: on
                          ? [...new Set([...zone.authModes, mode])]
                          : zone.authModes.filter((m) => m !== mode),
                      })
                    }
                    aria-label={`${zone.suffix || "zone"} ${mode}`}
                  />
                  <span className="font-mono">{mode}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`zone-eps-${i}`}>Entrypoints</Label>
            <Input
              id={`zone-eps-${i}`}
              value={zone.entrypoints}
              onChange={(e) => update(i, { entrypoints: e.target.value })}
              placeholder="websecure"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`zone-mws-${i}`}>Extra middlewares</Label>
            <div className="flex gap-2">
              <Input
                id={`zone-mws-${i}`}
                value={zone.middlewares}
                onChange={(e) => update(i, { middlewares: e.target.value })}
                placeholder="hsts@file"
                className="font-mono"
              />
              <Button
                type="button"
                variant="ghost"
                aria-label="Remove zone"
                onClick={() => setZones((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4 text-[var(--danger)]" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setZones((prev) => [
            ...prev,
            { suffix: "", authModes: ["network"], entrypoints: "websecure", middlewares: "" },
          ])
        }
      >
        <Plus className="mr-2 h-4 w-4" />
        Add zone
      </Button>

      <div className="space-y-1.5">
        <Label htmlFor="only-me">&quot;Only me&quot; middlewares</Label>
        <Input
          id="only-me"
          value={onlyMe}
          onChange={(e) => setOnlyMe(e.target.value)}
          placeholder="auth-authentik@file"
          className="font-mono"
        />
        <p className="text-[12px] text-[var(--meta)]">
          Forward-auth middleware(s) added to only-me shares. Leave empty to refuse only-me shares.
          Comma-separated lists everywhere.
        </p>
      </div>

      <div className="flex justify-end">
        <Button className="btn-brand" onClick={() => void save()} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          Save settings
        </Button>
      </div>
    </div>
  );
}
