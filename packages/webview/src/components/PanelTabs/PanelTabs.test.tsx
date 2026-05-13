/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelTabs } from "./PanelTabs";

describe("PanelTabs", () => {
  afterEach(cleanup);

  it("switches between details and changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<PanelTabs active="details" labels={{ changes: "Changes", details: "Details", stash: "Stash" }} onChange={onChange} />);

    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "Changes" }));

    expect(onChange).toHaveBeenCalledWith("changes");
    expect(screen.getByRole("tab", { name: "Stash" })).toBeInTheDocument();
  });
});
