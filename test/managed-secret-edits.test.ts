/* Pure helpers shared by the provider-driven fields and the credential list. */
import { describe, expect, it } from "vitest";
import {
  isMarkedRemoved,
  NO_SECRET_EDITS,
  pendingValue,
  setValue,
  toggleRemove,
} from "@/lib/managed-secret-edits";

describe("managed-secret-edits", () => {
  it("setValue adds an upsert and clears it on empty value", () => {
    const set = setValue(NO_SECRET_EDITS, "CF_DNS_API_TOKEN", "abc");
    expect(set.upsert).toEqual([{ name: "CF_DNS_API_TOKEN", value: "abc" }]);
    expect(pendingValue(set, "CF_DNS_API_TOKEN")).toBe("abc");
    const cleared = setValue(set, "CF_DNS_API_TOKEN", "");
    expect(cleared.upsert).toEqual([]);
    expect(pendingValue(cleared, "CF_DNS_API_TOKEN")).toBeUndefined();
  });

  it("setValue replaces an existing pending value for the same name", () => {
    const a = setValue(NO_SECRET_EDITS, "X", "1");
    const b = setValue(a, "X", "2");
    expect(b.upsert).toEqual([{ name: "X", value: "2" }]);
  });

  it("toggleRemove marks/unmarks and drops a pending upsert when removing", () => {
    const withDraft = setValue(NO_SECRET_EDITS, "X", "draft");
    const removed = toggleRemove(withDraft, "X");
    expect(removed.remove).toEqual(["X"]);
    expect(removed.upsert).toEqual([]); // pending replacement dropped
    expect(isMarkedRemoved(removed, "X")).toBe(true);
    const restored = toggleRemove(removed, "X");
    expect(restored.remove).toEqual([]);
    expect(isMarkedRemoved(restored, "X")).toBe(false);
  });
});
