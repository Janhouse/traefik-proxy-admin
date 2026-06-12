// @vitest-environment jsdom
/* Component tests for the shared EntrypointSelect toggle grid (used by the
 * service route-rule editor and the global config page). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EntrypointsResponse } from "@/lib/traefik-client-types";

const mockState = vi.hoisted(() => ({
  entrypoints: null as unknown,
}));

vi.mock("@/hooks/use-traefik", () => ({
  useTraefikEntrypoints: () => ({
    entrypoints: mockState.entrypoints,
    loading: false,
    refresh: vi.fn(),
  }),
}));

import {
  EntrypointSelect,
  TRAEFIK_API_ENTRYPOINT,
} from "@/components/traefik/entrypoint-select";

const fixture: EntrypointsResponse = {
  configured: true,
  reachable: true,
  entrypoints: [
    { name: "web", address: ":80" },
    { name: "websecure", address: ":443" },
    { name: "traefik", address: ":8080" },
  ],
};

beforeEach(() => {
  mockState.entrypoints = fixture;
});
afterEach(() => cleanup());

describe("EntrypointSelect", () => {
  it("renders discovered entrypoints with addresses", () => {
    render(<EntrypointSelect value={[]} onChange={vi.fn()} />);
    expect(screen.getByText("web")).toBeDefined();
    expect(screen.getByText("websecure")).toBeDefined();
    expect(screen.getByText(":80")).toBeDefined();
    expect(screen.getByText(":443")).toBeDefined();
  });

  it("hides the dedicated traefik API entrypoint unless selected", () => {
    const { rerender } = render(
      <EntrypointSelect value={[]} onChange={vi.fn()} />
    );
    expect(screen.queryByText("traefik")).toBeNull();

    rerender(
      <EntrypointSelect value={[TRAEFIK_API_ENTRYPOINT]} onChange={vi.fn()} />
    );
    expect(screen.getByText("traefik")).toBeDefined();
    expect(screen.getByText("API")).toBeDefined();
  });

  it("toggles selection on click (add and remove)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EntrypointSelect value={["web"]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /websecure/ }));
    expect(onChange).toHaveBeenLastCalledWith(["web", "websecure"]);

    await user.click(screen.getByText("web").closest("button")!);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("keeps a selected-but-undiscovered entrypoint visible", () => {
    render(<EntrypointSelect value={["legacy-ep"]} onChange={vi.fn()} />);
    expect(screen.getByText("legacy-ep")).toBeDefined();
    expect(screen.getByText("—")).toBeDefined(); // no address known
  });

  it("shows the unconfigured fallback when discovery returns nothing", () => {
    mockState.entrypoints = { configured: false, reachable: false, entrypoints: [] };
    render(<EntrypointSelect value={[]} onChange={vi.fn()} />);
    expect(
      screen.getByText(/No entrypoints discovered — set TRAEFIK_API_URL\./)
    ).toBeDefined();
  });

  it("disables the toggles when disabled", () => {
    render(<EntrypointSelect value={[]} onChange={vi.fn()} disabled />);
    const button = screen.getByRole("button", { name: /websecure/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
