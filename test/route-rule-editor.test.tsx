// @vitest-environment jsdom
/* Component tests for the route-rule editor tree UI.
 * The host is a first-class Host rule in the tree: legacy column-based
 * services get a leading Host row, new services start with one empty
 * domain-backed Host rule, and the legacy columns are DERIVED from the
 * first Host rule on every onChange.
 * Drag-and-drop is NOT simulated here — reordering logic lives in
 * lib/route-rule.ts moveNode() / lib/route-rule-dnd.ts and is covered by
 * test/route-rule.test.ts + test/route-rule-dnd.test.ts. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  HostnameMode,
  MatchRule,
  RuleGroup,
  RuleNode,
} from "@/lib/route-rule";
import type {
  EntrypointsResponse,
  RouteConflictsResponse,
} from "@/lib/traefik-client-types";

const mockState = vi.hoisted(() => ({
  entrypoints: null as unknown,
  conflicts: null as unknown,
}));

vi.mock("@/hooks/use-traefik", () => ({
  useTraefikEntrypoints: () => ({
    entrypoints: mockState.entrypoints,
    loading: false,
    refresh: vi.fn(),
  }),
  useRouteConflicts: () => ({
    conflicts: mockState.conflicts,
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  RouteRuleEditor,
  legacyHostTree,
} from "@/components/traefik/route-rule-editor";

const entrypointsFixture = {
  configured: true,
  reachable: true,
  entrypoints: [
    { name: "web", address: ":80" },
    { name: "websecure", address: ":443" },
  ],
} as unknown as EntrypointsResponse;

const noConflicts: RouteConflictsResponse = {
  configured: true,
  reachable: true,
  routers: [],
};

const domains = [
  { id: "d1", name: "Example", domain: "example.com", isDefault: true },
  { id: "d2", name: "Other", domain: "other.org", isDefault: false },
];

interface Emitted {
  domainId: string;
  subdomain: string | null;
  hostnameMode: HostnameMode;
  customHostnames: string[] | null;
  entrypoints: string[];
  matchRules: RuleNode[];
}

function lastEmitted(onChange: ReturnType<typeof vi.fn>): Emitted {
  const call = onChange.mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![0] as Emitted;
}

/** Editing an existing legacy service (host in the columns). */
function renderEditor(
  matchRules: RuleNode[] = [],
  initialOverrides: Partial<{
    domainId: string;
    subdomain: string;
    hostnameMode: HostnameMode;
    customHostnames: string | null;
    entrypoints: string[];
  }> = {}
) {
  const onChange = vi.fn();
  const onBlockedChange = vi.fn();
  render(
    <RouteRuleEditor
      initial={{
        domainId: "d1",
        subdomain: "app",
        hostnameMode: "subdomain",
        entrypoints: ["websecure"],
        matchRules,
        ...initialOverrides,
      }}
      domains={domains}
      serviceId="svc-1"
      onChange={onChange}
      onBlockedChange={onBlockedChange}
    />
  );
  return { onChange, onBlockedChange };
}

/** Creating a brand-new service (no serviceId, empty columns). */
function renderNewService() {
  const onChange = vi.fn();
  const onBlockedChange = vi.fn();
  render(
    <RouteRuleEditor
      initial={{
        domainId: "",
        subdomain: "",
        hostnameMode: "subdomain",
        entrypoints: [],
        matchRules: [],
      }}
      domains={domains}
      onChange={onChange}
      onBlockedChange={onBlockedChange}
    />
  );
  return { onChange, onBlockedChange };
}

const m = (type: MatchRule["type"], conn: MatchRule["conn"], value?: string, extra: Partial<MatchRule> = {}): MatchRule =>
  ({ type, conn, value, ...extra });
const g = (conn: RuleGroup["conn"], ...children: RuleNode[]): RuleGroup =>
  ({ kind: "group", conn, children });

beforeEach(() => {
  mockState.entrypoints = entrypointsFixture;
  mockState.conflicts = noConflicts;
});
afterEach(() => cleanup());

