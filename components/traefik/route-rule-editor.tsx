"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextLink from "next/link";
import {
  Plus,
  X,
  ChevronDown,
  Check,
  Globe,
  Copy,
  AlertTriangle,
  GripVertical,
  Group as GroupIcon,
  Ungroup as UngroupIcon,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouteConflicts } from "@/hooks/use-traefik";
import { EntrypointSelect } from "@/components/traefik/entrypoint-select";
import { toast } from "@/components/toaster";
import {
  MATCHER_TYPES,
  METHODS,
  UI_MAX_GROUP_DEPTH,
  matcherDef,
  assembleRuleFromTree,
  resolveHostValue,
  hostsInTree,
  firstHostNode,
  treeHasHost,
  tokenizeRule,
  isGroup,
  updateNode,
  removeNode,
  insertNode,
  ungroupNode,
  countMatchers,
  type DomainResolver,
  type MatchRule,
  type MatchType,
  type RuleGroup,
  type RuleNode,
  type NodePath,
  type HostnameMode,
} from "@/lib/route-rule";
import {
  applyDrop,
  containerChildren,
  containerId,
  itemId,
  parseDndId,
} from "@/lib/route-rule-dnd";
import {
  defaultDomainIdOf,
  legacyHostTree,
  type DomainLite,
} from "@/hooks/host-tree";

interface RouteRuleValue {
  domainId: string;
  subdomain: string | null;
  hostnameMode: HostnameMode;
  /** Resolved hostnames of the whole tree when the first Host rule is
   * free-text ("custom" mode); null for domain-backed primaries. */
  customHostnames: string[] | null;
  entrypoints: string[];
  matchRules: RuleNode[];
}

interface RouteRuleInitial {
  domainId: string;
  subdomain: string;
  hostnameMode: HostnameMode;
  customHostnames?: string | null;
  entrypoints: string[];
  matchRules: RuleNode[];
}

interface RouteRuleEditorProps {
  initial: RouteRuleInitial;
  domains: DomainLite[];
  serviceId?: string;
  onChange: (v: RouteRuleValue) => void;
  onBlockedChange?: (blocked: boolean) => void;
  disabled?: boolean;
}

function newMatcher(type: MatchType, defaultDomainId: string): MatchRule {
  if (type === "Host") {
    // domain-backed Host row: default domain preselected, empty subdomain
    return { type, conn: "OR", domainId: defaultDomainId, sub: "" };
  }
  return { type, conn: "AND", value: "", key: "", method: "GET" };
}

