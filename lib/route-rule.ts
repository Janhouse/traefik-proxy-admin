/* Shared (client + server) route-rule model + assembly.
 * Used by the route editor's live preview AND lib/traefik-config.ts generation,
 * so the rule shown to the user is exactly what Traefik receives. No server-only
 * imports — safe in the browser. */

export type MatchType =
  | "Host"
  | "HostRegexp"
  | "PathPrefix"
  | "Path"
  | "PathRegexp"
  | "Header"
  | "HeaderRegexp"
  | "Query"
  | "Method"
  | "ClientIP";

export type Connector = "AND" | "OR";

export interface MatchRule {
  type: MatchType;
  conn: Connector; // connector to the preceding token
  value?: string; // single-value types (Host, PathPrefix, …) + the value of key/value types
  key?: string; // Header/HeaderRegexp/Query key
  method?: string; // Method
  /* Host-only "domain-backed" composition: when domainId is set the hostname
   * is composed from a managed domain (sub.domain or the apex) and `value` is
   * ignored. Free-text hosts keep using `value`. */
  domainId?: string;
  sub?: string;
  apex?: boolean;
}

/** Resolves a managed domain id to its domain name (client: from the loaded
 * domains list; server: from the DB). Return null/undefined when unknown. */
export type DomainResolver = (domainId: string) => string | null | undefined;

/** A parenthesized sub-expression: its children combine left-to-right, and the
 * whole group joins the preceding token with `conn`. */
export interface RuleGroup {
  kind: "group";
  conn: Connector;
  children: RuleNode[];
}

export type RuleNode = MatchRule | RuleGroup;

export function isGroup(node: RuleNode): node is RuleGroup {
  return (
    (node as RuleGroup).kind === "group" &&
    Array.isArray((node as RuleGroup).children)
  );
}

/** Groups may nest in the stored model; the parser refuses anything deeper. */
export const MAX_GROUP_DEPTH = 4;

/** How deep the EDITOR lets users nest groups (groups inside groups = 2). */
export const UI_MAX_GROUP_DEPTH = 2;

export interface MatcherTypeDef {
  key: MatchType;
  label: string;
  desc: string;
  fields: Array<"value" | "key" | "method">;
  ph: string[]; // placeholders aligned to `fields`
}

export const METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

export const MATCHER_TYPES: MatcherTypeDef[] = [
  { key: "Host", label: "Host", desc: "A public hostname for this route", fields: ["value"], ph: ["app.example.com"] },
  { key: "PathPrefix", label: "Path prefix", desc: "URLs starting with a path segment", fields: ["value"], ph: ["/api"] },
  { key: "Path", label: "Exact path", desc: "One exact path, nothing else", fields: ["value"], ph: ["/healthz"] },
  { key: "PathRegexp", label: "Path regexp", desc: "Match the path by regular expression", fields: ["value"], ph: ["^/v[0-9]+/"] },
  { key: "Header", label: "Header", desc: "A request header equals a value", fields: ["key", "value"], ph: ["X-Env", "staging"] },
  { key: "HeaderRegexp", label: "Header regexp", desc: "A request header matches a regexp", fields: ["key", "value"], ph: ["User-Agent", ".*Mobile.*"] },
  { key: "Query", label: "Query param", desc: "A query-string parameter equals a value", fields: ["key", "value"], ph: ["debug", "1"] },
  { key: "Method", label: "HTTP method", desc: "Restrict to one HTTP method", fields: ["method"], ph: [] },
  { key: "ClientIP", label: "Client IP", desc: "Source IP address or CIDR range", fields: ["value"], ph: ["10.0.0.0/24"] },
  { key: "HostRegexp", label: "Host regexp", desc: "Match the hostname by regular expression", fields: ["value"], ph: ["^.+\\.example\\.com$"] },
];

export function matcherDef(type: MatchType): MatcherTypeDef {
  return MATCHER_TYPES.find((t) => t.key === type) || MATCHER_TYPES[0];
}

const MATCH_TYPE_SET = new Set<string>(MATCHER_TYPES.map((t) => t.key));

/** Whether a raw value names one of the supported matcher types. The type is
 * emitted verbatim as the matcher function name, so this whitelist is what
 * keeps a crafted `type` from injecting rule syntax. */
export function isMatchType(type: unknown): type is MatchType {
  return typeof type === "string" && MATCH_TYPE_SET.has(type);
}

