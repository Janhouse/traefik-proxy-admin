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

export function matcherArgs(m: MatchRule): string[] {
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

/**
 * Assemble the Traefik router rule. Left-associative with explicit parens so it
 * reads exactly as composed (operators apply in the order shown), e.g.
 *   Host(a) || Host(b) && PathPrefix(/api)  →  ((Host(`a`) || Host(`b`)) && PathPrefix(`/api`))
 * This is unambiguous regardless of Traefik's &&-over-|| precedence.
 */
export function assembleRule(
  primaryHost: string,
  matchRules: MatchRule[]
): string {
  let rule = `Host(\`${clean(primaryHost)}\`)`;
  for (const m of matchRules) {
    const op = m.conn === "OR" ? "||" : "&&";
    rule = `(${rule} ${op} ${matcherString(m)})`;
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

export function parseMatchRules(json?: string | null): MatchRule[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    if (!Array.isArray(p)) return [];
    return p
      .filter((m) => m && typeof m === "object" && typeof m.type === "string")
      .map((m) => ({
        type: m.type as MatchType,
        conn: m.conn === "OR" ? "OR" : "AND",
        value: m.value,
        key: m.key,
        method: m.method,
      }));
  } catch {
    return [];
  }
}
