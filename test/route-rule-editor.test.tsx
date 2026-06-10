// @vitest-environment jsdom
/* Component tests for the route-rule editor tree UI.
 * Drag-and-drop is NOT simulated here — reordering logic lives in
 * lib/route-rule.ts moveNode() and is covered by test/route-rule.test.ts. */
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

import { RouteRuleEditor } from "@/components/traefik/route-rule-editor";

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
];

interface Emitted {
  domainId: string;
  subdomain: string | null;
  hostnameMode: HostnameMode;
  entrypoints: string[];
  matchRules: RuleNode[];
}

function lastEmitted(onChange: ReturnType<typeof vi.fn>): Emitted {
  const call = onChange.mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![0] as Emitted;
}

function renderEditor(matchRules: RuleNode[] = []) {
  const onChange = vi.fn();
  render(
    <RouteRuleEditor
      initial={{
        domainId: "d1",
        subdomain: "app",
        hostnameMode: "subdomain",
        entrypoints: ["websecure"],
        matchRules,
      }}
      domains={domains}
      serviceId="svc-1"
      onChange={onChange}
    />
  );
  return { onChange };
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

describe("RouteRuleEditor tree UI", () => {
  it("renders the initial tree including a group", () => {
    renderEditor([
      m("PathPrefix", "AND", "/api"),
      g("OR", m("Method", "AND", undefined, { method: "GET" }), m("Method", "OR", undefined, { method: "HEAD" })),
    ]);

    expect(screen.getByDisplayValue("/api")).toBeDefined();
    expect(screen.getByText("Group")).toBeDefined();
    expect(screen.getByText("2 rules")).toBeDefined();

    // live preview assembles the tree (group parenthesized)
    const code = document.querySelector(".rp-code");
    expect(code?.textContent).toBe(
      "((Host(`app.example.com`) && PathPrefix(`/api`)) || (Method(`GET`) || Method(`HEAD`)))"
    );
  });

  it("Add rule appends a matcher at the top level", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([]);

    await user.click(screen.getAllByRole("button", { name: /add rule/i })[0]);
    await user.click(screen.getByText("Path prefix"));

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toHaveLength(1);
    expect(emitted.matchRules[0]).toMatchObject({ type: "PathPrefix", conn: "AND" });
  });

  it("Add group appends an empty group with a hint", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([m("PathPrefix", "AND", "/api")]);

    await user.click(screen.getByRole("button", { name: /add group/i }));

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toHaveLength(2);
    expect(emitted.matchRules[1]).toEqual({ kind: "group", conn: "AND", children: [] });
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
    expect(emitted.matchRules).toHaveLength(1);
    const group = emitted.matchRules[0] as RuleGroup;
    expect(group.children).toHaveLength(2);
    expect(group.children[1]).toMatchObject({ type: "Query" });
  });

  it("Ungroup hoists children; the first child inherits the group connector", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([
      g("OR", m("Method", "AND", undefined, { method: "GET" }), m("Method", "OR", undefined, { method: "HEAD" })),
    ]);

    await user.click(screen.getByRole("button", { name: /ungroup/i }));

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules).toHaveLength(2);
    expect(emitted.matchRules[0]).toMatchObject({ method: "GET", conn: "OR" });
    expect(emitted.matchRules[1]).toMatchObject({ method: "HEAD", conn: "OR" });
  });

  it("connector toggle emits onChange with the updated tree", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor([
      m("PathPrefix", "AND", "/api"),
      m("Host", "OR", "alt.example.com"),
    ]);

    const toggles = screen.getAllByTitle("Toggle AND / OR");
    await user.click(toggles[1]); // second row: OR → AND

    const emitted = lastEmitted(onChange);
    expect(emitted.matchRules[1]).toMatchObject({ type: "Host", conn: "AND" });
    expect(emitted.matchRules[0]).toMatchObject({ type: "PathPrefix", conn: "AND" });
  });

  it("the first rule inside a group renders a disabled (meaningless) connector", () => {
    renderEditor([g("AND", m("Path", "AND", "/a"), m("Path", "OR", "/b"))]);
    const ghost = document.querySelector(".m-conn.ghost") as HTMLButtonElement;
    expect(ghost).toBeTruthy();
    expect(ghost.disabled).toBe(true);
  });

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

  it("still shows the banner for genuine external conflicts", () => {
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

    renderEditor([]);
    expect(
      screen.getByText(/conflicts with a router outside this tool/i)
    ).toBeDefined();
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

    const onBlockedChange = vi.fn();
    render(
      <RouteRuleEditor
        initial={{
          domainId: "d1",
          subdomain: "app",
          hostnameMode: "subdomain",
          entrypoints: ["web", "websecure"],
          matchRules: [],
        }}
        domains={domains}
        serviceId="svc-1"
        onChange={vi.fn()}
        onBlockedChange={onBlockedChange}
      />
    );
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

    const onBlockedChange = vi.fn();
    render(
      <RouteRuleEditor
        initial={{
          domainId: "d1",
          subdomain: "app",
          hostnameMode: "subdomain",
          entrypoints: ["websecure"],
          matchRules: [],
        }}
        domains={domains}
        serviceId="svc-1"
        onChange={vi.fn()}
        onBlockedChange={onBlockedChange}
      />
    );
    expect(screen.getByText(/already managed here/i)).toBeDefined();
    expect(onBlockedChange).not.toHaveBeenCalledWith(true);
  });
});
