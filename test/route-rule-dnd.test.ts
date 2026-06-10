import { describe, expect, it } from "vitest";
import {
  applyDrop,
  containerChildren,
  containerId,
  itemId,
  parseDndId,
} from "@/lib/route-rule-dnd";
import {
  countMatchers,
  getNode,
  type MatchRule,
  type RuleGroup,
  type RuleNode,
} from "@/lib/route-rule";

const m = (value: string): MatchRule => ({
  type: "PathPrefix",
  conn: "AND",
  value,
});
const g = (...children: RuleNode[]): RuleGroup => ({
  kind: "group",
  conn: "OR",
  children,
});

// [ /a, group(/g0, /g1), /b ]
const tree: RuleNode[] = [m("/a"), g(m("/g0"), m("/g1")), m("/b")];

describe("dnd id round-trip", () => {
  it("encodes and parses item and container paths", () => {
    expect(parseDndId(itemId([1, 0]))).toEqual({ kind: "item", path: [1, 0] });
    expect(parseDndId(containerId([]))).toEqual({ kind: "container", path: [] });
    expect(parseDndId(containerId([1]))).toEqual({ kind: "container", path: [1] });
  });
  it("rejects malformed ids", () => {
    expect(parseDndId("x:[0]")).toBeNull();
    expect(parseDndId("n:notjson")).toBeNull();
    expect(parseDndId('n:["a"]')).toBeNull();
    expect(parseDndId("n:{}")).toBeNull();
  });
});

describe("applyDrop", () => {
  it("same-container forward drop lands at the hovered slot (arrayMove)", () => {
    const next = applyDrop(tree, [0], { kind: "item", path: [2] });
    expect((next[2] as MatchRule).value).toBe("/a");
    expect((next[1] as MatchRule).value).toBe("/b");
  });

  it("same-container backward drop lands at the hovered slot", () => {
    const next = applyDrop(tree, [2], { kind: "item", path: [0] });
    expect((next[0] as MatchRule).value).toBe("/b");
    expect((next[1] as MatchRule).value).toBe("/a");
  });

  it("drop on the same position is a no-op", () => {
    expect(applyDrop(tree, [0], { kind: "item", path: [0] })).toBe(tree);
  });

  it("cross-container drop inserts before the hovered node", () => {
    const next = applyDrop(tree, [0], { kind: "item", path: [1, 1] });
    const group = next[0] as RuleGroup; // group shifted left after removal
    expect(group.children.map((c) => (c as MatchRule).value)).toEqual([
      "/g0",
      "/a",
      "/g1",
    ]);
    expect(countMatchers(next)).toBe(countMatchers(tree));
  });

  it("drop on a group body appends to its end", () => {
    const next = applyDrop(tree, [2], { kind: "container", path: [1] });
    const group = next[1] as RuleGroup;
    expect(group.children.map((c) => (c as MatchRule).value)).toEqual([
      "/g0",
      "/g1",
      "/b",
    ]);
  });

  it("drop on the root body appends to the top level (drag out of a group)", () => {
    const next = applyDrop(tree, [1, 0], { kind: "container", path: [] });
    expect((next[3] as MatchRule).value).toBe("/g0");
    expect((next[1] as RuleGroup).children).toHaveLength(1);
  });

  it("clamps a group dropped into another container to the top level", () => {
    const twoGroups: RuleNode[] = [g(m("/x")), g(m("/y")), m("/z")];
    const next = applyDrop(twoGroups, [0], { kind: "item", path: [1, 0] });
    // the group must NOT nest inside the other group
    expect(next.filter((n) => (n as RuleGroup).kind === "group")).toHaveLength(2);
    expect(countMatchers(next)).toBe(3);
    for (const n of next) {
      if ((n as RuleGroup).kind === "group") {
        for (const c of (n as RuleGroup).children) {
          expect((c as RuleGroup).kind).toBeUndefined();
        }
      }
    }
  });

  it("ignores drops from a stale path", () => {
    expect(applyDrop(tree, [9], { kind: "item", path: [0] })).toBe(tree);
  });
});

describe("containerChildren", () => {
  it("resolves root and group containers, rejects matchers", () => {
    expect(containerChildren(tree, [])).toBe(tree);
    expect(containerChildren(tree, [1])).toHaveLength(2);
    expect(containerChildren(tree, [0])).toBeNull();
    expect(getNode(tree, [1, 0])).toMatchObject({ value: "/g0" });
  });
});
