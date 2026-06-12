// @vitest-environment jsdom
/* CertResolverSelect: a free-text-first combobox — discovered resolvers are
 * suggestions, typing always wins (Traefik has no resolver API, so the list
 * can never be exhaustive). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CertResolversResponse } from "@/lib/traefik-client-types";

const mockState = vi.hoisted(() => ({
  certResolvers: null as unknown,
}));

vi.mock("@/hooks/use-traefik", () => ({
  useTraefikCertResolvers: () => ({
    certResolvers: mockState.certResolvers,
    loading: false,
    refresh: vi.fn(),
  }),
}));

import { CertResolverSelect } from "@/components/traefik/cert-resolver-select";

const fixture: CertResolversResponse = {
  configured: true,
  reachable: true,
  resolvers: [
    { name: "letsencrypt", source: "router" },
    { name: "zerossl", source: "entrypoint" },
  ],
};

beforeEach(() => {
  mockState.certResolvers = fixture;
});
afterEach(() => cleanup());

describe("CertResolverSelect", () => {
  it("lists discovered resolvers with their source on focus", async () => {
    const user = userEvent.setup();
    render(<CertResolverSelect value="" onChange={vi.fn()} />);

    await user.click(screen.getByRole("textbox"));
    expect(screen.getByText("letsencrypt")).toBeDefined();
    expect(screen.getByText("zerossl")).toBeDefined();
    expect(screen.getByText("router")).toBeDefined();
    expect(screen.getByText("entrypoint")).toBeDefined();
  });

  it("picking an option commits it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CertResolverSelect value="" onChange={onChange} />);

    await user.click(screen.getByRole("textbox"));
    await user.click(screen.getByText("zerossl"));
    expect(onChange).toHaveBeenLastCalledWith("zerossl");
  });

  it("free text flows through onChange as typed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CertResolverSelect value="" onChange={onChange} />);

    await user.type(screen.getByRole("textbox"), "x");
    expect(onChange).toHaveBeenLastCalledWith("x");
  });

  it("flags a value the API has never seen", () => {
    render(<CertResolverSelect value="custom-resolver" onChange={vi.fn()} />);
    expect(screen.getByText(/Not seen via the Traefik API/)).toBeDefined();
  });

  it("does not flag when Traefik is unreachable (nothing to compare against)", () => {
    mockState.certResolvers = {
      configured: true,
      reachable: false,
      resolvers: [],
    };
    render(<CertResolverSelect value="custom-resolver" onChange={vi.fn()} />);
    expect(screen.queryByText(/Not seen via the Traefik API/)).toBeNull();
  });

  it("keeps the full list when the value exactly matches an option", async () => {
    const user = userEvent.setup();
    render(<CertResolverSelect value="letsencrypt" onChange={vi.fn()} />);

    await user.click(screen.getByRole("textbox"));
    // both options visible — switching doesn't require clearing first
    expect(screen.getByText("zerossl")).toBeDefined();
  });
});
