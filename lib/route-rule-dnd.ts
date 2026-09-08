/* Pure drag-and-drop semantics for the route-rule editor (client-safe, no
 * React): dnd ids encode NodePaths, and a finished drag resolves into a single
 * moveNode() call. Kept outside the component so the drop semantics are
 * testable without rendering. */

import {
  getNode,
  isGroup,
  moveNode,
  UI_MAX_GROUP_DEPTH,
  type NodePath,
  type RuleNode,
} from "@/lib/route-rule";

/* ── dnd id encoding: sortable items + droppable containers carry NodePaths ── */
export const itemId = (path: NodePath) => `n:${JSON.stringify(path)}`;
export const containerId = (path: NodePath) => `c:${JSON.stringify(path)}`;

export interface DndRef {
  kind: "item" | "container";
  path: NodePath;
}

export function parseDndId(id: string): DndRef | null {
  const kind = id.startsWith("n:") ? "item" : id.startsWith("c:") ? "container" : null;
  if (!kind) return null;
  try {
    const path = JSON.parse(id.slice(2));
    if (!Array.isArray(path) || !path.every((v) => typeof v === "number"))
      return null;
    return { kind, path };
  } catch {
    return null;
  }
}

/** Children array of the container at `path` ([] = root). */
export function containerChildren(
  nodes: RuleNode[],
  path: NodePath
): RuleNode[] | null {
  if (path.length === 0) return nodes;
  const g = getNode(nodes, path);
  return g && isGroup(g) ? g.children : null;
}

/** 1 + the deepest group nesting inside this group (1 = no nested groups). */
function groupInnerDepth(group: RuleNode): number {
  if (!isGroup(group)) return 0;
  let deepest = 0;
  for (const child of group.children) {
    deepest = Math.max(deepest, groupInnerDepth(child));
  }
  return 1 + deepest;
}

/**
 * Resolve a finished drag into the tree after the move, or the original tree
 * to ignore. Semantics: same-container = arrayMove (land at the hovered slot),
 * cross-container = insert before the hovered node, container body = append.
 * Groups may nest up to UI_MAX_GROUP_DEPTH levels — drops that would nest
 * deeper are clamped up to the deepest container that fits.
 */
export function applyDrop(
  cur: RuleNode[],
  from: NodePath,
  over: DndRef
): RuleNode[] {
  const moving = getNode(cur, from);
  if (!moving) return cur;

  let to: NodePath | null = null;
  if (over.kind === "container") {
    // dropped on a container body → append to its end
    const list = containerChildren(cur, over.path);
    if (list) to = [...over.path, list.length];
  } else {
    const overPath = over.path;
    const sameContainer =
      overPath.length === from.length &&
      overPath.slice(0, -1).every((v, i) => v === from[i]);
    if (sameContainer) {
      const i = from[from.length - 1];
      const j = overPath[overPath.length - 1];
      if (i === j) return cur;
      // land exactly at the hovered slot (arrayMove semantics)
      to = [...overPath.slice(0, -1), i < j ? j + 1 : j];
    } else {
      // cross-container: insert before the hovered node
      to = [...overPath];
    }
  }
  if (!to) return cur;
  // Clamp group drops so total nesting stays within UI_MAX_GROUP_DEPTH: the
  // target container depth (path length - 1) plus the group's own inner depth.
  if (isGroup(moving)) {
    const maxContainerDepth = UI_MAX_GROUP_DEPTH - groupInnerDepth(moving);
    if (to.length - 1 > maxContainerDepth) {
      to = to.slice(0, Math.max(1, maxContainerDepth + 1));
    }
  }
  return moveNode(cur, from, to);
}