/** Best-effort split of a free-text hostname against the managed domains. */
function domainBackedPatch(
  value: string,
  domains: DomainLite[],
  defaultDomainId: string
): Partial<MatchRule> {
  const v = (value || "").replace(/`/g, "").trim();
  for (const d of domains) {
    if (v === d.domain) return { domainId: d.id, sub: "", apex: true, value: "" };
    if (v.endsWith("." + d.domain)) {
      return {
        domainId: d.id,
        sub: v.slice(0, v.length - d.domain.length - 1),
        apex: false,
        value: "",
      };
    }
  }
  return { domainId: defaultDomainId, sub: "", apex: false, value: "" };
}

export function RouteRuleEditor({
  initial,
  domains,
  serviceId,
  onChange,
  onBlockedChange,
  disabled,
}: RouteRuleEditorProps) {
  const [eps, setEps] = useState<string[]>(initial.entrypoints);
  // The tree is the single source of truth — the host lives in it as a rule.
  const [nodes, setNodes] = useState<RuleNode[]>(() => legacyHostTree(initial));
  const convertedCustom =
    initial.hostnameMode === "custom" && !treeHasHost(initial.matchRules);

  // Poll: Traefik re-reads our config every ~10s, so a stale-router conflict
  // (e.g. right after changing entrypoints) clears itself within a cycle.
  const { conflicts } = useRouteConflicts(15_000);

  const defaultDomainId = defaultDomainIdOf(domains);

  const resolveDomain = useCallback<DomainResolver>(
    (id) => domains.find((d) => d.id === id)?.domain ?? null,
    [domains]
  );

  // Backfill the default domain into Host rules created before the domain
  // list loaded (new-service initial row, rows added while loading).
  useEffect(() => {
    if (!defaultDomainId) return;
    setNodes((cur) => {
      let changed = false;
      const fill = (list: RuleNode[]): RuleNode[] =>
        list.map((n) => {
          if (isGroup(n)) {
            const children = fill(n.children);
            return children === n.children ? n : { ...n, children };
          }
          if (n.type === "Host" && n.domainId === "") {
            changed = true;
            return { ...n, domainId: defaultDomainId };
          }
          return n;
        });
      const next = fill(cur);
      return changed ? next : cur;
    });
  }, [defaultDomainId, nodes]);

  const firstHost = useMemo(() => firstHostNode(nodes), [nodes]);
  const primaryHost = firstHost ? resolveHostValue(firstHost, resolveDomain) : "";
  const resolvedHosts = useMemo(
    () => hostsInTree(nodes, resolveDomain),
    [nodes, resolveDomain]
  );
  const hostMissing = resolvedHosts.length === 0;

  // emit upward on any change — the legacy columns are DERIVED from the
  // first Host rule so every existing consumer keeps working unchanged.
  useEffect(() => {
    let derived: Pick<
      RouteRuleValue,
      "domainId" | "subdomain" | "hostnameMode" | "customHostnames"
    >;
    if (firstHost && firstHost.domainId !== undefined) {
      derived = {
        domainId: firstHost.domainId,
        hostnameMode: firstHost.apex ? "apex" : "subdomain",
        subdomain: firstHost.apex ? null : firstHost.sub || null,
        customHostnames: null,
      };
    } else if (firstHost) {
      derived = {
        domainId: initial.domainId || defaultDomainId,
        hostnameMode: "custom",
        subdomain: null,
        customHostnames: resolvedHosts,
      };
    } else {
      derived = {
        domainId: initial.domainId || defaultDomainId,
        hostnameMode: "subdomain",
        subdomain: null,
        customHostnames: null,
      };
    }
    onChange({ ...derived, entrypoints: eps, matchRules: nodes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, eps, domains]);

  const rule = useMemo(
    () => assembleRuleFromTree(nodes, resolveDomain),
    [nodes, resolveDomain]
  );
  const tokens = useMemo(() => tokenizeRule(rule), [rule]);
  // an unfilled Host still assembles as Host(``) — keep the placeholder until
  // the rule is meaningful
  const showRule = !!rule && !hostMissing;

  // conflict: ANY host in the tree claimed by another router on an
  // overlapping entrypoint. Hostnames are case-insensitive, so compare
  // lowercased on both sides.
  const conflict = (() => {
    if (!conflicts?.reachable || resolvedHosts.length === 0) return null;
    const mine = new Map(resolvedHosts.map((h) => [h.toLowerCase(), h]));
    for (const r of conflicts.routers) {
      if (r.internal) continue; // our own cert-trigger routers are not conflicts
      if (r.managedServiceId && serviceId && r.managedServiceId === serviceId)
        continue; // this service
      const hit = r.hosts.find((h) => mine.has(h.toLowerCase()));
      if (hit === undefined) continue;
      const overlap = r.entryPoints.some((e) => eps.includes(e));
      if (!overlap) continue;
      // `hostOnly`: the foreign router's rule is nothing but Host() matchers,
      // so it would collide outright. Read defensively until the API type
      // carries the field.
      const hostOnly = (r as { hostOnly?: boolean }).hostOnly === true;
      return {
        router: r,
        host: mine.get(hit.toLowerCase()) ?? hit,
        foreign: !r.managedServiceId,
        // only a foreign, host-only router blocks the save; a router with
        // extra matchers merely overlaps and gets a warning
        blocking: !r.managedServiceId && hostOnly,
      };
    }
    return null;
  })();

  const blocked = !!conflict?.blocking || hostMissing;
  useEffect(() => {
    onBlockedChange?.(blocked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  // ── tree ops (all through the pure helpers in lib/route-rule) ────────────
  const patchNode = (path: NodePath, patch: Partial<MatchRule> | Partial<RuleGroup>) =>
    setNodes((cur) => updateNode(cur, path, patch));
  const deleteNode = (path: NodePath) => setNodes((cur) => removeNode(cur, path));
  const ungroup = (path: NodePath) => setNodes((cur) => ungroupNode(cur, path));
  const addMatcherInto = (container: NodePath, type: MatchType) =>
    setNodes((cur) => {
      const list = containerChildren(cur, container);
      if (!list) return cur;
      return insertNode(
        cur,
        [...container, list.length],
        newMatcher(type, defaultDomainId)
      );
    });
  const addGroupInto = (container: NodePath) =>
    setNodes((cur) => {
      const list = containerChildren(cur, container);
      if (!list) return cur;
      return insertNode(cur, [...container, list.length], {
        kind: "group",
        conn: "AND",
        children: [],
      });
    });
  // ── drag & drop ───────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const a = parseDndId(String(active.id));
    const o = parseDndId(String(over.id));
    if (!a || a.kind !== "item" || !o) return;
    setNodes((cur) => applyDrop(cur, a.path, o));
  };

  return (
    <div className="flex flex-col gap-[18px]">
      {/* conflict banner */}
      {conflict && (
        <div
          className={`conflict ${
            conflict.blocking ? "external" : conflict.foreign ? "warn" : "managed"
          }`}
          role={conflict.blocking ? "alert" : "status"}
        >
          <span className="c-ic">
            <AlertTriangle className="h-[17px] w-[17px]" />
          </span>
          <div className="c-body">
            <div className="c-title">
              {!conflict.foreign
                ? "This rule is already managed here"
                : conflict.blocking
                  ? "Conflicts with a router outside this tool"
                  : "Overlaps with a router outside this tool"}
            </div>
            <div className="c-msg">
              <code>Host(`{conflict.host}`)</code> on{" "}
              <span className="prov-pill internal">
                {conflict.router.entryPoints
                  .filter((e) => eps.includes(e))
                  .join(", ")}
              </span>{" "}
              is already claimed by router{" "}
              <code>{conflict.router.routerName}</code>
              {!conflict.foreign
                ? " — editing here would duplicate it."
                : conflict.blocking
                  ? " defined outside the configurator — saving would collide at runtime."
                  : " defined outside the configurator. Its rule has extra matchers, so requests may be split between the two — review before saving."}
            </div>
            {!conflict.foreign ? (
              <div className="c-actions">
                <NextLink
                  className="text-[12px] font-semibold text-[var(--warn)] hover:underline"
                  href={`/services/${conflict.router.managedServiceId}`}
                >
                  View the owning service →
                </NextLink>
              </div>
            ) : (
              <div className="c-meta">
                Source{" "}
                <span className={`prov-pill ${conflict.router.provider}`}>
                  {conflict.router.provider}
                </span>{" "}
                · read-only here ·{" "}
                {conflict.blocking ? "saving is blocked" : "saving is allowed"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* match rules — the host is a first-class rule in the tree */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-[13px] font-semibold">Match rules</label>
          <div className="flex items-center gap-2">
            <AddRuleMenu
              label="Add rule"
              disabled={disabled}
              onAdd={(type) => addMatcherInto([], type)}
            />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] font-semibold hover:border-[var(--border-strong)]"
              disabled={disabled}
              onClick={() => addGroupInto([])}
            >
              <GroupIcon className="h-3.5 w-3.5" /> Add group
            </button>
          </div>
        </div>

        <DndContext
          id="route-rules"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={nodes.map((_, i) => itemId([i]))}
            strategy={verticalListSortingStrategy}
          >
            <RootDropZone disabled={disabled}>
              {nodes.map((node, i) =>
                isGroup(node) ? (
                  <GroupPanel
                    key={itemId([i])}
                    path={[i]}
                    group={node}
                    domains={domains}
                    defaultDomainId={defaultDomainId}
                    disabled={disabled}
                    hideConn={i === 0}
                    onPatch={patchNode}
                    onDelete={deleteNode}
                    onUngroup={ungroup}
                    onAddInto={addMatcherInto}
                    onAddGroupInto={addGroupInto}
                  />
                ) : (
                  <MatcherRow
                    key={itemId([i])}
                    path={[i]}
                    matcher={node}
                    domains={domains}
                    defaultDomainId={defaultDomainId}
                    disabled={disabled}
                    hideConn={i === 0}
                    autoFocusSub={!serviceId && node === firstHost}
                    onPatch={patchNode}
                    onDelete={deleteNode}
                  />
                )
              )}
            </RootDropZone>
          </SortableContext>
        </DndContext>
        {hostMissing && (
          <span className="text-[12px] font-semibold text-[var(--danger)]">
            Fill in the public hostname — the rule needs at least one Host.
          </span>
        )}
        {convertedCustom && (
          <span className="text-[12px] text-[var(--warn)]">
            Converted from custom hostnames — each hostname became a Host rule
            above. Review before saving.
          </span>
        )}
        <span className="text-[12px] text-[var(--meta)]">
          Host rules compose the public hostname from a managed domain (or a
          custom hostname); refine with path, header, query, method or
          client-IP. Drag the handles to reorder, or move rules into a group to
          build a parenthesized sub-expression. Path matchers forward the full
          path; add a stripPrefix middleware if your backend needs it.
        </span>
      </div>

      {/* rule preview + public URL */}
      <div className="rule-preview">
        <div className="rp-head">
          <span className="rp-k">Generated router rule</span>
          <button
            type="button"
            className="rp-copy"
            disabled={!showRule}
            onClick={() => {
              navigator.clipboard?.writeText(rule);
              toast("Rule copied to clipboard");
            }}
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
        <code className="rp-code">
          {showRule ? (
            tokens.map((t, i) =>
              t.t === "txt" ? (
                <span key={i}>{t.v}</span>
              ) : (
                <span key={i} className={t.t}>
                  {t.v}
                </span>
              )
            )
          ) : (
            <span className="rp-empty">
              Fill in the public hostname to preview the rule
            </span>
          )}
        </code>
        <div className="rp-url">
          {primaryHost ? (
            <>
              Public URL: <span className="mono">https://{primaryHost}</span>
            </>
          ) : (
            <span className="text-[var(--danger)]">
              Fill in the public hostname
            </span>
          )}
        </div>
      </div>

      {/* entrypoints */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold">Entrypoints</label>
        <EntrypointSelect
          value={eps}
          onChange={setEps}
          disabled={disabled}
          helpText={
            <>
              One router is generated per selected entrypoint — same
              middlewares on each, TLS only on TLS entrypoints. Empty = the
              global default. The dedicated{" "}
              <span className="mono">traefik</span> API entrypoint is hidden
              unless this service already uses it.
            </>
          }
        />
      </div>
    </div>
  );
}

/* ── Root drop zone ─────────────────────────────────────────────────────────
 * Must be its own component: useDroppable only registers when called from a
 * component rendered INSIDE <DndContext>, and RouteRuleEditor is the one
 * rendering the provider. */

function RootDropZone({
  disabled,
  children,
}: {
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: containerId([]),
    disabled,
  });
  return (
    <div className={`matchers ${isOver ? "drop-over" : ""}`} ref={setNodeRef}>
      {children}
    </div>
  );
}

/* ── Popover menu keyboard support ────────────────────────────────────────────
 * Items are <button role="menuitem"> so Enter/Space activate natively; this
 * adds roving Arrow/Home/End focus, and Escape/Tab close the menu. */

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

function menuKeyDown(e: React.KeyboardEvent<HTMLElement>, close: () => void) {
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)
  ).filter((el) => !(el as HTMLButtonElement).disabled);
  if (items.length === 0) return;
  const idx = items.indexOf(document.activeElement as HTMLElement);
  const focusAt = (i: number) =>
    items[((i % items.length) + items.length) % items.length]?.focus();
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      focusAt(idx + 1);
      break;
    case "ArrowUp":
      e.preventDefault();
      focusAt(idx < 0 ? items.length - 1 : idx - 1);
      break;
    case "Home":
      e.preventDefault();
      focusAt(0);
      break;
    case "End":
      e.preventDefault();
      focusAt(items.length - 1);
      break;
    case "Escape":
      e.preventDefault();
      e.stopPropagation();
      close();
      break;
    case "Tab":
      close();
      break;
  }
}

/** Focus the current (".sel") or first menu item once the menu opens. */
function useFocusMenuOnOpen(
  open: boolean,
  menuRef: React.RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    if (!open) return;
    const el =
      menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"].sel') ??
      menuRef.current?.querySelector<HTMLElement>(MENU_ITEM_SELECTOR);
    el?.focus();
  }, [open, menuRef]);
}

/* ── Add-rule popover (used by the toolbar and each group header) ──────────── */

function AddRuleMenu({
  label,
  compact,
  disabled,
  onAdd,
}: {
  label: string;
  compact?: boolean;
  disabled?: boolean;
  onAdd: (type: MatchType) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  useFocusMenuOnOpen(open, menuRef);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        className={
          compact
            ? "mg-btn"
            : "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] font-semibold hover:border-[var(--border-strong)]"
        }
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Plus className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div
          className="addmatch-menu"
          role="menu"
          aria-label={label}
          ref={menuRef}
          onKeyDown={(e) => menuKeyDown(e, () => close(e.key === "Escape"))}
        >
          {MATCHER_TYPES.map((t) => (
            <button
              type="button"
              role="menuitem"
              key={t.key}
              className="tag-opt"
              onClick={() => {
                onAdd(t.key);
                close();
              }}
            >
              <span className="flex flex-col">
                <span className="nm">{t.label}</span>
                <span className="ty">{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Inline host composer for Host rules ────────────────────────────────────
 * Domain-backed: subdomain input + managed-domain dropdown + Sub/Apex toggle.
 * Free-text: a plain hostname input with a switch back to a managed domain. */

function HostComposer({
  path,
  matcher,
  domains,
  defaultDomainId,
  disabled,
  autoFocusSub,
  onPatch,
}: {
  path: NodePath;
  matcher: MatchRule;
  domains: DomainLite[];
  defaultDomainId: string;
  disabled?: boolean;
  autoFocusSub?: boolean;
  onPatch: (path: NodePath, patch: Partial<MatchRule>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);
  useFocusMenuOnOpen(open, menuRef);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const domainBacked = matcher.domainId !== undefined;
  const domainName =
    domains.find((d) => d.id === matcher.domainId)?.domain || "";

  if (!domainBacked) {
    return (
      <div className="host-row free">
        <input
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2.5 py-2 font-mono text-[13px]"
          value={matcher.value || ""}
          placeholder="app.example.com"
          aria-label="Hostname"
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          onChange={(e) =>
            onPatch(path, { value: e.target.value.replace(/`/g, "") })
          }
        />
        <button
          type="button"
          className="host-row-link"
          disabled={disabled || !defaultDomainId}
          title="Compose this hostname from a managed domain"
          aria-label="Use a managed domain"
          onClick={() =>
            onPatch(
              path,
              domainBackedPatch(matcher.value || "", domains, defaultDomainId)
            )
          }
        >
          <Globe className="h-3.5 w-3.5" /> Managed domain
        </button>
      </div>
    );
  }

  return (
    <div className={`host-wrap host-row ${open ? "menu-open" : ""}`} ref={ref}>
      <div className={`host-compose compact ${matcher.apex ? "apex" : ""}`}>
        <div className="host-string">
          <span className="host-sub">
            <input
              type="text"
              value={matcher.sub || ""}
              spellCheck={false}
              autoComplete="off"
              autoFocus={autoFocusSub}
              aria-label="Subdomain"
              placeholder="subdomain"
              disabled={disabled}
              onChange={(e) =>
                onPatch(path, {
                  sub: e.target.value.replace(/[^a-zA-Z0-9-.]/g, ""),
                })
              }
            />
          </span>
          <span className="host-dot">.</span>
          <button
            type="button"
            ref={triggerRef}
            className="host-domain"
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && !open) {
                e.preventDefault();
                setOpen(true);
              }
            }}
          >
            <span>{domainName || "select domain"}</span>
            <ChevronDown className="caret" />
          </button>
        </div>
        <div className="host-toggle" role="group" aria-label="Hostname mode">
          <button
            type="button"
            className={!matcher.apex ? "on" : ""}
            disabled={disabled}
            onClick={() => onPatch(path, { apex: false })}
          >
            Sub
          </button>
          <button
            type="button"
            className={matcher.apex ? "on" : ""}
            disabled={disabled}
            onClick={() => onPatch(path, { apex: true })}
          >
            Apex
          </button>
        </div>
      </div>
      {open && (
        <div
          className="host-menu"
          role="menu"
          aria-label="Managed domain"
          ref={menuRef}
          onKeyDown={(e) => menuKeyDown(e, () => close(e.key === "Escape"))}
        >
          {domains.map((d) => (
            <button
              type="button"
              role="menuitemradio"
              key={d.id}
              className={`host-opt ${d.id === matcher.domainId ? "sel" : ""}`}
              aria-checked={d.id === matcher.domainId}
              onClick={() => {
                onPatch(path, { domainId: d.id });
                close();
              }}
            >
              <span className="hn">{d.domain}</span>
              {d.isDefault && <span className="tag-default">default</span>}
              <span className="ck">
                <Check className="h-4 w-4" />
              </span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="host-opt free"
            onClick={() => {
              // switch to free-text: keep the composed hostname as the value
              onPatch(path, {
                value: resolveHostValue(matcher, (id) =>
                  domains.find((d) => d.id === id)?.domain ?? null
                ),
                domainId: undefined,
                sub: undefined,
                apex: undefined,
              });
              close(false);
            }}
          >
            <span className="hn">Custom hostname…</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Sortable matcher row (works at any depth, addressed by NodePath) ──────── */

function MatcherRow({
  path,
  matcher,
  domains,
  defaultDomainId,
  disabled,
  hideConn,
  autoFocusSub,
  onPatch,
  onDelete,
}: {
  path: NodePath;
  matcher: MatchRule;
  domains: DomainLite[];
  defaultDomainId: string;
  disabled?: boolean;
  /** First contributing row of its container: the connector is meaningless. */
  hideConn?: boolean;
  autoFocusSub?: boolean;
  onPatch: (path: NodePath, patch: Partial<MatchRule>) => void;
  onDelete: (path: NodePath) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId(path), disabled });
  const def = matcherDef(matcher.type);

  const handleTypeChange = (next: string) => {
    // ignore spurious empty-string change events
    if (next === "") return;
    const nextType = next as MatchType;
    if (nextType === matcher.type) return;
    if (nextType === "Host") {
      // becoming a Host: start domain-backed on the default domain
      onPatch(path, {
        type: nextType,
        domainId: defaultDomainId,
        sub: "",
        apex: undefined,
        value: "",
      });
    } else if (matcher.type === "Host") {
      // leaving Host: drop the host-only composition fields
      onPatch(path, {
        type: nextType,
        domainId: undefined,
        sub: undefined,
        apex: undefined,
      });
    } else {
      onPatch(path, { type: nextType });
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`matcher-row ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        type="button"
        className="m-grip"
        ref={setActivatorNodeRef}
        disabled={disabled}
        aria-label="Reorder rule"
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </button>
      <button
        type="button"
        className={`m-conn ${hideConn ? "ghost" : ""}`}
        data-conn={matcher.conn}
        disabled={disabled || hideConn}
        onClick={() =>
          onPatch(path, { conn: matcher.conn === "AND" ? "OR" : "AND" })
        }
        title={
          hideConn
            ? "First rule — the connector applies from the second rule on"
            : "Toggle AND / OR"
        }
      >
        {matcher.conn === "OR" ? "OR" : "AND"}
      </button>
      <select
        className="m-type rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2 py-2 text-[13px]"
        value={matcher.type}
        disabled={disabled}
        onChange={(e) => handleTypeChange(e.target.value)}
      >
        {MATCHER_TYPES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      {matcher.type === "Host" ? (
        <HostComposer
          path={path}
          matcher={matcher}
          domains={domains}
          defaultDomainId={defaultDomainId}
          disabled={disabled}
          autoFocusSub={autoFocusSub}
          onPatch={onPatch}
        />
      ) : def.fields.includes("method") ? (
        <select
          className="rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2 py-2 text-[13px] font-mono"
          value={matcher.method || "GET"}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === "") return;
            onPatch(path, { method: e.target.value });
          }}
        >
          {METHODS.map((mm) => (
            <option key={mm} value={mm}>
              {mm}
            </option>
          ))}
        </select>
      ) : (
        <>
          {def.fields.includes("key") && (
            <input
              className="min-w-0 flex-1 rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2.5 py-2 font-mono text-[13px]"
              value={matcher.key || ""}
              placeholder={def.ph[0]}
              disabled={disabled}
              onChange={(e) => onPatch(path, { key: e.target.value })}
            />
          )}
          <input
            className="min-w-0 flex-[2] rounded-[var(--radius-sm)] border bg-[var(--surface-2)] px-2.5 py-2 font-mono text-[13px]"
            value={matcher.value || ""}
            placeholder={def.fields.includes("key") ? def.ph[1] : def.ph[0]}
            disabled={disabled}
            onChange={(e) => onPatch(path, { value: e.target.value })}
          />
        </>
      )}
      <button
        type="button"
        className="grid h-8 w-8 flex-none place-items-center rounded-[var(--radius-sm)] text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
        disabled={disabled}
        onClick={() => onDelete(path)}
        aria-label="Remove rule"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ── Sortable group panel: a parenthesized sub-expression with its own list ──
 * Groups nest one level (UI_MAX_GROUP_DEPTH = 2): nested groups render as
 * fully editable panels; only depth-2 groups lose the "Add group" action. */

function GroupPanel({
  path,
  group,
  domains,
  defaultDomainId,
  disabled,
  hideConn,
  onPatch,
  onDelete,
  onUngroup,
  onAddInto,
  onAddGroupInto,
}: {
  path: NodePath;
  group: RuleGroup;
  domains: DomainLite[];
  defaultDomainId: string;
  disabled?: boolean;
  /** First contributing row of its container: the connector is meaningless. */
  hideConn?: boolean;
  onPatch: (path: NodePath, patch: Partial<MatchRule> | Partial<RuleGroup>) => void;
  onDelete: (path: NodePath) => void;
  onUngroup: (path: NodePath) => void;
  onAddInto: (container: NodePath, type: MatchType) => void;
  onAddGroupInto: (container: NodePath) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId(path), disabled });
  const { setNodeRef: setDropRef, isOver: dropIsOver } = useDroppable({
    id: containerId(path),
    disabled,
  });
  const count = countMatchers(group.children);
  const canNestGroup = path.length < UI_MAX_GROUP_DEPTH;

  return (
    <div
      ref={setNodeRef}
      className={`matcher-group ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className="mg-head">
        <button
          type="button"
          className="m-grip"
          ref={setActivatorNodeRef}
          disabled={disabled}
          aria-label="Reorder group"
          {...attributes}
          {...listeners}
        >
          <GripVertical />
        </button>
        <button
          type="button"
          className={`m-conn ${hideConn ? "ghost" : ""}`}
          data-conn={group.conn}
          disabled={disabled || hideConn}
          onClick={() =>
            onPatch(path, { conn: group.conn === "AND" ? "OR" : "AND" })
          }
          title={
            hideConn
              ? "First rule — the connector applies from the second rule on"
              : "Toggle AND / OR — how this group joins the rule before it"
          }
        >
          {group.conn === "OR" ? "OR" : "AND"}
        </button>
        <span className="mg-label">{path.length > 1 ? "Nested group" : "Group"}</span>
        <span className="mg-count">
          {count} rule{count === 1 ? "" : "s"}
        </span>
        <div className="mg-actions">
          <AddRuleMenu
            label="Add rule"
            compact
            disabled={disabled}
            onAdd={(type) => onAddInto(path, type)}
          />
          {canNestGroup && (
            <button
              type="button"
              className="mg-btn"
              disabled={disabled}
              onClick={() => onAddGroupInto(path)}
              title="Add a nested group inside this group"
            >
              <GroupIcon className="h-3.5 w-3.5" /> Add group
            </button>
          )}
          <button
            type="button"
            className="mg-btn"
            disabled={disabled}
            onClick={() => onUngroup(path)}
            title="Dissolve the group — its rules move up a level"
          >
            <UngroupIcon className="h-3.5 w-3.5" /> Ungroup
          </button>
          <button
            type="button"
            className="mg-btn danger"
            disabled={disabled}
            onClick={() => onDelete(path)}
            aria-label="Delete group and its rules"
            title="Delete the group and the rules inside it"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <SortableContext
        items={group.children.map((_, j) => itemId([...path, j]))}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setDropRef}
          className={`mg-body ${dropIsOver ? "drop-over" : ""}`}
        >
          {group.children.length === 0 && (
            <div className="mg-empty">
              Empty group — drag rules here or add one. Empty groups are
              skipped in the generated rule.
            </div>
          )}
          {group.children.map((child, j) =>
            isGroup(child) ? (
              <GroupPanel
                key={itemId([...path, j])}
                path={[...path, j]}
                group={child}
                domains={domains}
                defaultDomainId={defaultDomainId}
                disabled={disabled}
                hideConn={j === 0}
                onPatch={onPatch}
                onDelete={onDelete}
                onUngroup={onUngroup}
                onAddInto={onAddInto}
                onAddGroupInto={onAddGroupInto}
              />
            ) : (
              <MatcherRow
                key={itemId([...path, j])}
                path={[...path, j]}
                matcher={child}
                domains={domains}
                defaultDomainId={defaultDomainId}
                disabled={disabled}
                hideConn={j === 0}
                onPatch={onPatch}
                onDelete={onDelete}
              />
            )
          )}
        </div>
      </SortableContext>
    </div>
  );
}
