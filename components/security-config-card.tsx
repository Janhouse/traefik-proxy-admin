"use client";

import { useState } from "react";
import NextLink from "next/link";
import {
  Users,
  Link2,
  KeyRound,
  ChevronDown,
  Trash2,
  Check,
  Loader2,
  Info,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/traefik/status-badge";
import type { SecurityConfig, SecurityType } from "@/lib/dto/service-security.dto";
import type { BasicAuthConfig } from "@/components/basic-auth-config-table";

export type EditableConfig = SecurityConfig & { id?: string };
export type SaveState = "idle" | "saving" | "saved" | "draft";

const TYPES: { key: SecurityType; label: string; desc: string }[] = [
  { key: "sso", label: "SSO Authentication", desc: "Single Sign-On (forward-auth)" },
  { key: "shared_link", label: "Shared Link", desc: "Time-limited access links" },
  { key: "basic_auth", label: "Basic Authentication", desc: "Username & password" },
];

const CALLOUTS: Record<SecurityType, React.ReactNode> = {
  sso: (
    <>
      Requests are verified against your identity provider through Traefik&rsquo;s{" "}
      <code>forwardAuth</code> middleware before they ever reach the backend.
    </>
  ),
  shared_link: (
    <>
      Users reach this service through time-limited links without signing in. A
      link stops working once its expiry window elapses.
    </>
  ),
  basic_auth: (
    <>
      Traefik prompts for a username and password (HTTP Basic Auth) using the
      selected global config&rsquo;s users (bcrypt <code>htpasswd</code>).
    </>
  ),
};

function TypeIcon({ t, className }: { t: SecurityType; className?: string }) {
  if (t === "sso") return <Users className={className} />;
  if (t === "shared_link") return <Link2 className={className} />;
  return <KeyRound className={className} />;
}
const typeLabel = (t: SecurityType) =>
  TYPES.find((x) => x.key === t)?.label ?? t;

function summary(c: EditableConfig, baList: BasicAuthConfig[]): string {
  if (c.type === "sso") {
    const g = c.config.groups.length;
    const u = c.config.users.length;
    if (!g && !u) return "any authenticated user";
    const parts: string[] = [];
    if (g) parts.push(`${g} group${g === 1 ? "" : "s"}`);
    if (u) parts.push(`${u} user${u === 1 ? "" : "s"}`);
    return parts.join(" · ");
  }
  if (c.type === "shared_link")
    return `expires ${c.config.expiresInHours}h · session ${c.config.sessionDurationMinutes}m`;
  const name = baList.find((b) => b.id === c.config.basicAuthConfigId)?.name;
  return name ? `config “${name}”` : "no config selected";
}

/** Inline chip editor (groups / users). */
function ChipList({
  values,
  placeholder,
  onAdd,
  onRemove,
}: {
  values: string[];
  placeholder: string;
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="tags">
      {values.map((g, i) => (
        <span className="tag" key={`${g}-${i}`}>
          {g}
          <button
            type="button"
            className="rm"
            onClick={() => onRemove(i)}
            aria-label={`Remove ${g}`}
          >
            <X />
          </button>
        </span>
      ))}
      <input
        className="tag-input"
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const v = draft.trim();
            if (v) {
              onAdd(v);
              setDraft("");
            }
          }
        }}
      />
    </div>
  );
}

interface SecurityConfigCardProps {
  config: EditableConfig;
  open: boolean;
  saveState: SaveState;
  /** type is selectable only before the rule is first persisted */
  canSwitchType: boolean;
  /** singleton types already used by other rules (disabled in the picker) */
  disabledTypes: SecurityType[];
  basicAuthConfigs: BasicAuthConfig[];
  onToggleOpen: () => void;
  onChangeType: (t: SecurityType) => void;
  onChangeConfig: (config: Record<string, unknown>) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onDelete: () => void;
}

