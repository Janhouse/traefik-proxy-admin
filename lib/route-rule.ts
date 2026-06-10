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
}

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
  { key: "Host", label: "Host", desc: "An additional hostname (OR with the primary host)", fields: ["value"], ph: ["app.example.com"] },
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

function matcherArgs(m: MatchRule): string[] {
  if (m.type === "Method") return [m.method || "GET"];
  const def = matcherDef(m.type);
  if (def.fields.includes("key")) return [m.key || "", m.value || ""];
  return [m.value || ""];
}

function matcherString(m: MatchRule): string {
  const inner = matcherArgs(m)
    .map((a) => "`" + clean(a) + "`")
    .join(", ");
  return `${m.type}(${inner})`;
}

/** Expression for one node; null when the node contributes nothing (empty group). */
function nodeExpr(node: RuleNode): string | null {
  if (!isGroup(node)) return matcherString(node);
  let expr: string | null = null;
  for (const child of node.children) {
    const e = nodeExpr(child);
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
 * Assemble the Traefik router rule. Left-associative with explicit parens so it
 * reads exactly as composed (operators apply in the order shown), e.g.
 *   Host(a) || Host(b) && PathPrefix(/api)  →  ((Host(`a`) || Host(`b`)) && PathPrefix(`/api`))
 * Groups become their own parenthesized sub-expression. This is unambiguous
 * regardless of Traefik's &&-over-|| precedence.
 */
export function assembleRule(
  primaryHost: string,
  matchRules: RuleNode[]
): string {
  let rule = `Host(\`${clean(primaryHost)}\`)`;
  for (const node of matchRules) {
    const e = nodeExpr(node);
    if (e === null) continue;
    const op = node.conn === "OR" ? "||" : "&&";
    rule = `(${rule} ${op} ${e})`;
  }
  return rule;
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

/** Extract the Host(`…`) hostnames from a rule string (for conflict checks). */
export function hostTokensOfRule(rule: string): string[] {
  const out: string[] = [];
  const re = /Host\(`([^`]+)`\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rule)) !== null) out.push(m[1]);
  return out;
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
  if (typeof o.type !== "string") return null;
  return {
    type: o.type as MatchType,
    conn: o.conn === "OR" ? "OR" : "AND",
    value: typeof o.value === "string" ? o.value : undefined,
    key: typeof o.key === "string" ? o.key : undefined,
    method: typeof o.method === "string" ? o.method : undefined,
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
