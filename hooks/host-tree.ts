/* Host-tree helpers shared by the route-rule editor and use-service-form so
 * the form's unsaved-changes baseline matches what the editor emits on mount.
 * Pure, browser-safe — no React, no server imports. */

import {
  treeHasHost,
  type HostnameMode,
  type MatchRule,
  type RuleNode,
} from "@/lib/route-rule";

export interface DomainLite {
  id: string;
  name: string;
  domain: string;
  isDefault: boolean;
}

/** The domain a new Host rule starts on: the flagged default, else the first. */
export function defaultDomainIdOf(domains: DomainLite[]): string {
  return (domains.find((d) => d.isDefault) || domains[0])?.id ?? "";
}

export function parseCustomList(json?: string | null): string[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Lift a service's host into the rule tree so the tree is self-contained:
 * - tree already carries a Host rule → stored tree as-is (native format);
 * - legacy sub/apex columns → one leading domain-backed Host rule;
 * - legacy "custom" hostnames → one free-text Host rule each (first AND,
 *   rest OR), preserving the old "any of these hosts" semantics.
 * A brand-new service (empty columns) yields one empty domain-backed Host
 * rule the user must fill.
 */
export function legacyHostTree(initial: {
  domainId: string;
  subdomain?: string | null;
  hostnameMode: HostnameMode;
  customHostnames?: string | null;
  matchRules: RuleNode[];
}): RuleNode[] {
  if (treeHasHost(initial.matchRules)) return initial.matchRules;
  if (initial.hostnameMode === "custom") {
    const hosts = parseCustomList(initial.customHostnames);
    const hostNodes: RuleNode[] = (hosts.length ? hosts : [""]).map(
      (h, i): MatchRule => ({
        type: "Host",
        conn: i === 0 ? "AND" : "OR",
        value: h,
      })
    );
    return [...hostNodes, ...initial.matchRules];
  }
  const host: MatchRule =
    initial.hostnameMode === "apex"
      ? { type: "Host", conn: "AND", domainId: initial.domainId, apex: true }
      : {
          type: "Host",
          conn: "AND",
          domainId: initial.domainId,
          sub: initial.subdomain || "",
        };
  return [host, ...initial.matchRules];
}
