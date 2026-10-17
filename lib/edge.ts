/**
 * Traefik "edges": a domain can be assigned to a named Traefik instance that
 * polls /api/traefik/config?edge=<name>. Shared by the API, the generator and
 * the domain form (no server-only imports).
 */

/** Valid edge names: lowercase letters, digits and inner dashes. */
export const EDGE_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

/** Normalize an edge name; empty/blank means the default edge (null). */
export function normalizeEdge(edge: unknown): string | null {
  if (typeof edge !== "string") return null;
  const v = edge.trim().toLowerCase();
  return v ? v : null;
}

/** True for null/empty (default edge) or a well-formed edge name. */
export function isValidEdgeInput(edge: unknown): boolean {
  if (edge === undefined || edge === null) return true;
  if (typeof edge !== "string") return false;
  const v = normalizeEdge(edge);
  return v === null || EDGE_NAME_RE.test(v);
}
