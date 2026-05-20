/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { IconTooltip } from "./IconTooltip";

describe("IconTooltip", () => {
  it("does not keep tooltips visible only because a host contains focus", () => {
    const tooltipCss = readFileSync("src/styles/globals.wind.css", "utf8");

    expect(tooltipCss).toContain(".guigit-icon-tooltip-host:hover > .guigit-icon-tooltip");
    expect(tooltipCss).toContain(".guigit-icon-tooltip-host:focus-visible > .guigit-icon-tooltip");
    expect(tooltipCss).not.toContain(".guigit-icon-tooltip-host:focus-within");
  });

  it("renders tooltip text as inert generated content data", () => {
    render(
      <button className="guigit-icon-tooltip-host" type="button">
        Open
        <IconTooltip label="Open file" placement="bottom" />
      </button>
    );

    const tooltip = screen.getByRole("button", { name: "Open" }).querySelector(".guigit-icon-tooltip");

    expect(tooltip).toHaveAttribute("aria-hidden", "true");
    expect(tooltip).toHaveAttribute("data-placement", "bottom");
    expect(tooltip).toHaveAttribute("data-tooltip", "Open file");
  });
});