export type HostnameMode = "subdomain" | "apex" | "custom";

/** The primary Host() argument from the sub/apex composer. */
export function hostToken(
  mode: HostnameMode,
  sub: string | null | undefined,
  domain: string
): string {
  if (!domain) return (sub || "").trim();
  if (mode === "apex") return domain;
  const s = (sub || "").trim();
  return s ? `${s}.${domain}` : domain;
}

/** Strip backticks (Traefik wraps args in backticks). */
function clean(v: string): string {
  return String(v ?? "").replace(/`/g, "");
}

/** The hostname a Host rule resolves to: domain-backed (sub.domain / apex) or
 * the free-text value. Empty string when unresolvable/unfilled. */
export function resolveHostValue(
  m: MatchRule,
  resolveDomain?: DomainResolver
): string {
  if (m.type === "Host" && m.domainId) {
    const domain = resolveDomain?.(m.domainId);
    if (!domain) return "";
    if (m.apex) return domain;
    const s = (m.sub || "").trim();
    return s ? `${s}.${domain}` : "";
  }
  return clean(m.value || "");
}

function matcherArgs(m: MatchRule, resolveDomain?: DomainResolver): string[] {
  if (m.type === "Method") return [m.method || "GET"];
  if (m.type === "Host") return [resolveHostValue(m, resolveDomain)];
  const def = matcherDef(m.type);
  if (def.fields.includes("key")) return [m.key || "", m.value || ""];
  return [m.value || ""];
}

function matcherString(m: MatchRule, resolveDomain?: DomainResolver): string {
  const inner = matcherArgs(m, resolveDomain)
    .map((a) => "`" + clean(a) + "`")
    .join(", ");
  return `${m.type}(${inner})`;
}

/** Expression for one node; null when the node contributes nothing (empty group). */
function nodeExpr(node: RuleNode, resolveDomain?: DomainResolver): string | null {
  if (!isGroup(node)) return matcherString(node, resolveDomain);
  let expr: string | null = null;
  for (const child of node.children) {
    const e = nodeExpr(child, resolveDomain);
    if (e === null) continue;
    if (expr === null) {
      expr = e; // first child's connector is meaningless inside its group
    } else {
      const op = child.conn === "OR" ? "||" : "&&";
      expr = `(${expr} ${op} ${e})`;
    }
  }
  return expr;
}

/**
 * Assemble the Traefik router rule from a primary host plus extra rules.
 * Left-associative with explicit parens so it reads exactly as composed
 * (operators apply in the order shown), e.g.
 *   Host(a) || Host(b) && PathPrefix(/api)  →  ((Host(`a`) || Host(`b`)) && PathPrefix(`/api`))
 * Groups become their own parenthesized sub-expression. This is unambiguous
 * regardless of Traefik's &&-over-|| precedence.
 *
 * Legacy form: services whose host still lives in the subdomain/domain columns.
 * Trees that carry their own Host rules use assembleRuleFromTree instead.
 */
export function assembleRule(
  primaryHost: string,
  matchRules: RuleNode[],
  resolveDomain?: DomainResolver
): string {
  let rule = `Host(\`${clean(primaryHost)}\`)`;
  for (const node of matchRules) {
    const e = nodeExpr(node, resolveDomain);
    if (e === null) continue;
    const op = node.conn === "OR" ? "||" : "&&";
    rule = `(${rule} ${op} ${e})`;
  }
  return rule;
}

/**
 * Assemble a SELF-CONTAINED rule tree (one that carries its own Host rules —
 * the editor's native format). The first contributing node's connector is
 * meaningless, exactly like the first child of a group. Returns "" for an
 * empty/non-contributing tree — callers must treat that as invalid.
 */
export function assembleRuleFromTree(
  matchRules: RuleNode[],
  resolveDomain?: DomainResolver
): string {
  return nodeExpr({ kind: "group", conn: "AND", children: matchRules }, resolveDomain) ?? "";
}

/** Depth-first hostnames of every Host rule in the tree (resolved, non-empty). */
export function hostsInTree(
  nodes: RuleNode[],
  resolveDomain?: DomainResolver
): string[] {
  const out: string[] = [];
  const walk = (list: RuleNode[]) => {
    for (const n of list) {
      if (isGroup(n)) walk(n.children);
      else if (n.type === "Host") {
        const host = resolveHostValue(n, resolveDomain);
        if (host) out.push(host);
      }
    }
  };
  walk(nodes);
  return out;
}

/** First Host rule in the tree (depth-first), or null. */
export function firstHostNode(nodes: RuleNode[]): MatchRule | null {
  for (const n of nodes) {
    if (isGroup(n)) {
      const hit = firstHostNode(n.children);
      if (hit) return hit;
    } else if (n.type === "Host") {
      return n;
    }
  }
  return null;
}

/** Whether the tree carries any Host rule (self-contained rule format). */
export function treeHasHost(nodes: RuleNode[]): boolean {
  return firstHostNode(nodes) !== null;
}

/* ── Tokenizer for the syntax-highlighted preview ─────────────────────────── */
export interface RuleToken {
  t: "fn" | "str" | "op" | "txt";
  v: string;
}
export function tokenizeRule(rule: string): RuleToken[] {
  const tokens: RuleToken[] = [];
  // function name followed by (, backtick strings, operators/parens/commas
  const re = /([A-Za-z]+)(?=\()|`[^`]*`|&&|\|\||[(),]|\s+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rule)) !== null) {
    if (m.index > last) tokens.push({ t: "txt", v: rule.slice(last, m.index) });
    const s = m[0];
    if (/^[A-Za-z]+$/.test(s)) tokens.push({ t: "fn", v: s });
    else if (s[0] === "`") tokens.push({ t: "str", v: s });
    else if (s === "&&" || s === "||") tokens.push({ t: "op", v: s });
    else tokens.push({ t: "txt", v: s });
    last = re.lastIndex;
  }
  if (last < rule.length) tokens.push({ t: "txt", v: rule.slice(last) });
  return tokens;
}

/**
 * Extract the Host(`…`) hostnames from a rule string (for conflict checks).
 * Handles the v2 multi-arg form Host(`a`, `b`), whitespace inside the parens,
 * and lowercases every host (hostnames are case-insensitive). Empty args are
 * skipped. HostRegexp() is NOT a Host() and contributes nothing.
 */
export function hostTokensOfRule(rule: string): string[] {
  const out: string[] = [];
  // \bHost so "HostRegexp(" / "HostSNI(" never match; the args are backtick
  // strings separated by commas/whitespace only.
  const re = /\bHost\s*\(\s*((?:`[^`]*`\s*(?:,\s*)?)*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rule)) !== null) {
    const args = m[1].match(/`[^`]*`/g) || [];
    for (const arg of args) {
      const host = arg.slice(1, -1).trim().toLowerCase();
      if (host) out.push(host);
    }
  }
  return out;
}

/**
 * True when a rule consists SOLELY of Host()/HostRegexp() matchers joined by
 * && / || (parens allowed) — i.e. it claims whole hostnames. Anything else
 * (Path*, Header*, Query, Method, ClientIP, negation, unparseable text) makes
 * it false: such a router only claims a slice of the host, so sharing its
 * Host() is a warning rather than a hard conflict.
 */
export function isHostOnlyRule(rule: string): boolean {
  // Drop the backtick-quoted arguments; only the structure matters.
  const structure = rule.replace(/`[^`]*`/g, "");
  const re = /\s+|&&|\|\||[(),]|[A-Za-z]+/y;
  let sawHost = false;
  let pos = 0;
  while (pos < structure.length) {
    re.lastIndex = pos;
    const m = re.exec(structure);
    if (!m) return false; // "!" or any other token we don't understand
    const tok = m[0];
    if (/^[A-Za-z]+$/.test(tok)) {
      if (tok !== "Host" && tok !== "HostRegexp") return false;
      sawHost = true;
    }
    pos += tok.length;
  }
  return sawHost;
}

/* ── JSON (de)serialization helpers (tolerant) ────────────────────────────── */
export function parseEntrypoints(json?: string | null): string[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    if (Array.isArray(p)) return p.map((s) => String(s).trim()).filter(Boolean);
  } catch {
    return json.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function parseNode(raw: unknown, depth: number): RuleNode | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "group") {
    if (depth >= MAX_GROUP_DEPTH || !Array.isArray(o.children)) return null;
    return {
      kind: "group",
      conn: o.conn === "OR" ? "OR" : "AND",
      children: o.children
        .map((c) => parseNode(c, depth + 1))
        .filter((c): c is RuleNode => c !== null),
    };
  }
  // Unknown matcher types are dropped: the type is emitted verbatim as the
  // matcher function name, so anything off the whitelist is either a typo
  // (Traefik would reject the router) or injected rule syntax.
  if (!isMatchType(o.type)) return null;
  return {
    type: o.type,
    conn: o.conn === "OR" ? "OR" : "AND",
    value: typeof o.value === "string" ? o.value : undefined,
    key: typeof o.key === "string" ? o.key : undefined,
    method: typeof o.method === "string" ? o.method : undefined,
    domainId: typeof o.domainId === "string" ? o.domainId : undefined,
    sub: typeof o.sub === "string" ? o.sub : undefined,
    apex: typeof o.apex === "boolean" ? o.apex : undefined,
  };
}

/** Parse stored match rules. Accepts both the legacy flat MatchRule[] shape and
 * the tree shape with `{kind:"group", children:[…]}` nodes. */
export function parseMatchRules(json?: string | null): RuleNode[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    if (!Array.isArray(p)) return [];
    return p
      .map((m) => parseNode(m, 0))
      .filter((m): m is RuleNode => m !== null);
  } catch {
    return [];
  }
}

/* ── Request validation (API layer) ───────────────────────────────────────── */

/** Hostnames as accepted in a free-text Host(): labels, dots, dashes and `*`.
 * Anything else (backticks, spaces, parens, slashes…) is rejected outright. */
const HOST_VALUE_RE = /^[A-Za-z0-9*][A-Za-z0-9.*-]*$/;
const METHOD_RE = /^[A-Za-z]+$/;

/**
 * Validate a RAW (untrusted) matchRules payload before it is stored. Returns a
 * human-readable error, or null when the tree is acceptable. Checks the raw
 * objects rather than the parsed tree so unknown types are REJECTED (parseNode
 * silently drops them, which would let a bad request save a lossy tree).
 *
 * Rules: known `type`; matchers that take an argument must have a non-empty
 * one (Traefik drops a router with PathPrefix(``)); Path/PathPrefix must start
 * with "/"; free-text Host values must look like hostnames; domain-backed
 * Hosts need the apex flag or a subdomain; Header/HeaderRegexp/Query need a key.
 */
export function validateMatchRulesPayload(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return "matchRules must be an array";
  return validateRawNodes(raw, 0);
}

function validateRawNodes(nodes: unknown[], depth: number): string | null {
  for (const node of nodes) {
    const err = validateRawNode(node, depth);
    if (err) return err;
  }
  return null;
}

function validateRawNode(raw: unknown, depth: number): string | null {
  if (!raw || typeof raw !== "object") return "Invalid match rule";
  const o = raw as Record<string, unknown>;
  if (o.kind === "group") {
    if (depth >= MAX_GROUP_DEPTH) return "Match rule groups are nested too deeply";
    if (!Array.isArray(o.children)) return "Match rule group has no children";
    return validateRawNodes(o.children, depth + 1);
  }
  if (!isMatchType(o.type)) {
    return `Unknown match rule type: ${String(o.type).slice(0, 40)}`;
  }
  const type = o.type;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const value = str(o.value);
  switch (type) {
    case "Host": {
      if (typeof o.domainId === "string" && o.domainId) {
        if (o.apex === true) return null;
        const sub = str(o.sub);
        if (!sub) return "Host rule needs a subdomain or the apex";
        if (!HOST_VALUE_RE.test(sub)) return `Invalid subdomain: ${sub}`;
        return null;
      }
      if (!value) return "Host rule needs a hostname";
      if (!HOST_VALUE_RE.test(value)) return `Invalid hostname: ${value}`;
      return null;
    }
    case "Path":
    case "PathPrefix":
      if (!value) return `${type} rule needs a path`;
      if (!value.startsWith("/")) return `${type} must start with "/": ${value}`;
      return null;
    case "PathRegexp":
    case "HostRegexp":
    case "ClientIP":
      if (!value) return `${type} rule needs a value`;
      return null;
    case "Header":
    case "HeaderRegexp":
    case "Query":
      if (!str(o.key)) return `${type} rule needs a key`;
      if (!value) return `${type} rule needs a value`;
      return null;
    case "Method": {
      const method = str(o.method);
      if (method && !METHOD_RE.test(method)) return `Invalid HTTP method: ${method}`;
      return null;
    }
  }
}

/* ── Pure tree operations (used by the editor; path = index per depth) ────── */
export type NodePath = number[];

function cloneNodes(nodes: RuleNode[]): RuleNode[] {
  return nodes.map((n) =>
    isGroup(n) ? { ...n, children: cloneNodes(n.children) } : { ...n }
  );
}

export function getNode(nodes: RuleNode[], path: NodePath): RuleNode | null {
  let list = nodes;
  for (let i = 0; i < path.length - 1; i++) {
    const n = list[path[i]];
    if (!n || !isGroup(n)) return null;
    list = n.children;
  }
  return list[path[path.length - 1]] ?? null;
}

/** The array that directly contains the node at `path` (inside a copy). */
function containerOf(root: RuleNode[], path: NodePath): RuleNode[] | null {
  let list = root;
  for (let i = 0; i < path.length - 1; i++) {
    const n = list[path[i]];
    if (!n || !isGroup(n)) return null;
    list = n.children;
  }
  return list;
}

export function updateNode(
  nodes: RuleNode[],
  path: NodePath,
  patch: Partial<MatchRule> | Partial<RuleGroup>
): RuleNode[] {
  const copy = cloneNodes(nodes);
  const list = containerOf(copy, path);
  const idx = path[path.length - 1];
  if (!list || !list[idx]) return nodes;
  list[idx] = { ...list[idx], ...patch } as RuleNode;
  return copy;
}

export function removeNode(nodes: RuleNode[], path: NodePath): RuleNode[] {
  const copy = cloneNodes(nodes);
  const list = containerOf(copy, path);
  const idx = path[path.length - 1];
  if (!list || idx < 0 || idx >= list.length) return nodes;
  list.splice(idx, 1);
  return copy;
}

/** Insert `node` so it ends up at `path` (existing items shift right). */
export function insertNode(
  nodes: RuleNode[],
  path: NodePath,
  node: RuleNode
): RuleNode[] {
  const copy = cloneNodes(nodes);
  const list = containerOf(copy, path);
  const idx = path[path.length - 1];
  if (!list || idx < 0 || idx > list.length) return nodes;
  list.splice(idx, 0, node);
  return copy;
}

/**
 * Move the node at `from` so it lands at `to` (both paths relative to the
 * ORIGINAL tree). Moving a node into its own subtree is a no-op.
 */
export function moveNode(
  nodes: RuleNode[],
  from: NodePath,
  to: NodePath
): RuleNode[] {
  if (from.length === 0 || to.length === 0) return nodes;
  // refuse to move a node inside its own subtree
  if (to.length > from.length && from.every((v, i) => to[i] === v)) {
    return nodes;
  }
  const copy = cloneNodes(nodes);
  const srcList = containerOf(copy, from);
  if (!srcList) return nodes;
  const [moved] = srcList.splice(from[from.length - 1], 1);
  if (!moved) return nodes;
  // Removal shifts the target path when `from`'s container is a prefix-
  // ancestor of `to` and the target index at that depth sat after `from`.
  const k = from.length - 1;
  const adjusted = [...to];
  if (
    to.length >= from.length &&
    from.slice(0, k).every((v, i) => to[i] === v) &&
    from[k] < to[k]
  ) {
    adjusted[k] -= 1;
  }
  const dstList = containerOf(copy, adjusted);
  const idx = adjusted[adjusted.length - 1];
  if (!dstList || idx < 0 || idx > dstList.length) return nodes;
  dstList.splice(idx, 0, moved);
  return copy;
}

/** Replace a group with its children in place; the first child inherits the
 * group's connector so the surrounding expression keeps its meaning. */
export function ungroupNode(nodes: RuleNode[], path: NodePath): RuleNode[] {
  const node = getNode(nodes, path);
  if (!node || !isGroup(node)) return nodes;
  const copy = cloneNodes(nodes);
  const list = containerOf(copy, path);
  const idx = path[path.length - 1];
  if (!list) return nodes;
  const group = list[idx] as RuleGroup;
  const children = group.children;
  if (children.length > 0) children[0] = { ...children[0], conn: group.conn };
  list.splice(idx, 1, ...children);
  return copy;
}

/** Total matcher (leaf) count in a tree. */
export function countMatchers(nodes: RuleNode[]): number {
  let n = 0;
  for (const node of nodes) {
    n += isGroup(node) ? countMatchers(node.children) : 1;
  }
  return n;
}