describe("RouteRuleEditor host rules", () => {
  it("a new service starts with one empty domain-backed Host row and is blocked until the subdomain is filled", async () => {
    const user = userEvent.setup();
    const { onChange, onBlockedChange } = renderNewService();

    // one Host row with the domain composer, default domain preselected
    const sub = screen.getByLabelText("Subdomain") as HTMLInputElement;
    expect(sub.value).toBe("");
    expect(document.activeElement).toBe(sub);
    expect(screen.getByRole("button", { name: /example\.com/ })).toBeDefined();

    // blocked + inline hint while the host is unfilled
    expect(onBlockedChange).toHaveBeenCalledWith(true);
    expect(
      screen.getAllByText(/fill in the public hostname/i).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/fill in the public hostname to preview the rule/i)
    ).toBeDefined();

    await user.type(sub, "app");

    expect(onBlockedChange.mock.calls.at(-1)?.[0]).toBe(false);
    const emitted = lastEmitted(onChange);
    expect(emitted.hostnameMode).toBe("subdomain");
    expect(emitted.subdomain).toBe("app");
    expect(emitted.domainId).toBe("d1"); // default domain backfilled
    expect(emitted.customHostnames).toBeNull();
    expect(emitted.matchRules).toHaveLength(1);
    expect(emitted.matchRules[0]).toMatchObject({
      type: "Host",
      domainId: "d1",
      sub: "app",
    });
  });

  it("legacy sub/apex columns convert into a leading domain-backed Host row", () => {
    const { onChange } = renderEditor([m("PathPrefix", "AND", "/api")]);

    const sub = screen.getByLabelText("Subdomain") as HTMLInputElement;
    expect(sub.value).toBe("app");
    expect(screen.getByRole("button", { name: /example\.com/ })).toBeDefined();

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toHaveLength(2);
    expect(emitted.matchRules[0]).toMatchObject({
      type: "Host",
      conn: "AND",
      domainId: "d1",
      sub: "app",
    });
    expect(emitted.hostnameMode).toBe("subdomain");
    expect(emitted.subdomain).toBe("app");
    expect(emitted.customHostnames).toBeNull();
  });

  it("legacy custom hostnames convert into free-text Host rows (first AND, rest OR)", () => {
    const { onChange } = renderEditor([], {
      subdomain: "",
      hostnameMode: "custom",
      customHostnames: JSON.stringify(["a.example.com", "b.other.org"]),
    });

    const hosts = screen.getAllByLabelText("Hostname") as HTMLInputElement[];
    expect(hosts.map((h) => h.value)).toEqual(["a.example.com", "b.other.org"]);

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toEqual([
      { type: "Host", conn: "AND", value: "a.example.com" },
      { type: "Host", conn: "OR", value: "b.other.org" },
    ]);
    expect(emitted.hostnameMode).toBe("custom");
    expect(emitted.customHostnames).toEqual(["a.example.com", "b.other.org"]);
    expect(emitted.subdomain).toBeNull();
  });

  it("derives apex columns from a domain-backed apex Host rule", () => {
    const { onChange } = renderEditor([
      { type: "Host", conn: "AND", domainId: "d1", apex: true },
    ]);

    const emitted = lastEmitted(onChange);
    expect(emitted.hostnameMode).toBe("apex");
    expect(emitted.subdomain).toBeNull();
    expect(emitted.domainId).toBe("d1");
    expect(emitted.customHostnames).toBeNull();
  });

  it("derives custom columns from a free-text first Host rule, collecting ALL tree hosts", () => {
    const { onChange } = renderEditor([
      m("Host", "AND", "alt.example.org"),
      m("PathPrefix", "AND", "/x"),
      { type: "Host", conn: "OR", domainId: "d2", sub: "www" },
    ]);

    const emitted = lastEmitted(onChange);
    expect(emitted.hostnameMode).toBe("custom");
    expect(emitted.domainId).toBe("d1"); // keeps the service's current domain
    expect(emitted.subdomain).toBeNull();
    expect(emitted.customHostnames).toEqual(["alt.example.org", "www.other.org"]);
  });

  it("switches a Host row to free-text (keeps the composed value) and back to a managed domain", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([]);

    // open the domain menu and pick "Custom hostname…"
    await user.click(screen.getByRole("button", { name: /example\.com/ }));
    const menu = document.querySelector(".host-menu") as HTMLElement;
    await user.click(within(menu).getByText(/custom hostname/i));

    const free = screen.getByLabelText("Hostname") as HTMLInputElement;
    expect(free.value).toBe("app.example.com");
    let emitted = lastEmitted(onChange);
    expect(emitted.hostnameMode).toBe("custom");
    expect(emitted.customHostnames).toEqual(["app.example.com"]);
    expect(emitted.matchRules[0]).toMatchObject({
      type: "Host",
      value: "app.example.com",
    });

    // switch back: the value is split against the managed domains
    await user.click(screen.getByRole("button", { name: /use a managed domain/i }));
    emitted = lastEmitted(onChange);
    expect(emitted.hostnameMode).toBe("subdomain");
    expect(emitted.subdomain).toBe("app");
    expect(emitted.domainId).toBe("d1");
    expect(emitted.matchRules[0]).toMatchObject({
      type: "Host",
      domainId: "d1",
      sub: "app",
    });
  });
});

