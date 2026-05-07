/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsMenu } from "./SettingsMenu";

describe("SettingsMenu", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders old settings actions in order", () => {
    render(<SettingsMenu visible x={100} y={48} />);

    const menu = screen.getByRole("menu", { name: "Settings actions" });
    const actions = within(menu).getAllByRole("menuitem");

    expect(actions.map((action) => action.getAttribute("data-action"))).toEqual([
      "resetStash",
      "configureProxy",
      "refreshProxy",
      "manageRemotes",
      "changeLanguage"
    ]);
    expect(within(menu).getAllByRole("separator")).toHaveLength(2);
    expect(menu).toHaveStyle({ left: "100px", top: "48px" });
  });

  it("sends the selected settings intent", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(<SettingsMenu onAction={onAction} visible x={0} y={0} />);
    await user.click(screen.getByRole("menuitem", { name: "Manage Remotes" }));

    expect(onAction).toHaveBeenCalledWith("manageRemotes");
  });
});
