/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteManager } from "./RemoteManager";

describe("RemoteManager", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the table-style remote manager modal", () => {
    render(
      <RemoteManager
        open
        remotes={[
          {
            fetchUrl: "git@github.com:Mickls/vscode-extension-guigit.git",
            name: "origin",
            pushUrl: "git@github.com:Mickls/vscode-extension-guigit.git"
          }
        ]}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Remote Manager" });
    const table = within(dialog).getByRole("table", { name: "Git remotes" });

    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Name",
      "URL",
      "Actions"
    ]);
    expect(within(table).getByRole("cell", { name: "origin" })).toBeInTheDocument();
    expect(within(table).getByDisplayValue("git@github.com:Mickls/vscode-extension-guigit.git")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("Remote name")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("Remote URL (https://... or git@...)")).toBeInTheDocument();
  });

  it("sends add, update, delete, and close intents", async () => {
    const user = userEvent.setup();
    const onAddRemote = vi.fn();
    const onClose = vi.fn();
    const onDeleteRemote = vi.fn();
    const onUpdateRemote = vi.fn();

    render(
      <RemoteManager
        onAddRemote={onAddRemote}
        onClose={onClose}
        onDeleteRemote={onDeleteRemote}
        onUpdateRemote={onUpdateRemote}
        open
        remotes={[{ fetchUrl: "https://example.com/old.git", name: "origin", pushUrl: "https://example.com/old.git" }]}
      />
    );

    await user.clear(screen.getByDisplayValue("https://example.com/old.git"));
    await user.type(screen.getByLabelText("origin URL"), "https://example.com/new.git");
    await user.click(screen.getByRole("button", { name: "Save origin" }));
    await user.click(screen.getByRole("button", { name: "Delete origin" }));
    await user.type(screen.getByPlaceholderText("Remote name"), "upstream");
    await user.type(screen.getByPlaceholderText("Remote URL (https://... or git@...)"), "https://example.com/up.git");
    await user.click(screen.getByRole("button", { name: "Add Remote" }));
    await user.click(screen.getByRole("button", { name: "Close Remote Manager" }));

    expect(onUpdateRemote).toHaveBeenCalledWith("origin", "https://example.com/new.git");
    expect(onDeleteRemote).toHaveBeenCalledWith("origin");
    expect(onAddRemote).toHaveBeenCalledWith("upstream", "https://example.com/up.git");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("rejects remote URLs that are not ssh or https git URLs", async () => {
    const user = userEvent.setup();
    const onAddRemote = vi.fn();

    render(<RemoteManager onAddRemote={onAddRemote} open />);

    await user.type(screen.getByPlaceholderText("Remote name"), "upstream");
    await user.type(screen.getByPlaceholderText("Remote URL (https://... or git@...)"), "ftp://example.com/repo.git");
    await user.click(screen.getByRole("button", { name: "Add Remote" }));

    expect(screen.getByRole("status")).toHaveTextContent("Remote URL must start with git@ or https://");
    expect(onAddRemote).not.toHaveBeenCalled();
  });
});
