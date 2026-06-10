import { describe, expect, it } from "vitest";
import {
  assembleRule,
  assembleRuleFromTree,
  countMatchers,
  firstHostNode,
  getNode,
  hostToken,
  hostTokensOfRule,
  hostsInTree,
  insertNode,
  isGroup,
  moveNode,
  parseEntrypoints,
  parseMatchRules,
  removeNode,
  resolveHostValue,
  treeHasHost,
  ungroupNode,
  updateNode,
  type DomainResolver,
  type MatchRule,
  type RuleGroup,
  type RuleNode,
} from "@/lib/route-rule";

const m = (
  type: MatchRule["type"],
  conn: MatchRule["conn"],
  value?: string,
  extra: Partial<MatchRule> = {}
): MatchRule => ({ type, conn, value, ...extra });

const g = (conn: RuleGroup["conn"], ...children: RuleNode[]): RuleGroup => ({
  kind: "group",
  conn,
  children,
});

describe("assembleRule", () => {
  it("emits the bare primary host with no matchers", () => {
    expect(assembleRule("app.example.com", [])).toBe("Host(`app.example.com`)");
  });

  it("keeps the legacy left-associative flat form", () => {
    const rule = assembleRule("a.example.com", [
      m("Host", "OR", "b.example.com"),
      m("PathPrefix", "AND", "/api"),
    ]);
    expect(rule).toBe(
      "((Host(`a.example.com`) || Host(`b.example.com`)) && PathPrefix(`/api`))"
    );
  });

  it("strips backticks from values", () => {
    expect(assembleRule("a`.com", [m("PathPrefix", "AND", "/x`y")])).toBe(
      "(Host(`a.com`) && PathPrefix(`/xy`))"
    );
  });

  it("renders key/value matchers with both args", () => {
    expect(
      assembleRule("a.com", [m("Header", "AND", "staging", { key: "X-Env" })])
    ).toBe("(Host(`a.com`) && Header(`X-Env`, `staging`))");
  });

  it("renders Method matchers from the method field", () => {
    expect(
      assembleRule("a.com", [m("Method", "AND", undefined, { method: "POST" })])
    ).toBe("(Host(`a.com`) && Method(`POST`))");
  });

  it("parenthesizes groups as a unit", () => {
    const rule = assembleRule("a.com", [
      g("OR", m("PathPrefix", "AND", "/api"), m("Method", "AND", undefined, { method: "GET" })),
    ]);
    expect(rule).toBe(
      "(Host(`a.com`) || (PathPrefix(`/api`) && Method(`GET`)))"
    );
  });

  it("builds (A && B) || (C && D) shapes", () => {
    const rule = assembleRule("a.com", [
      g("AND", m("PathPrefix", "AND", "/api"), m("Header", "AND", "1", { key: "X-Beta" })),
      g("OR", m("PathPrefix", "AND", "/v2"), m("ClientIP", "AND", "10.0.0.0/8")),
    ]);
    expect(rule).toBe(
      "((Host(`a.com`) && (PathPrefix(`/api`) && Header(`X-Beta`, `1`))) || (PathPrefix(`/v2`) && ClientIP(`10.0.0.0/8`)))"
    );
  });

  it("ignores the first child's connector inside a group", () => {
    const a = assembleRule("a.com", [g("OR", m("Path", "OR", "/x"))]);
    const b = assembleRule("a.com", [g("OR", m("Path", "AND", "/x"))]);
    expect(a).toBe(b);
    expect(a).toBe("(Host(`a.com`) || Path(`/x`))");
  });

  it("skips empty groups entirely", () => {
    expect(assembleRule("a.com", [g("AND")])).toBe("Host(`a.com`)");
    expect(
      assembleRule("a.com", [g("AND"), m("PathPrefix", "AND", "/api")])
    ).toBe("(Host(`a.com`) && PathPrefix(`/api`))");
  });

  it("supports nested groups", () => {
    const rule = assembleRule("a.com", [
      g("AND", m("PathPrefix", "AND", "/api"), g("OR", m("Method", "AND", undefined, { method: "GET" }), m("Method", "OR", undefined, { method: "HEAD" }))),
    ]);
    expect(rule).toBe(
      "(Host(`a.com`) && (PathPrefix(`/api`) || (Method(`GET`) || Method(`HEAD`))))"
    );
  });
});

