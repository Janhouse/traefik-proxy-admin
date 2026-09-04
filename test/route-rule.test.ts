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
  isHostOnlyRule,
  isMatchType,
  validateMatchRulesPayload,
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

  it("drops nodes with an unknown or injected matcher type", () => {
    const nodes = parseMatchRules(
      JSON.stringify([
        { type: "Host(`x`) || PathPrefix", conn: "AND", value: "/" },
        { type: "pathprefix", conn: "AND", value: "/api" }, // case matters
        { type: "Path", conn: "AND", value: "/ok" },
        { kind: "group", conn: "OR", children: [{ type: "Evil", conn: "AND", value: "x" }] },
      ])
    );
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ type: "Path", value: "/ok" });
    expect(countMatchers(nodes)).toBe(1);
    // and the assembled rule never carries the injected text
    expect(assembleRule("a.com", nodes)).toBe("(Host(`a.com`) && Path(`/ok`))");
    expect(isMatchType("Host")).toBe(true);
    expect(isMatchType("Host(`x`)")).toBe(false);
    expect(isMatchType(42)).toBe(false);
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

  it("handles v2 multi-arg Host(), whitespace, case, empties and HostRegexp", () => {
    expect(hostTokensOfRule("Host(`a.com`, `B.com`)")).toEqual(["a.com", "b.com"]);
    expect(hostTokensOfRule("Host(`a.com`,`b.com`,`c.com`)")).toEqual(["a.com", "b.com", "c.com"]);
    expect(hostTokensOfRule("Host( `a.com` )")).toEqual(["a.com"]);
    expect(hostTokensOfRule("Host (`a.com`) && Path(`/x`)")).toEqual(["a.com"]);
    expect(hostTokensOfRule("Host(`App.Example.COM`)")).toEqual(["app.example.com"]);
    expect(hostTokensOfRule("Host(``) || Host(`a.com`)")).toEqual(["a.com"]);
    expect(hostTokensOfRule("HostRegexp(`^.+\\.example\\.com$`)")).toEqual([]);
    expect(hostTokensOfRule("HostSNI(`a.com`)")).toEqual([]);
    expect(hostTokensOfRule("PathPrefix(`/Host(`)")).toEqual([]);
    expect(hostTokensOfRule("")).toEqual([]);
  });
});

describe("isHostOnlyRule", () => {
  it("is true only for Host()/HostRegexp() joined by && / ||", () => {
    expect(isHostOnlyRule("Host(`a.com`)")).toBe(true);
    expect(isHostOnlyRule("Host(`a.com`) || Host(`b.com`)")).toBe(true);
    expect(isHostOnlyRule("(Host(`a.com`, `b.com`)) && HostRegexp(`^x\\.a\\.com$`)")).toBe(true);
    expect(isHostOnlyRule("HostRegexp(`^.+\\.a\\.com$`)")).toBe(true);
    expect(isHostOnlyRule(" Host( `a.com` ) ")).toBe(true);
  });

  it("is false when anything narrows the host, or nothing is a host", () => {
    expect(isHostOnlyRule("Host(`a.com`) && PathPrefix(`/api`)")).toBe(false);
    expect(isHostOnlyRule("(Host(`a.com`)) && Path(`/.well-known/traefik-cert-trigger`)")).toBe(false);
    expect(isHostOnlyRule("Host(`a.com`) && Header(`X-Env`, `staging`)")).toBe(false);
    expect(isHostOnlyRule("Host(`a.com`) && Query(`debug`, `1`)")).toBe(false);
    expect(isHostOnlyRule("Host(`a.com`) && ClientIP(`10.0.0.0/8`)")).toBe(false);
    expect(isHostOnlyRule("Host(`a.com`) && Method(`GET`)")).toBe(false);
    expect(isHostOnlyRule("!Host(`a.com`)")).toBe(false);
    expect(isHostOnlyRule("HostSNI(`a.com`)")).toBe(false);
    expect(isHostOnlyRule("PathPrefix(`/only`)")).toBe(false);
    expect(isHostOnlyRule("")).toBe(false);
    // a Path arg containing the word Host must not fool it
    expect(isHostOnlyRule("PathPrefix(`/Host`)")).toBe(false);
  });
});