export function SecurityConfigCard({
  config: c,
  open,
  saveState,
  canSwitchType,
  disabledTypes,
  basicAuthConfigs,
  onToggleOpen,
  onChangeType,
  onChangeConfig,
  onToggleEnabled,
  onDelete,
}: SecurityConfigCardProps) {
  return (
    <div className={`sec-cfg ${open ? "open" : ""} ${c.isEnabled ? "" : "off"}`}>
      <div
        className="sec-cfg-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleOpen();
          }
        }}
      >
        <span className="sec-cfg-ic">
          <TypeIcon t={c.type} />
        </span>
        <div className="sec-cfg-meta">
          <div className="t">
            {typeLabel(c.type)} <StatusBadge enabled={c.isEnabled} />
          </div>
          <div className="s">{summary(c, basicAuthConfigs)}</div>
        </div>
        <div className="sec-cfg-state">
          <ChevronDown className="sec-chev" />
        </div>
      </div>

      <div className="sec-cfg-body">
        <div className="sec-cfg-inner">
          <div className="sec-cfg-pad">
            <label className="text-[13px] font-semibold">Security type</label>
            <div className="sec-typeseg">
              {TYPES.map((t) => {
                const isCur = t.key === c.type;
                const disabled =
                  !isCur && (!canSwitchType || disabledTypes.includes(t.key));
                return (
                  <button
                    type="button"
                    key={t.key}
                    className={isCur ? "on" : ""}
                    disabled={disabled}
                    title={
                      !isCur && !canSwitchType
                        ? "Type is set when the rule is created"
                        : undefined
                    }
                    onClick={() => !isCur && onChangeType(t.key)}
                  >
                    <span className="si">
                      <TypeIcon t={t.key} />
                    </span>
                    <span>
                      <span className="sn">{t.label}</span>
                      <span className="sd">{t.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="sec-toggle">
              <div>
                <div className="tt">Configuration enabled</div>
                <div className="td">
                  Disabled configurations are ignored by Traefik.
                </div>
              </div>
              <Switch checked={c.isEnabled} onCheckedChange={onToggleEnabled} />
            </div>

            {/* type-specific fields */}
            {c.type === "sso" && (
              <div className="sec-fields">
                <div className="field full">
                  <label>Allowed groups</label>
                  <ChipList
                    values={c.config.groups}
                    placeholder="Add group…"
                    onAdd={(g) =>
                      onChangeConfig({
                        ...c.config,
                        groups: [...c.config.groups, g],
                      })
                    }
                    onRemove={(i) =>
                      onChangeConfig({
                        ...c.config,
                        groups: c.config.groups.filter((_, j) => j !== i),
                      })
                    }
                  />
                  <span className="hint">
                    Only members of these IdP groups may pass. Leave empty to
                    allow any authenticated user.
                  </span>
                </div>
                <div className="field full">
                  <label>Allowed users</label>
                  <ChipList
                    values={c.config.users}
                    placeholder="Add user…"
                    onAdd={(u) =>
                      onChangeConfig({
                        ...c.config,
                        users: [...c.config.users, u],
                      })
                    }
                    onRemove={(i) =>
                      onChangeConfig({
                        ...c.config,
                        users: c.config.users.filter((_, j) => j !== i),
                      })
                    }
                  />
                  <span className="hint">
                    Restrict to specific usernames. Leave empty to allow any
                    matching group.
                  </span>
                </div>
              </div>
            )}

            {c.type === "shared_link" && (
              <div className="sec-fields">
                <div className="field">
                  <label>Link expires in (hours)</label>
                  <Input
                    type="number"
                    min={1}
                    className="font-mono"
                    value={c.config.expiresInHours}
                    onChange={(e) =>
                      onChangeConfig({
                        ...c.config,
                        expiresInHours: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Session duration (minutes)</label>
                  <Input
                    type="number"
                    min={1}
                    className="font-mono"
                    value={c.config.sessionDurationMinutes}
                    onChange={(e) =>
                      onChangeConfig({
                        ...c.config,
                        sessionDurationMinutes: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                </div>
              </div>
            )}

            {c.type === "basic_auth" && (
              <div className="sec-fields">
                <div className="field full">
                  <label>Basic-auth config</label>
                  <Select
                    value={c.config.basicAuthConfigId || ""}
                    onValueChange={(v) => {
                      if (v) onChangeConfig({ basicAuthConfigId: v });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a configuration" />
                    </SelectTrigger>
                    <SelectContent>
                      {basicAuthConfigs.length === 0 ? (
                        <div className="p-2 text-center text-sm text-muted-foreground">
                          No configurations available
                        </div>
                      ) : (
                        basicAuthConfigs.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                            {b.description ? ` — ${b.description}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <span className="hint">
                    Credentials live in a global config —{" "}
                    <NextLink
                      href="/security"
                      className="text-[var(--brand)] underline hover:no-underline"
                    >
                      manage basic-auth configs →
                    </NextLink>
                    {basicAuthConfigs.length === 0 &&
                      " (none yet; create one there first)"}
                  </span>
                </div>
              </div>
            )}

            <div className="callout info mt-4">
              <Info className="ico" />
              <div>
                <p>{CALLOUTS[c.type]}</p>
              </div>
            </div>

            <div className="sec-cfg-foot">
              <ConfirmDialog
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[var(--danger)] hover:text-[var(--danger)]"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                }
                title="Delete configuration"
                description="Remove this security rule? This cannot be undone."
                confirmText="Delete"
                onConfirm={onDelete}
                variant="destructive"
              />
              <span className="grow" />
              {saveState === "saving" ? (
                <span className="saved">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </span>
              ) : saveState === "draft" ? (
                <span className="saved">Unsaved — complete the fields above</span>
              ) : (
                <span className="saved ok">
                  <Check />
                  Saved automatically
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
