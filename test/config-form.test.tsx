// @vitest-environment jsdom
/* Pins the global-config middleware fix: middleware edits flow through
 * `config.globalMiddlewares` (enabling Save via hasUnsavedChanges) and the
 * form uses the same MiddlewareSelect as the service editor. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/toaster", () => ({ toast: toastMock }));

// Stand-in for MiddlewareSelect: a button that adds a middleware on click.
vi.mock("@/components/traefik/middleware-select", () => ({
  MiddlewareSelect: ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (names: string[]) => void;
  }) => (
    <button type="button" onClick={() => onChange([...value, "compress"])}>
      mw-select ({value.join(",")})
    </button>
  ),
}));

// Stand-in for EntrypointSelect: a button that adds an entrypoint on click.
vi.mock("@/components/traefik/entrypoint-select", () => ({
  EntrypointSelect: ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (eps: string[]) => void;
  }) => (
    <button type="button" onClick={() => onChange([...value, "websecure"])}>
      ep-select ({value.join(",")})
    </button>
  ),
}));

import { ConfigForm } from "@/components/config-form";
import { useConfig, type GlobalConfig } from "@/lib/hooks/use-config";

const baseConfig: GlobalConfig = {
  globalMiddlewares: ["secure-headers"],
  adminPanelDomain: "localhost:3000",
  defaultEntrypoints: [],
  defaultEnableDurationMinutes: 720,
};

afterEach(() => cleanup());

describe("ConfigForm middlewares", () => {
  it("renders the shared middleware selector and routes changes into config", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    render(<ConfigForm config={baseConfig} onConfigChange={onConfigChange} />);

    await user.click(screen.getByText(/mw-select/));
    expect(onConfigChange).toHaveBeenCalledWith({
      ...baseConfig,
      globalMiddlewares: ["secure-headers", "compress"],
    });
  });

  it("routes entrypoint selector changes into config.defaultEntrypoints", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    render(<ConfigForm config={baseConfig} onConfigChange={onConfigChange} />);

    await user.click(screen.getByText(/ep-select/));
    expect(onConfigChange).toHaveBeenCalledWith({
      ...baseConfig,
      defaultEntrypoints: ["websecure"],
    });
  });
});

describe("useConfig", () => {
  beforeEach(() => {
    toastMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => ({
        ok: true,
        json: async () =>
          init?.method === "PUT"
            ? JSON.parse(String(init.body))
            : baseConfig,
      }))
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("middleware edits enable Save (the previous bug left it disabled)", async () => {
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() =>
      result.current.setConfig({
        ...result.current.config,
        globalMiddlewares: ["secure-headers", "ratelimit"],
      })
    );
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(() => result.current.handleSave());
    const put = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[1]?.method === "PUT"
    );
    expect(put).toBeDefined();
    expect(JSON.parse(String(put![1].body)).globalMiddlewares).toEqual([
      "secure-headers",
      "ratelimit",
    ]);
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(toastMock).toHaveBeenCalledWith("Configuration saved");
  });

  it("surfaces save failures as an error toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === "PUT"
          ? { ok: false, status: 500, text: async () => "boom" }
          : { ok: true, json: async () => baseConfig }
      )
    );
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.handleSave());
    expect(toastMock).toHaveBeenCalledWith(
      "Failed to save configuration",
      "error"
    );
  });
});