describe("validateMatchRulesPayload", () => {
  const ok = (nodes: unknown[]) => expect(validateMatchRulesPayload(nodes)).toBeNull();
  const bad = (nodes: unknown[], msg: string | RegExp) =>
    expect(validateMatchRulesPayload(nodes)).toMatch(msg);

  it("accepts absent/empty payloads and well-formed trees", () => {
    expect(validateMatchRulesPayload(undefined)).toBeNull();
    expect(validateMatchRulesPayload(null)).toBeNull();
    ok([]);
    ok([
      { type: "Host", conn: "AND", value: "app.example.com" },
      { type: "Host", conn: "OR", domainId: "d1", sub: "app" },
      { type: "Host", conn: "OR", domainId: "d1", apex: true },
      { type: "Host", conn: "OR", value: "*.example.com" },
      { type: "PathPrefix", conn: "AND", value: "/api" },
      { type: "Path", conn: "AND", value: "/healthz" },
      { type: "PathRegexp", conn: "AND", value: "^/v[0-9]+/" },
      { type: "Header", conn: "AND", key: "X-Env", value: "staging" },
      { type: "Query", conn: "AND", key: "debug", value: "1" },
      { type: "Method", conn: "AND", method: "POST" },
      { type: "Method", conn: "AND" },
      { type: "ClientIP", conn: "AND", value: "10.0.0.0/24" },
      { type: "HostRegexp", conn: "AND", value: "^.+\\.example\\.com$" },
      { kind: "group", conn: "OR", children: [{ type: "PathPrefix", conn: "AND", value: "/ws" }] },
    ]);
  });

  it("rejects the rule-injection payload and unknown types", () => {
    bad([{ type: "Host(`x`) || PathPrefix", conn: "AND", value: "/" }], /Unknown match rule type/);
    bad([{ type: "pathprefix", conn: "AND", value: "/api" }], /Unknown match rule type/);
    bad([{ conn: "AND", value: "/api" }], /Unknown match rule type/);
    bad([{ kind: "group", conn: "AND", children: [{ type: "Evil", conn: "AND" }] }], /Unknown match rule type/);
    expect(validateMatchRulesPayload("nope")).toMatch(/must be an array/);
    bad([42], /Invalid match rule/);
    bad([{ kind: "group", conn: "AND", children: "nope" }], /no children/);
  });

  it("rejects empty matcher arguments", () => {
    bad([{ type: "PathPrefix", conn: "AND", value: "" }], /PathPrefix rule needs a path/);
    bad([{ type: "PathPrefix", conn: "AND" }], /PathPrefix rule needs a path/);
    bad([{ type: "Path", conn: "AND", value: "   " }], /Path rule needs a path/);
    bad([{ type: "Host", conn: "AND", value: "" }], /Host rule needs a hostname/);
    bad([{ type: "Host", conn: "AND", domainId: "d1", sub: "" }], /subdomain or the apex/);
    bad([{ type: "PathRegexp", conn: "AND", value: "" }], /PathRegexp rule needs a value/);
    bad([{ type: "HostRegexp", conn: "AND" }], /HostRegexp rule needs a value/);
    bad([{ type: "ClientIP", conn: "AND", value: "" }], /ClientIP rule needs a value/);
    bad([{ type: "Header", conn: "AND", key: "", value: "x" }], /Header rule needs a key/);
    bad([{ type: "Header", conn: "AND", key: "X", value: "" }], /Header rule needs a value/);
    bad([{ type: "Query", conn: "AND", value: "1" }], /Query rule needs a key/);
  });

  it("rejects paths not starting with / and hosts that are not hostnames", () => {
    bad([{ type: "PathPrefix", conn: "AND", value: "api" }], /must start with "\/"/);
    bad([{ type: "Path", conn: "AND", value: "healthz" }], /must start with "\/"/);
    bad([{ type: "Host", conn: "AND", value: "a`) || PathPrefix(`/" }], /Invalid hostname/);
    bad([{ type: "Host", conn: "AND", value: "app.example.com/path" }], /Invalid hostname/);
    bad([{ type: "Host", conn: "AND", value: "app example.com" }], /Invalid hostname/);
    bad([{ type: "Host", conn: "AND", domainId: "d1", sub: "a`b" }], /Invalid subdomain/);
    bad([{ type: "Method", conn: "AND", method: "GET`)" }], /Invalid HTTP method/);
  });

  it("reports nested problems inside groups", () => {
    bad(
      [{ kind: "group", conn: "AND", children: [{ kind: "group", conn: "OR", children: [{ type: "PathPrefix", conn: "AND", value: "" }] }] }],
      /PathPrefix rule needs a path/
    );
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
