// @vitest-environment jsdom
/* Managed-Traefik section: hidden outside managed mode, applied/pending
 * status chips, row edits flowing into the PUT body via its own Save. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ManagedModeResponse,
  ManagedStaticConfig,
} from "@/lib/managed-traefik-types";

const toastMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/toaster", () => ({ toast: toastMock }));

// CertResolverSelect fetches via its own hook — stub it to a plain input.
vi.mock("@/components/traefik/cert-resolver-select", () => ({
  CertResolverSelect: ({
    value,
    onChange,
    id,
  }: {
    value: string;
    onChange: (v: string) => void;
    id?: string;
  }) => (
    <input
      id={id}
      aria-label="resolver"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { ManagedStaticSection } from "@/components/managed/managed-static-section";

const baseConfig: ManagedStaticConfig = {
  entrypoints: [
    { name: "web", port: 80, redirectToEntrypoint: "websecure" },
    { name: "websecure", port: 443, tls: { enabled: true, certResolver: "letsencrypt" } },
  ],
  certResolvers: [
    { name: "letsencrypt", email: "a@b.c", challenge: "tlsChallenge" },
  ],
  logLevel: "INFO",
};

function managedResponse(over: Partial<ManagedModeResponse> = {}): ManagedModeResponse {
  return {
    managed: true,
    adminAuthConfigured: true,
    config: baseConfig,
    secretNames: [],
    status: {
      currentHash: "h1",
      lastFetchedHash: "h1",
      lastFetchedAt: "2026-06-13T00:00:00.000Z",
      pending: false,
    },
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(getResponse: ManagedModeResponse) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({
    ok: true,
    json: async () =>
      init?.method === "PUT" ? managedResponse() : getResponse,
  }));
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => toastMock.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ManagedStaticSection", () => {
  it("renders nothing when managed mode is off", async () => {
    stubFetch(
      managedResponse({ managed: false, config: null, status: null })
    );
    const { container } = render(<ManagedStaticSection />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("shows the applied chip when Traefik runs the current config", async () => {
    stubFetch(managedResponse());
    render(<ManagedStaticSection />);
    expect(await screen.findByText(/Applied — Traefik fetched/)).toBeDefined();
  });

  it("shows the pending chip while Traefik runs an older config", async () => {
    stubFetch(
      managedResponse({
        status: {
          currentHash: "h2",
          lastFetchedHash: "h1",
          lastFetchedAt: "2026-06-13T00:00:00.000Z",
          pending: true,
        },
      })
    );
    render(<ManagedStaticSection />);
    expect(await screen.findByText(/Waiting for Traefik restart/)).toBeDefined();
  });

  it("warns when ADMIN_PANEL_AUTH is missing", async () => {
    stubFetch(managedResponse({ adminAuthConfigured: false }));
    render(<ManagedStaticSection />);
    expect(
      await screen.findByText(/ADMIN_PANEL_AUTH is not set/)
    ).toBeDefined();
  });

  it("edits flow into the PUT body and enable Save", async () => {
    const user = userEvent.setup();
    stubFetch(managedResponse());
    render(<ManagedStaticSection />);

    const port = await screen.findByLabelText("Port", {
      selector: "#ep-port-1",
    });
    const save = screen.getByRole("button", { name: /Save Managed Config/ });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    await user.clear(port);
    await user.type(port, "8443");
    expect((save as HTMLButtonElement).disabled).toBe(false);

    await user.click(save);
    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => c[1]?.method === "PUT");
      expect(put).toBeDefined();
      const body = JSON.parse(String(put![1]!.body)) as ManagedStaticConfig;
      expect(body.entrypoints[1].port).toBe(8443);
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringContaining("Managed Traefik config saved")
    );
  });

  it("surfaces validation errors from a rejected save", async () => {
    const user = userEvent.setup();
    fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? {
            ok: false,
            status: 400,
            json: async () => ({ errors: ["Duplicate entrypoint name \"web\"."] }),
          }
        : { ok: true, json: async () => managedResponse() }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ManagedStaticSection />);

    const name = await screen.findByLabelText("Name", {
      selector: "#ep-name-1",
    });
    await user.clear(name);
    await user.type(name, "web");
    await user.click(screen.getByRole("button", { name: /Save Managed Config/ }));

    expect(
      await screen.findByText(/Duplicate entrypoint name/)
    ).toBeDefined();
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringContaining("rejected"),
      "error"
    );
  });

  it("removing an entrypoint row updates the config", async () => {
    const user = userEvent.setup();
    stubFetch(managedResponse());
    render(<ManagedStaticSection />);

    await screen.findByText(/Applied/);
    await user.click(
      screen.getByRole("button", { name: "Remove entrypoint web" })
    );
    await user.click(screen.getByRole("button", { name: /Save Managed Config/ }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => c[1]?.method === "PUT");
      const body = JSON.parse(String(put![1]!.body)) as ManagedStaticConfig;
      expect(body.entrypoints.map((e) => e.name)).toEqual(["websecure"]);
    });
  });
});
