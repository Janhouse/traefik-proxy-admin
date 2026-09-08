// @vitest-environment jsdom
/* Entrypoint editor: enabling TLS moves the port to 443 (and back), and the
 * certificate resolver is chosen from the resolvers defined in THIS managed
 * config — not inferred from a running Traefik. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ManagedEntrypoint } from "@/lib/managed-traefik-types";
import { ManagedEntrypointsEditor } from "@/components/managed/managed-entrypoints-editor";

function renderEditor(eps: ManagedEntrypoint[], resolverNames: string[] = []) {
  const onChange = vi.fn();
  render(
    <ManagedEntrypointsEditor
      value={eps}
      onChange={onChange}
      resolverNames={resolverNames}
    />
  );
  return onChange;
}

afterEach(() => cleanup());

describe("ManagedEntrypointsEditor — TLS ↔ port", () => {
  it("enabling TLS moves an :80 (or unset) port to 443", async () => {
    const user = userEvent.setup();
    const onChange = renderEditor([{ name: "web", port: 80 }]);
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith([
      { name: "web", port: 443, tls: { enabled: true, certResolver: undefined } },
    ]);
  });

  it("disabling TLS moves a :443 port back to 80", async () => {
    const user = userEvent.setup();
    const onChange = renderEditor([
      { name: "websecure", port: 443, tls: { enabled: true, certResolver: "le" } },
    ]);
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith([
      { name: "websecure", port: 80, tls: null },
    ]);
  });

  it("preserves a custom port when toggling TLS", async () => {
    const user = userEvent.setup();
    const onChange = renderEditor([{ name: "alt", port: 8443 }]);
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith([
      { name: "alt", port: 8443, tls: { enabled: true, certResolver: undefined } },
    ]);
  });
});

describe("ManagedEntrypointsEditor — certificate resolver", () => {
  it("hints to define a resolver when none exist", () => {
    renderEditor([{ name: "websecure", port: 443, tls: { enabled: true } }], []);
    expect(screen.getByText(/Define a resolver below/)).toBeDefined();
  });

  it("no hint once managed resolvers exist", () => {
    renderEditor(
      [{ name: "websecure", port: 443, tls: { enabled: true, certResolver: "le1" } }],
      ["le1", "le2"]
    );
    expect(screen.queryByText(/Define a resolver below/)).toBeNull();
    expect(screen.getByText("Certificate resolver")).toBeDefined();
  });

  it("shows no resolver field when TLS is off", () => {
    renderEditor([{ name: "web", port: 80 }], ["le1"]);
    expect(screen.queryByText("Certificate resolver")).toBeNull();
  });
});
