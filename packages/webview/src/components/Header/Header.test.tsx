/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

const branches = {
  locals: [
    {
      current: true,
      name: "main"
    },
    {
      current: false,
      name: "feature/ui"
    }
  ],
  remotes: []
};

describe("Header", () => {
  afterEach(() => {
    cleanup();
  });

  it("wraps toolbar controls onto additional rows when width is constrained", () => {
    render(<Header />);

    const header = screen.getByRole("banner");

    expect(header).toHaveClass("min-h-11");
    expect(header).toHaveClass("flex-wrap");
  });

  it("closes the branch menu when pointer down happens outside it", async () => {
    const user = userEvent.setup();

    render(
      <Header
        branches={branches}
        onBranchSelectionChange={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: "Branches" }));
    expect(screen.getByRole("menu", { name: "Branches" })).toBeInTheDocument();

    await user.pointer({ keys: "[MouseLeft]", target: document.body });

    expect(screen.queryByRole("menu", { name: "Branches" })).not.toBeInTheDocument();
  });

  it("keeps the branch menu open when interacting with branch options", async () => {
    const user = userEvent.setup();
    const onBranchSelectionChange = vi.fn();

    render(
      <Header
        branches={branches}
        onBranchSelectionChange={onBranchSelectionChange}
      />
    );
    await user.click(screen.getByRole("button", { name: "Branches" }));
    await user.click(within(screen.getByRole("menu", { name: "Branches" })).getByRole("checkbox", { name: "feature/ui" }));

    expect(onBranchSelectionChange).toHaveBeenCalledWith(["feature/ui"]);
    expect(screen.getByRole("menu", { name: "Branches" })).toBeInTheDocument();
  });
});
