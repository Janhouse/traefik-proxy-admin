// @vitest-environment jsdom
/* ServiceSecurityList type switches: the persisted rule must survive until
 * its replacement has been CREATED — never delete-then-create. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/toaster", () => ({ toast: vi.fn() }));

import { ServiceSecurityList } from "@/components/service-security-list";

type Call = { url: string; method: string; body?: unknown };

function stubFetch(opts: { failDelete?: boolean } = {}) {
  const calls: Call[] = [];
  let seq = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (method === "GET" && url.endsWith("/security-configs")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "old-1",
              type: "sso",
              isEnabled: true,
              priority: 10,
              config: { groups: [], users: [] },
            },
          ],
        };
      }
      if (method === "GET") return { ok: true, json: async () => [] };
      if (method === "POST")
        return { ok: true, json: async () => ({ id: `new-${++seq}` }) };
      if (method === "DELETE") return { ok: !opts.failDelete, status: 500 };
      return { ok: true, json: async () => ({}) };
    })
  );
  return calls;
}

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Wait for the persisted rule to render; its card body (type picker) is
 * always in the DOM, just collapsed, so no click is needed. */
async function waitForCard() {
  await screen.findAllByText("SSO Authentication");
}

describe("ServiceSecurityList type switch", () => {
  it("creates the replacement first and deletes the old rule only afterwards", async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    render(<ServiceSecurityList serviceId="svc-1" serviceName="svc" />);
    await waitForCard();

    // sso → shared_link (valid immediately, autosaves after a short delay)
    await user.click(screen.getByRole("button", { name: /Shared Link/ }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE")).toBe(true)
    );
    const post = calls.findIndex((c) => c.method === "POST");
    const del = calls.findIndex((c) => c.method === "DELETE");
    expect(post).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(post); // create BEFORE delete
    expect(calls[del].url).toBe("/api/services/security-configs/old-1");
    // same priority → ordering unchanged
    expect(calls[post].body).toMatchObject({
      securityType: "shared_link",
      priority: 10,
    });
    await screen.findByText("Saved automatically");
  });

  it("keeps the old rule while the new type is still invalid and says it will be replaced", async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    render(<ServiceSecurityList serviceId="svc-1" serviceName="svc" />);
    await waitForCard();

    // sso → basic_auth: invalid until a basic-auth config is picked
    await user.click(screen.getByRole("button", { name: /Basic Authentication/ }));

    await screen.findByText(/previous rule stays active/i);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("does not delete the old rule when the create fails", async () => {
    const user = userEvent.setup();
    const calls = stubFetch();
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        if (method === "GET" && url.endsWith("/security-configs"))
          return {
            ok: true,
            json: async () => [
              { id: "old-1", type: "sso", isEnabled: true, priority: 10, config: { groups: [], users: [] } },
            ],
          };
        if (method === "GET") return { ok: true, json: async () => [] };
        return { ok: false, status: 500, json: async () => ({}) };
      }
    );
    render(<ServiceSecurityList serviceId="svc-1" serviceName="svc" />);
    await waitForCard();
    await user.click(screen.getByRole("button", { name: /Shared Link/ }));

    await screen.findByText(/Failed to save a configuration/);
    expect(calls.some((c) => c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("warns and resyncs when deleting a persisted rule fails server-side", async () => {
    const user = userEvent.setup();
    const calls = stubFetch({ failDelete: true });
    render(<ServiceSecurityList serviceId="svc-1" serviceName="svc" />);
    await waitForCard();

    // open the delete confirm dialog, then confirm inside it
    await user.click(screen.getByRole("button", { name: /^Delete$/ }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: /^Delete$/ }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "DELETE" && c.url.endsWith("/old-1"))
      ).toBe(true)
    );
    // a 500 must surface — not be swallowed like a thrown fetch — and the list
    // is refetched so the still-live rule reappears.
    await screen.findByText(/it may still be active/i);
    // the resync GET runs after the failed DELETE
    const lastDelete = calls.map((c) => c.method).lastIndexOf("DELETE");
    expect(
      calls.some((c, i) => c.method === "GET" && i > lastDelete)
    ).toBe(true);
  });
});
