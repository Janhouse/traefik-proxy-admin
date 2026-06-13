import type { ManagedSecretEdits } from "@/lib/managed-traefik-types";

/* Pure helpers for manipulating a write-only credential edit batch, shared by
 * the provider-driven fields in the resolver editor and the standalone
 * credential list. Stored values never reach the client, so "is set" is
 * derived from the server-provided names, and editing always produces an
 * upsert (or clears the pending one). */

export const NO_SECRET_EDITS: ManagedSecretEdits = { upsert: [], remove: [] };

/** Pending new/replacement value for `name`, if the user has typed one. */
export function pendingValue(
  edits: ManagedSecretEdits,
  name: string
): string | undefined {
  return edits.upsert.find((u) => u.name === name)?.value;
}

export function isMarkedRemoved(edits: ManagedSecretEdits, name: string): boolean {
  return edits.remove.includes(name);
}

/** Set (or, with an empty value, clear) the pending upsert for `name`. */
export function setValue(
  edits: ManagedSecretEdits,
  name: string,
  value: string
): ManagedSecretEdits {
  const rest = edits.upsert.filter((u) => u.name !== name);
  return { ...edits, upsert: value ? [...rest, { name, value }] : rest };
}

/** Toggle removal of a stored credential; clears any pending upsert for it. */
export function toggleRemove(
  edits: ManagedSecretEdits,
  name: string
): ManagedSecretEdits {
  const removed = edits.remove.includes(name);
  return {
    ...edits,
    remove: removed
      ? edits.remove.filter((n) => n !== name)
      : [...edits.remove, name],
    upsert: removed ? edits.upsert : edits.upsert.filter((u) => u.name !== name),
  };
}