describe("domain-backed hosts + self-contained trees", () => {
  const domains: DomainResolver = (id) =>
    ({ d1: "example.com", d2: "other.net" })[id];
  const hostD = (
    conn: MatchRule["conn"],
    over: Partial<MatchRule> = {}
  ): MatchRule => ({ type: "Host", conn, ...over });

  it("resolveHostValue composes sub.domain, apex, and free text", () => {
    expect(resolveHostValue(hostD("AND", { domainId: "d1", sub: "app" }), domains)).toBe("app.example.com");
    expect(resolveHostValue(hostD("AND", { domainId: "d1", apex: true }), domains)).toBe("example.com");
    expect(resolveHostValue(hostD("AND", { domainId: "d1", sub: "" }), domains)).toBe("");
    expect(resolveHostValue(hostD("AND", { domainId: "missing", sub: "app" }), domains)).toBe("");
    expect(resolveHostValue(hostD("AND", { value: "free.example.org" }), domains)).toBe("free.example.org");
  });

  it("assembleRuleFromTree builds a complete rule from the tree alone", () => {
    const tree: RuleNode[] = [
      hostD("AND", { domainId: "d1", sub: "app" }),
      m("PathPrefix", "AND", "/api"),
    ];
    expect(assembleRuleFromTree(tree, domains)).toBe(
      "(Host(`app.example.com`) && PathPrefix(`/api`))"
    );
    // first node's connector is meaningless
    expect(assembleRuleFromTree([hostD("OR", { domainId: "d1", apex: true })], domains)).toBe(
      "Host(`example.com`)"
    );
    expect(assembleRuleFromTree([], domains)).toBe("");
  });

  it("supports per-group hosts — (Host(a) && /x) || (Host(b) && /y)", () => {
    const tree: RuleNode[] = [
      g("AND", hostD("AND", { domainId: "d1", sub: "a" }), m("PathPrefix", "AND", "/x")),
      g("OR", hostD("AND", { domainId: "d2", apex: true }), m("PathPrefix", "AND", "/y")),
    ];
    expect(assembleRuleFromTree(tree, domains)).toBe(
      "((Host(`a.example.com`) && PathPrefix(`/x`)) || (Host(`other.net`) && PathPrefix(`/y`)))"
    );
  });

  it("hostsInTree/firstHostNode/treeHasHost walk depth-first and skip unresolved", () => {
    const tree: RuleNode[] = [
      g("AND", hostD("AND", { domainId: "d1", sub: "a" }), m("PathPrefix", "AND", "/x")),
      hostD("OR", { value: "b.example.org" }),
      hostD("OR", { domainId: "missing", sub: "x" }),
    ];
    expect(hostsInTree(tree, domains)).toEqual(["a.example.com", "b.example.org"]);
    expect(firstHostNode(tree)).toMatchObject({ domainId: "d1", sub: "a" });
    expect(treeHasHost(tree)).toBe(true);
    expect(treeHasHost([m("PathPrefix", "AND", "/x")])).toBe(false);
    expect(firstHostNode([])).toBeNull();
  });

  it("round-trips domain-backed fields through parseMatchRules", () => {
    const tree: RuleNode[] = [hostD("AND", { domainId: "d1", sub: "app", apex: false })];
    expect(parseMatchRules(JSON.stringify(tree))).toEqual(tree);
  });
});

describe("parseMatchRules", () => {
  it("returns [] for null/empty/garbage", () => {
    expect(parseMatchRules(null)).toEqual([]);
    expect(parseMatchRules("")).toEqual([]);
    expect(parseMatchRules("not json")).toEqual([]);
    expect(parseMatchRules('{"type":"Host"}')).toEqual([]);
  });

  it("parses the legacy flat shape", () => {
    const nodes = parseMatchRules(
      JSON.stringify([
        { type: "Host", conn: "OR", value: "b.com" },
        { type: "PathPrefix", conn: "AND", value: "/api" },
      ])
    );
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ type: "Host", conn: "OR", value: "b.com" });
  });

  it("normalizes unknown connectors to AND", () => {
    const nodes = parseMatchRules(
      JSON.stringify([{ type: "Path", conn: "XOR", value: "/x" }])
    );
    expect((nodes[0] as MatchRule).conn).toBe("AND");
  });

  it("parses groups recursively and round-trips through assembleRule", () => {
    const tree: RuleNode[] = [
      g("OR", m("PathPrefix", "AND", "/api"), m("Header", "AND", "1", { key: "X" })),
    ];
    const parsed = parseMatchRules(JSON.stringify(tree));
    expect(parsed).toEqual(tree);
    expect(assembleRule("a.com", parsed)).toBe(
      assembleRule("a.com", tree)
    );
  });

  it("drops malformed nodes but keeps valid siblings", () => {
    const nodes = parseMatchRules(
      JSON.stringify([
        { type: "Host", conn: "OR", value: "b.com" },
        { conn: "AND" },
        42,
        { kind: "group", conn: "AND", children: "nope" },
        { kind: "group", conn: "OR", children: [{ type: "Path", value: "/x" }] },
      ])
    );
    expect(nodes).toHaveLength(2);
    expect(isGroup(nodes[1])).toBe(true);
  });

  it("refuses groups nested beyond MAX_GROUP_DEPTH", () => {
    let node: unknown = { type: "Path", conn: "AND", value: "/x" };
    for (let i = 0; i < 10; i++) {
      node = { kind: "group", conn: "AND", children: [node] };
    }
    const nodes = parseMatchRules(JSON.stringify([node]));
    // outermost levels survive up to the cap; the over-deep tail is dropped
    expect(nodes).toHaveLength(1);
    expect(countMatchers(nodes)).toBe(0);
  });
});

