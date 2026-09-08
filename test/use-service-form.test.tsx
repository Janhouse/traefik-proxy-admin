// @vitest-environment jsdom
/* useServiceForm: a pristine Add form must NOT count as dirty even though the
 * route editor emits its default Host row on mount and again once the domain
 * list loads (the default domain gets backfilled). The baseline follows the
 * same defaults, and late-arriving defaults never clobber user edits. */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useServiceForm } from "@/hooks/use-service-form";
import type { RuleNode } from "@/lib/route-rule";

/** What RouteRuleEditor emits for an untouched new service on `domainId`. */
function editorMountEmit(domainId: string) {
  const matchRules: RuleNode[] = [
    { type: "Host", conn: "AND", domainId, sub: "" },
  ];
  return {
    domainId,
    subdomain: null,
    hostnameMode: "subdomain" as const,
    customHostnames: null,
    entrypoints: [] as string[],
    matchRules,
  };
}

describe("useServiceForm (new service)", () => {
  it("stays pristine through the editor's mount emit and the domain backfill", () => {
    const { result, rerender } = renderHook(
      (props: { defaultDomainId: string; defaultDuration?: number | null }) =>
        useServiceForm({ service: null, ...props }),
      {
        initialProps: { defaultDomainId: "", defaultDuration: undefined } as {
          defaultDomainId: string;
          defaultDuration?: number | null;
        },
      }
    );
    expect(result.current.hasUnsavedChanges).toBe(false);

    // editor mounts before the domains have loaded
    act(() => result.current.updateFormData(editorMountEmit("")));
    expect(result.current.hasUnsavedChanges).toBe(false);

    // domains + global config arrive: default domain d1, auto-disable 720
    rerender({ defaultDomainId: "d1", defaultDuration: 720 });
    act(() => result.current.updateFormData(editorMountEmit("d1")));
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.formData.domainId).toBe("d1");
    expect(result.current.formData.enableDurationMinutes).toBe(720);
    expect(result.current.formData.matchRules).toEqual(
      editorMountEmit("d1").matchRules
    );

    // a real edit is dirty
    act(() => result.current.updateFormData({ name: "grafana" }));
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  it("late defaults only fill fields the user has not touched", () => {
    const { result, rerender } = renderHook(
      (props: { defaultDuration?: number | null }) =>
        useServiceForm({ service: null, defaultDomainId: "d1", ...props }),
      {
        initialProps: { defaultDuration: undefined } as {
          defaultDuration?: number | null;
        },
      }
    );

    // user picks "never auto-disable" and a name before the config loads
    act(() =>
      result.current.updateFormData({ name: "x", enableDurationMinutes: null })
    );
    // enableDurationMinutes null === the pre-load default (null), so the
    // config value flows in; the name is kept.
    rerender({ defaultDuration: 720 });
    expect(result.current.formData.name).toBe("x");
    expect(result.current.formData.enableDurationMinutes).toBe(720);

    act(() => result.current.updateFormData({ enableDurationMinutes: 60 }));
    rerender({ defaultDuration: 120 });
    expect(result.current.formData.enableDurationMinutes).toBe(60);
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  it("treats a null default duration (never auto-disable) as pristine", () => {
    const { result } = renderHook(() =>
      useServiceForm({ service: null, defaultDomainId: "d1", defaultDuration: null })
    );
    expect(result.current.formData.enableDurationMinutes).toBeNull();
    expect(result.current.hasUnsavedChanges).toBe(false);
  });
});