describe("RouteRuleEditor tree UI", () => {
  it("renders the initial tree including a group, with the preview assembled from the tree", () => {
    renderEditor([
      m("PathPrefix", "AND", "/api"),
      g("OR", m("Method", "AND", undefined, { method: "GET" }), m("Method", "OR", undefined, { method: "HEAD" })),
    ]);

    expect(screen.getByDisplayValue("/api")).toBeDefined();
    expect(screen.getByText("Group")).toBeDefined();
    expect(screen.getByText("2 rules")).toBeDefined();

    // live preview assembles the SELF-CONTAINED tree (host included, group parenthesized)
    const code = document.querySelector(".rp-code");
    expect(code?.textContent).toBe(
      "((Host(`app.example.com`) && PathPrefix(`/api`)) || (Method(`GET`) || Method(`HEAD`)))"
    );
    // public URL hint sits next to the preview
    expect(
      document.querySelector(".rp-url")?.textContent
    ).toContain("https://app.example.com");
  });

  it("Add rule appends a matcher at the top level", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([]);

    await user.click(screen.getAllByRole("button", { name: /add rule/i })[0]);
    // scope to the open menu — matcher-type labels also exist as <option>s
    const menu = document.querySelector(".addmatch-menu") as HTMLElement;
    await user.click(within(menu).getByText("Path prefix"));

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toHaveLength(2); // Host + new matcher
    expect(emitted.matchRules[1]).toMatchObject({ type: "PathPrefix", conn: "AND" });
  });

  it("the Add rule menu's Host option adds a domain-backed Host row on the default domain", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([]);

    await user.click(screen.getAllByRole("button", { name: /add rule/i })[0]);
    const menu = document.querySelector(".addmatch-menu") as HTMLElement;
    await user.click(within(menu).getByText("Host"));

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toHaveLength(2);
    expect(emitted.matchRules[1]).toMatchObject({
      type: "Host",
      conn: "OR",
      domainId: "d1",
      sub: "",
    });
    // two composers now: the primary host row + the new one
    expect(screen.getAllByLabelText("Subdomain")).toHaveLength(2);
  });

  it("Add group appends an empty group with a hint", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([m("PathPrefix", "AND", "/api")]);

    await user.click(screen.getByRole("button", { name: /add group/i }));

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toHaveLength(3); // Host + PathPrefix + group
    expect(emitted.matchRules[2]).toEqual({ kind: "group", conn: "AND", children: [] });
    expect(screen.getByText(/drag rules here or add one/i)).toBeDefined();
  });

  it("the group's Add rule menu appends into the group", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([g("OR", m("Path", "AND", "/healthz"))]);

    // index 0 = toolbar menu, index 1 = group-header menu
    await user.click(screen.getAllByRole("button", { name: /add rule/i })[1]);
    // scope to the open menu — matcher-type labels also exist as <option>s
    const menu = document.querySelector(".addmatch-menu") as HTMLElement;
    await user.click(within(menu).getByText("Query param"));

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toHaveLength(2); // Host + group
    const group = emitted.matchRules[1] as RuleGroup;
    expect(group.children).toHaveLength(2);
    expect(group.children[1]).toMatchObject({ type: "Query" });
  });

  it("Add group is available INSIDE a top-level group but not at depth 2", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([g("AND", m("Path", "AND", "/a"))]);

    // toolbar + top-level group header
    expect(screen.getAllByRole("button", { name: /add group/i })).toHaveLength(2);

    await user.click(screen.getAllByRole("button", { name: /add group/i })[1]);

    const emitted = lastEmitted(onChange);
    const group = emitted.matchRules[1] as RuleGroup;
    expect(group.children).toHaveLength(2);
    expect(group.children[1]).toEqual({ kind: "group", conn: "AND", children: [] });

    // the nested group renders as a fully editable panel…
    expect(screen.getByText("Nested group")).toBeDefined();
    // …but offers no "Add group" of its own (UI max depth = 2)
    expect(screen.getAllByRole("button", { name: /add group/i })).toHaveLength(2);
  });

  it("ungrouping a nested group hoists its rules into the parent group", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([
      g("AND", m("Path", "AND", "/a"), g("OR", m("Path", "AND", "/b"))),
    ]);

    // DOM order: outer group's Ungroup first, nested group's second
    await user.click(screen.getAllByRole("button", { name: /ungroup/i })[1]);

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toHaveLength(2); // Host + outer group
    const outer = emitted.matchRules[1] as RuleGroup;
    expect(outer.children).toHaveLength(2);
    expect(outer.children[0]).toMatchObject({ type: "Path", value: "/a" });
    // the hoisted first child inherits the nested group's connector
    expect(outer.children[1]).toMatchObject({ type: "Path", value: "/b", conn: "OR" });
  });

  it("Ungroup hoists children; the first child inherits the group connector", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([
      g("OR", m("Method", "AND", undefined, { method: "GET" }), m("Method", "OR", undefined, { method: "HEAD" })),
    ]);

    await user.click(screen.getByRole("button", { name: /ungroup/i }));

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toHaveLength(3); // Host + 2 hoisted matchers
    expect(emitted.matchRules[1]).toMatchObject({ method: "GET", conn: "OR" });
    expect(emitted.matchRules[2]).toMatchObject({ method: "HEAD", conn: "OR" });
  });

  it("connector toggle emits onChange with the updated tree", async () => {
    const user = userEvent.setup();
    // tree-format service: carries its own Host rules, used as-is
    const { onChange } = renderEditor([
      { type: "Host", conn: "AND", domainId: "d1", sub: "app" },
      m("PathPrefix", "AND", "/api"),
      m("Host", "OR", "alt.example.com"),
    ]);

    // the leading Host row's connector is a disabled ghost, so the toggles
    // are PathPrefix ([0]) and the free-text Host ([1])
    const toggles = screen.getAllByTitle("Toggle AND / OR");
    expect(toggles).toHaveLength(2);
    await user.click(toggles[1]); // free-text Host: OR → AND

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules[2]).toMatchObject({ type: "Host", conn: "AND" });
    expect(emitted.matchRules[1]).toMatchObject({ type: "PathPrefix", conn: "AND" });
  });

  it("the first row of the tree and of each group renders a disabled (meaningless) connector", () => {
    renderEditor([g("AND", m("Path", "AND", "/a"), m("Path", "OR", "/b"))]);
    // root Host row + the group's first child
    const ghosts = document.querySelectorAll(".m-conn.ghost");
    expect(ghosts).toHaveLength(2);
    for (const ghost of ghosts) {
      expect((ghost as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe("RouteRuleEditor entrypoints", () => {
  it("hides the dedicated 'traefik' API entrypoint unless already saved", () => {
    mockState.entrypoints = {
      configured: true,
      reachable: true,
      entrypoints: [
        { name: "web", address: ":80" },
        { name: "websecure", address: ":443" },
        { name: "traefik", address: ":8080" },
      ],
    } as unknown as EntrypointsResponse;

    renderEditor([]);
    // scope to the picker grid — the hint text below it mentions "traefik"
    const grid = document.querySelector(".ep-grid") as HTMLElement;
    expect(within(grid).getByText("websecure")).toBeDefined();
    expect(within(grid).queryByText("traefik")).toBeNull();
  });

  it("shows the 'traefik' entrypoint with an API warning badge when the service already uses it", () => {
    mockState.entrypoints = {
      configured: true,
      reachable: true,
      entrypoints: [
        { name: "web", address: ":80" },
        { name: "websecure", address: ":443" },
        { name: "traefik", address: ":8080" },
      ],
    } as unknown as EntrypointsResponse;

    const { onChange } = renderEditor([], {
      entrypoints: ["websecure", "traefik"],
    });
    const grid = document.querySelector(".ep-grid") as HTMLElement;
    expect(within(grid).getByText("traefik")).toBeDefined();
    expect(within(grid).getByText("API")).toBeDefined();
    expect(lastEmitted(onChange).entrypoints).toEqual(["websecure", "traefik"]);
  });
});

describe("RouteRuleEditor conflicts", () => {
  it("does NOT show a conflict banner for internal cert-trigger routers", () => {
    mockState.conflicts = {
      configured: true,
      reachable: true,
      routers: [
        {
          routerName: "wildcard-cert-router-example-com@http",
          hosts: ["app.example.com"],
          entryPoints: ["websecure"],
          provider: "http",
          managedServiceId: null,
          internal: true,
        },
      ],
    } satisfies RouteConflictsResponse;

    renderEditor([]);
    expect(
      screen.queryByText(/conflicts with a router outside this tool/i)
    ).toBeNull();
  });

  it("still shows the banner for genuine external conflicts and blocks saving", () => {
    mockState.conflicts = {
      configured: true,
      reachable: true,
      routers: [
        {
          routerName: "grafana@file",
          hosts: ["app.example.com"],
          entryPoints: ["websecure"],
          provider: "file",
          managedServiceId: null,
        },
      ],
    } satisfies RouteConflictsResponse;

    const { onBlockedChange } = renderEditor([]);
    expect(
      screen.getByText(/conflicts with a router outside this tool/i)
    ).toBeDefined();
    expect(onBlockedChange.mock.calls.at(-1)?.[0]).toBe(true);
  });

  it("skips the service's OWN routers — editing a multi-entrypoint service is not a conflict", () => {
    // The original bug: the service's own (split, per-entrypoint) runtime
    // routers were flagged as "already existing" while editing that service.
    mockState.conflicts = {
      configured: true,
      reachable: true,
      routers: [
        {
          routerName: "router-app-example-com-websecure@http",
          hosts: ["app.example.com"],
          entryPoints: ["websecure"],
          provider: "http",
          managedServiceId: "svc-1", // === the editor's serviceId
        },
        {
          routerName: "router-app-example-com-web@http",
          hosts: ["app.example.com"],
          entryPoints: ["web"],
          provider: "http",
          managedServiceId: "svc-1",
        },
      ],
    } satisfies RouteConflictsResponse;

    const { onBlockedChange } = renderEditor([], {
      entrypoints: ["web", "websecure"],
    });
    expect(
      screen.queryByText(/already managed here|conflicts with a router/i)
    ).toBeNull();
    expect(onBlockedChange).not.toHaveBeenCalledWith(true);
  });

  it("shows a NON-blocking banner when the rule belongs to a different managed service", () => {
    mockState.conflicts = {
      configured: true,
      reachable: true,
      routers: [
        {
          routerName: "router-app-example-com@http",
          hosts: ["app.example.com"],
          entryPoints: ["websecure"],
          provider: "http",
          managedServiceId: "other-svc",
        },
      ],
    } satisfies RouteConflictsResponse;

    const { onBlockedChange } = renderEditor([]);
    expect(screen.getByText(/already managed here/i)).toBeDefined();
    expect(onBlockedChange).not.toHaveBeenCalledWith(true);
  });
});

describe("legacyHostTree", () => {
  it("returns a tree that already carries a Host rule untouched", () => {
    const tree: RuleNode[] = [m("Host", "AND", "x.example.com")];
    expect(
      legacyHostTree({
        domainId: "d1",
        subdomain: "app",
        hostnameMode: "subdomain",
        matchRules: tree,
      })
    ).toBe(tree);
  });

  it("builds an empty domain-backed Host rule for blank new-service columns", () => {
    expect(
      legacyHostTree({
        domainId: "",
        subdomain: "",
        hostnameMode: "subdomain",
        matchRules: [],
      })
    ).toEqual([{ type: "Host", conn: "AND", domainId: "", sub: "" }]);
  });
});
