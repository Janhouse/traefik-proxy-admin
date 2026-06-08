"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Shield, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SecurityConfigCard,
  type EditableConfig,
  type SaveState,
} from "@/components/security-config-card";
import type { SecurityConfig, SecurityType } from "@/lib/dto/service-security.dto";
import type { BasicAuthConfig } from "@/components/basic-auth-config-table";

interface ServiceSecurityListProps {
  serviceId: string;
  serviceName: string;
  className?: string;
}

type Item = {
  _key: string;
  _save: SaveState;
  id?: string;
  type: SecurityType;
  isEnabled: boolean;
  priority: number;
  config: Record<string, unknown>;
};

function defaultConfig(type: SecurityType): Record<string, unknown> {
  if (type === "shared_link")
    return { expiresInHours: 24, sessionDurationMinutes: 60 };
  if (type === "sso") return { groups: [], users: [] };
  return { basicAuthConfigId: "" };
}

function isValid(it: Item): boolean {
  if (it.type === "basic_auth") return !!it.config.basicAuthConfigId;
  return true;
}

export function ServiceSecurityList({
  serviceId,
  className,
}: ServiceSecurityListProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [basicAuthConfigs, setBasicAuthConfigs] = useState<BasicAuthConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const itemsRef = useRef<Item[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const tmpSeq = useRef(0);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const setSave = useCallback((key: string, s: SaveState) => {
    setItems((prev) =>
      prev.map((it) => (it._key === key ? { ...it, _save: s } : it))
    );
  }, []);

  const updateItem = useCallback((key: string, patch: Partial<Item>) => {
    setItems((prev) =>
      prev.map((it) => (it._key === key ? { ...it, ...patch } : it))
    );
  }, []);

  const persist = useCallback(
    async (key: string) => {
      const it = itemsRef.current.find((x) => x._key === key);
      if (!it) return;
      if (!isValid(it)) {
        setSave(key, "draft");
        return;
      }
      setSave(key, "saving");
      try {
        if (it.id) {
          const res = await fetch(`/api/services/security-configs/${it.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              isEnabled: it.isEnabled,
              priority: it.priority,
              config: it.config,
            }),
          });
          if (!res.ok) throw new Error(`${res.status}`);
        } else {
          const res = await fetch(`/api/services/${serviceId}/security-configs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serviceId,
              securityType: it.type,
              isEnabled: it.isEnabled,
              priority: it.priority,
              config: it.config,
            }),
          });
          if (!res.ok) throw new Error(`${res.status}`);
          const created = await res.json();
          updateItem(key, { id: created.id });
        }
        setSave(key, "saved");
        setError(null);
      } catch {
        setSave(key, "draft");
        setError("Failed to save a configuration — check the values and retry.");
      }
    },
    [serviceId, setSave, updateItem]
  );

  const scheduleSave = useCallback(
    (key: string, delay: number) => {
      setSave(key, "saving");
      if (timers.current[key]) clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => void persist(key), delay);
    },
    [persist, setSave]
  );

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, baRes] = await Promise.all([
        fetch(`/api/services/${serviceId}/security-configs`),
        fetch(`/api/security/basic-auth-configs`),
      ]);
      if (!cfgRes.ok) throw new Error(`Failed to load: ${cfgRes.status}`);
      const data: (SecurityConfig & { id: string })[] = await cfgRes.json();
      const sorted = [...data].sort((a, b) => b.priority - a.priority);
      setItems(
        sorted.map((c) => ({
          _key: c.id,
          _save: "saved" as SaveState,
          id: c.id,
          type: c.type,
          isEnabled: c.isEnabled,
          priority: c.priority,
          config: c.config as unknown as Record<string, unknown>,
        }))
      );
      if (baRes.ok) setBasicAuthConfigs(await baRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const addConfig = useCallback(() => {
    const used = new Set(itemsRef.current.map((i) => i.type));
    let type: SecurityType = "shared_link";
    if (used.has("shared_link")) type = used.has("sso") ? "basic_auth" : "sso";
    const priority = itemsRef.current.length
      ? Math.max(...itemsRef.current.map((i) => i.priority)) + 1
      : 10;
    const key = `new-${tmpSeq.current++}`;
    const item: Item = {
      _key: key,
      _save: "draft",
      type,
      isEnabled: true,
      priority,
      config: defaultConfig(type),
    };
    setItems((prev) => [item, ...prev]);
    setOpenKeys((prev) => new Set(prev).add(key));
    if (type !== "basic_auth") scheduleSave(key, 800);
  }, [scheduleSave]);

  const toggleOpen = useCallback((key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const changeType = useCallback(
    (key: string, type: SecurityType) => {
      // Traefik's securityType is immutable, so switching type recreates the
      // rule: drop the previously persisted config and re-create with the new
      // type (same priority) once it is valid.
      const it = itemsRef.current.find((x) => x._key === key);
      const oldId = it?.id;
      updateItem(key, { type, config: defaultConfig(type), id: undefined });
      if (oldId) {
        fetch(`/api/services/security-configs/${oldId}`, {
          method: "DELETE",
        }).catch(() => {});
      }
      scheduleSave(key, type === "basic_auth" ? 0 : 400);
    },
    [scheduleSave, updateItem]
  );

  const changeConfig = useCallback(
    (key: string, config: Record<string, unknown>) => {
      updateItem(key, { config });
      scheduleSave(key, 600);
    },
    [scheduleSave, updateItem]
  );

  const toggleEnabled = useCallback(
    (key: string, enabled: boolean) => {
      updateItem(key, { isEnabled: enabled });
      scheduleSave(key, 0);
    },
    [scheduleSave, updateItem]
  );

  const deleteConfig = useCallback(
    async (key: string) => {
      if (timers.current[key]) clearTimeout(timers.current[key]);
      const it = itemsRef.current.find((x) => x._key === key);
      setItems((prev) => prev.filter((x) => x._key !== key));
      if (it?.id) {
        try {
          await fetch(`/api/services/security-configs/${it.id}`, {
            method: "DELETE",
          });
        } catch {
          setError("Failed to delete a configuration.");
          fetchConfigs();
        }
      }
    },
    [fetchConfigs]
  );

  return (
    <div className={cn("space-y-3.5", className)}>
      <div className="sec-head">
        <span className="ic">
          <Shield className="h-[17px] w-[17px]" />
        </span>
        <div>
          <h2 className="flex items-center gap-2">
            Security Configurations
            <span className="count">{items.length}</span>
          </h2>
          <div className="sub">
            Each rule is a Traefik middleware on this router. Disabled rules are
            skipped.
          </div>
        </div>
        <div className="right">
          <Button
            className="btn-brand"
            size="sm"
            onClick={addConfig}
            disabled={loading}
          >
            <Plus className="h-4 w-4" />
            Add configuration
          </Button>
        </div>
      </div>

      {error && (
        <div className="callout danger">
          <AlertCircle className="ico h-4 w-4" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading configurations…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="sec-empty">
          <div className="ei">
            <Shield />
          </div>
          <h3>No security rules</h3>
          <p>
            This service is reachable by anyone who can resolve its hostname. Add
            a configuration to require authentication.
          </p>
          <Button className="btn-brand" onClick={addConfig}>
            <Plus className="h-4 w-4" />
            Add configuration
          </Button>
        </div>
      ) : (
        <div className="sec-list">
          {items.map((it) => {
            const usedSingletons = items
              .filter(
                (x) =>
                  x._key !== it._key &&
                  (x.type === "sso" || x.type === "shared_link")
              )
              .map((x) => x.type);
            return (
              <SecurityConfigCard
                key={it._key}
                config={it as unknown as EditableConfig}
                open={openKeys.has(it._key)}
                saveState={it._save}
                canSwitchType
                disabledTypes={usedSingletons}
                basicAuthConfigs={basicAuthConfigs}
                onToggleOpen={() => toggleOpen(it._key)}
                onChangeType={(t) => changeType(it._key, t)}
                onChangeConfig={(config) => changeConfig(it._key, config)}
                onToggleEnabled={(enabled) => toggleEnabled(it._key, enabled)}
                onDelete={() => deleteConfig(it._key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
