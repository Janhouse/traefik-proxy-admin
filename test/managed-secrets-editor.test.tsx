// @vitest-environment jsdom
/* Write-only DNS credential editor: existing values are never shown, typing
 * replaces, removing emits a remove, and new rows emit upserts. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ManagedSecretEdits } from "@/lib/managed-traefik-types";
import { ManagedSecretsEditor } from "@/components/managed/managed-secrets-editor";

const NO_EDITS: ManagedSecretEdits = { upsert: [], remove: [] };

afterEach(() => cleanup());

describe("ManagedSecretsEditor", () => {
  it("shows existing credentials as 'set' without exposing values", () => {
    render(
      <ManagedSecretsEditor
        existingNames={["CF_DNS_API_TOKEN"]}
        edits={NO_EDITS}
        onChange={vi.fn()}
      />
    );
    // the row exists (its remove button is name-scoped)
    expect(
      screen.getByRole("button", { name: "Remove credential CF_DNS_API_TOKEN" })
    ).toBeDefined();
    expect(screen.getByText("set")).toBeDefined();
    // the replace field is empty — no value ever arrives from the server
    const field = screen.getByPlaceholderText("Replace value…") as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.type).toBe("password");
  });

  it("typing a replacement emits an upsert for that name", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ManagedSecretsEditor
        existingNames={["CF_DNS_API_TOKEN"]}
        edits={NO_EDITS}
        onChange={onChange}
      />
    );
    await user.type(screen.getByPlaceholderText("Replace value…"), "x");
    expect(onChange).toHaveBeenLastCalledWith({
      remove: [],
      upsert: [{ name: "CF_DNS_API_TOKEN", value: "x" }],
    });
  });

  it("removing an existing credential emits a remove (and offers undo)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ManagedSecretsEditor
        existingNames={["CF_DNS_API_TOKEN"]}
        edits={NO_EDITS}
        onChange={onChange}
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Remove credential CF_DNS_API_TOKEN" })
    );
    expect(onChange).toHaveBeenLastCalledWith({
      remove: ["CF_DNS_API_TOKEN"],
      upsert: [],
    });
    rerender(
      <ManagedSecretsEditor
        existingNames={["CF_DNS_API_TOKEN"]}
        edits={{ remove: ["CF_DNS_API_TOKEN"], upsert: [] }}
        onChange={onChange}
      />
    );
    expect(screen.getByText("will be removed")).toBeDefined();
    expect(screen.getByRole("button", { name: /Undo/ })).toBeDefined();
  });

  it("adds a new row and disables Add while a blank row is open", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ManagedSecretsEditor existingNames={[]} edits={NO_EDITS} onChange={onChange} />
    );
    await user.click(screen.getByRole("button", { name: /Add credential/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      remove: [],
      upsert: [{ name: "", value: "" }],
    });
    rerender(
      <ManagedSecretsEditor
        existingNames={[]}
        edits={{ remove: [], upsert: [{ name: "", value: "" }] }}
        onChange={onChange}
      />
    );
    expect(
      (screen.getByRole("button", { name: /Add credential/ }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    // env var name input upper-cases as you type
    const nameInput = screen.getByPlaceholderText("CF_DNS_API_TOKEN");
    await user.type(nameInput, "c");
    expect(onChange).toHaveBeenLastCalledWith({
      remove: [],
      upsert: [{ name: "C", value: "" }],
    });
  });
});