describe("parseEntrypoints", () => {
  it("parses JSON arrays, trimming blanks", () => {
    expect(parseEntrypoints('["web"," websecure ",""]')).toEqual([
      "web",
      "websecure",
    ]);
  });
  it("returns [] for empty array and null", () => {
    expect(parseEntrypoints("[]")).toEqual([]);
    expect(parseEntrypoints(null)).toEqual([]);
    expect(parseEntrypoints("")).toEqual([]);
  });
  it("falls back to comma-splitting non-JSON", () => {
    expect(parseEntrypoints("web, websecure")).toEqual(["web", "websecure"]);
  });
});

describe("hostToken / hostTokensOfRule", () => {
  it("composes subdomain and apex hosts", () => {
    expect(hostToken("subdomain", "app", "ex.com")).toBe("app.ex.com");
    expect(hostToken("apex", "app", "ex.com")).toBe("ex.com");
    expect(hostToken("subdomain", "", "ex.com")).toBe("ex.com");
  });
  it("extracts Host() args from assembled rules", () => {
    const rule = assembleRule("a.com", [
      g("OR", m("Host", "OR", "b.com"), m("PathPrefix", "AND", "/x")),
    ]);
    expect(hostTokensOfRule(rule)).toEqual(["a.com", "b.com"]);
  });
});

describe("tree operations", () => {
  const tree: RuleNode[] = [
    m("PathPrefix", "AND", "/api"),
    g("OR", m("Method", "AND", undefined, { method: "GET" }), m("Method", "OR", undefined, { method: "HEAD" })),
    m("ClientIP", "AND", "10.0.0.0/8"),
  ];

  it("getNode resolves nested paths", () => {
    expect(getNode(tree, [0])).toMatchObject({ type: "PathPrefix" });
    expect(getNode(tree, [1, 1])).toMatchObject({ method: "HEAD" });
    expect(getNode(tree, [0, 1])).toBeNull();
    expect(getNode(tree, [9])).toBeNull();
  });

  it("updateNode patches without mutating the original", () => {
    const next = updateNode(tree, [1, 0], { method: "POST" });
    expect(getNode(next, [1, 0])).toMatchObject({ method: "POST" });
    expect(getNode(tree, [1, 0])).toMatchObject({ method: "GET" });
  });

  it("removeNode deletes nested nodes", () => {
    const next = removeNode(tree, [1, 0]);
    expect(countMatchers(next)).toBe(3);
    expect(getNode(next, [1, 0])).toMatchObject({ method: "HEAD" });
    expect(removeNode(tree, [7])).toBe(tree);
  });

  it("insertNode places a node at the path", () => {
    const next = insertNode(tree, [1, 1], m("Path", "AND", "/healthz"));
    expect(getNode(next, [1, 1])).toMatchObject({ type: "Path" });
    expect(countMatchers(next)).toBe(5);
  });

  it("moveNode reorders within a container (forward shift)", () => {
    const next = moveNode(tree, [0], [2]);
    expect(getNode(next, [1])).toMatchObject({ type: "PathPrefix" });
    expect(getNode(next, [2])).toMatchObject({ type: "ClientIP" });
    expect(countMatchers(next)).toBe(countMatchers(tree));
  });

  it("moveNode moves a matcher into a group", () => {
    const next = moveNode(tree, [2], [1, 0]);
    expect(getNode(next, [1, 0])).toMatchObject({ type: "ClientIP" });
    expect(countMatchers(next)).toBe(countMatchers(tree));
    expect((next[1] as RuleGroup).children).toHaveLength(3);
  });

  it("moveNode moves out of a group, adjusting for the removal shift", () => {
    const next = moveNode(tree, [1, 0], [2]);
    expect(getNode(next, [2])).toMatchObject({ method: "GET" });
    expect((next[1] as RuleGroup).children).toHaveLength(1);
  });

  it("moveNode refuses moving a group into itself", () => {
    expect(moveNode(tree, [1], [1, 1])).toBe(tree);
  });

  it("ungroupNode hoists children and hands the first the group connector", () => {
    const next = ungroupNode(tree, [1]);
    expect(next).toHaveLength(4);
    expect(getNode(next, [1])).toMatchObject({ method: "GET", conn: "OR" });
    expect(getNode(next, [2])).toMatchObject({ method: "HEAD" });
    expect(ungroupNode(tree, [0])).toBe(tree); // not a group
  });

  it("countMatchers counts leaves at every depth", () => {
    expect(countMatchers(tree)).toBe(4);
    expect(countMatchers([])).toBe(0);
  });
});
