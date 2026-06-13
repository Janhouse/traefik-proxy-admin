// @vitest-environment jsdom
/* The resolver editor's DNS-challenge section shows a provider's specific
 * credential fields (so users don't have to know env var names) and routes
 * typed values into the write-only secret edits. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ManagedCertResolver } from "@/lib/managed-traefik-types";
import { NO_SECRET_EDITS } from "@/lib/managed-secret-edits";
import { ManagedResolversEditor } from "@/components/managed/managed-resolvers-editor";

const dnsResolver: ManagedCertResolver = {
  name: "le-dns",
  email: "a@b.c",
  challenge: "dnsChallenge",
  dnsProvider: "cloudflare",
};

function renderEditor(over: Partial<Parameters<typeof ManagedResolversEditor>[0]> = {}) {
  const props = {
    value: [dnsResolver],
    onChange: vi.fn(),
    entrypointNames: ["web", "websecure"],
    secretNames: [] as string[],
    secretEdits: NO_SECRET_EDITS,
    onSecretEditsChange: vi.fn(),
    disabled: false,
    ...over,
  };
  render(<ManagedResolversEditor {...props} />);
  return props;
}

afterEach(() => cleanup());

describe("ManagedResolversEditor — provider-driven credentials", () => {
  it("shows the selected provider's named credential fields", () => {
    renderEditor();
    // Cloudflare's field, labelled and annotated with the exact env var name
    const input = screen.getByLabelText(/^API token/) as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.type).toBe("password");
    expect(screen.getByText("CF_DNS_API_TOKEN")).toBeDefined();
  });

  it("typing a credential value emits a write-only upsert for the env var", async () => {
    const user = userEvent.setup();
    const { onSecretEditsChange } = renderEditor();
    await user.type(screen.getByLabelText(/^API token/), "t");
    expect(onSecretEditsChange).toHaveBeenLastCalledWith({
      remove: [],
      upsert: [{ name: "CF_DNS_API_TOKEN", value: "t" }],
    });
  });

  it("marks an already-stored credential as set without revealing it", () => {
    renderEditor({ secretNames: ["CF_DNS_API_TOKEN"] });
    const input = screen.getByLabelText(/^API token/) as HTMLInputElement;
    expect(input.value).toBe(""); // value never comes from the server
    expect(input.placeholder).toMatch(/set — type to replace/);
  });

  it("a custom provider code reveals the free-text code field, no preset fields", () => {
    renderEditor({
      value: [{ ...dnsResolver, dnsProvider: "exoscale" }],
    });
    expect(screen.getByLabelText("Provider code")).toBeDefined();
    expect(screen.queryByText("CF_DNS_API_TOKEN")).toBeNull();
  });

  it("shows no provider fields for non-DNS challenges", () => {
    renderEditor({
      value: [{ name: "le", email: "a@b.c", challenge: "tlsChallenge" }],
    });
    expect(screen.queryByText(/DNS provider/)).toBeNull();
    expect(screen.queryByText("CF_DNS_API_TOKEN")).toBeNull();
  });
});
