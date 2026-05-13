import type { ReactElement } from "react";

export interface IconTooltipProps {
  label: string;
  placement?: "bottom" | "left" | "right" | "top";
}

export function IconTooltip({ label, placement = "top" }: IconTooltipProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="guigit-icon-tooltip"
      data-placement={placement}
      data-tooltip={label}
    />
  );
}
