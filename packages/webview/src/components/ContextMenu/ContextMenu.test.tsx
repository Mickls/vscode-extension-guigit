/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

describe("ContextMenu", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders old commit actions in order with separators", () => {
    render(<ContextMenu canEditCommitMessage selectedCommitCount={2} visible x={20} y={30} />);

    const menu = screen.getByRole("menu", { name: "Commit actions" });
    const actions = within(menu).getAllByRole("menuitem");

    expect(actions.map((action) => action.getAttribute("data-action"))).toEqual([
      "copyHash",
      "cherryPick",
      "revert",
      "editCommitMessage",
      "compare",
      "squash",
      "createBranch",
      "pushToCommit",
      "resetSoft",
      "resetMixed",
      "resetHard"
    ]);
    expect(within(menu).getAllByRole("separator")).toHaveLength(4);
    expect(menu).toHaveStyle({ left: "20px", top: "30px" });
  });

  it("disables compare until exactly two commits are selected", () => {
    render(<ContextMenu canEditCommitMessage canSquashCommits={false} selectedCommitCount={1} visible x={0} y={0} />);

    expect(screen.getByRole("menuitem", { name: "Compare Selected (1/2)" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(screen.getByRole("menuitem", { name: "Squash Commits" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("keeps squash disabled when the selected commits are not squashable", () => {
    render(<ContextMenu canEditCommitMessage canSquashCommits={false} selectedCommitCount={2} visible x={0} y={0} />);

    expect(screen.getByRole("menuitem", { name: "Squash 2 Commits" })).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps the menu inside the viewport", () => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 240 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 260 });

    render(<ContextMenu canEditCommitMessage canSquashCommits selectedCommitCount={2} visible x={250} y={230} />);

    expect(screen.getByRole("menu", { name: "Commit actions" })).toHaveStyle({
      left: "102px",
      top: "8px"
    });
  });

  it("sends the selected menu action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(<ContextMenu canEditCommitMessage onAction={onAction} selectedCommitCount={2} visible x={0} y={0} />);
    await user.click(screen.getByRole("menuitem", { name: "Cherry Pick" }));

    expect(onAction).toHaveBeenCalledWith("cherryPick");
  });
});
