import type { ReactElement } from "react";

export type RightPanelTab = "details" | "changes" | "stash";

export interface PanelTabsProps {
  active: RightPanelTab;
  labels: Record<RightPanelTab, string>;
  onChange?: (tab: RightPanelTab) => void;
}

const tabs: readonly RightPanelTab[] = ["details", "changes", "stash"];

export function PanelTabs({ active, labels, onChange }: PanelTabsProps): ReactElement {
  return (
    <div className="flex h-9 shrink-0 border-b border-[var(--vscode-panel-border)]" role="tablist">
      {tabs.map((tab) => (
        <button
          aria-selected={active === tab}
          className={`px-3 text-xs ${active === tab ? "border-b border-[var(--vscode-focusBorder)] text-[var(--vscode-foreground)]" : "text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"}`}
          key={tab}
          onClick={() => onChange?.(tab)}
          role="tab"
          type="button"
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}
