import type { MouseEvent, ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { IconTooltip } from "../IconTooltip/IconTooltip";

export interface SplitPanelsProps {
  graphHeaderVisible?: boolean;
  graphHeaderWidth?: number;
  initialLeftCollapsed?: boolean;
  initialRightCollapsed?: boolean;
  labels?: Partial<SplitPanelsLabels>;
  left: ReactNode;
  right: ReactNode;
}

export interface SplitPanelsLabels {
  author: string;
  collapseCommitDetails: string;
  collapseCommitList: string;
  commitDetailsPanel: string;
  commitListPanel: string;
  date: string;
  expandCommitDetails: string;
  expandCommitList: string;
  hash: string;
  message: string;
  graph: string;
  refs: string;
  resizePanels: string;
}

const defaultLabels: SplitPanelsLabels = {
  author: "Author",
  collapseCommitDetails: "Collapse commit details panel",
  collapseCommitList: "Collapse commit list panel",
  commitDetailsPanel: "Commit details panel",
  commitListPanel: "Commit list panel",
  date: "Date",
  expandCommitDetails: "Expand commit details panel",
  expandCommitList: "Expand commit list panel",
  hash: "Hash",
  graph: "Graph",
  message: "Message",
  refs: "Refs",
  resizePanels: "Resize panels"
};

export function SplitPanels({
  graphHeaderVisible = false,
  graphHeaderWidth = 120,
  initialLeftCollapsed = false,
  initialRightCollapsed = false,
  labels,
  left,
  right
}: SplitPanelsProps): ReactElement {
  const text = { ...defaultLabels, ...labels };
  const splitPanelsRef = useRef<HTMLDivElement>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(initialLeftCollapsed && !initialRightCollapsed);
  const [rightCollapsed, setRightCollapsed] = useState(initialRightCollapsed);
  const [leftWidth, setLeftWidth] = useState(80);
  const [isResizing, setIsResizing] = useState(false);

  const leftStyle = {
    width: leftCollapsed ? "40px" : rightCollapsed ? "calc(100% - 44px)" : `${leftWidth}%`
  };
  const rightStyle = {
    width: rightCollapsed ? "40px" : leftCollapsed ? "calc(100% - 44px)" : `${100 - leftWidth}%`
  };

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    document.body.classList.add("resizing");

    const resizeToClientX = (clientX: number) => {
      const containerRect = splitPanelsRef.current!.getBoundingClientRect();
      const nextLeftWidth = ((clientX - containerRect.left) / containerRect.width) * 100;
      setLeftWidth(Math.min(80, Math.max(20, nextLeftWidth)));
    };

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      event.preventDefault();
      resizeToClientX(event.clientX);
    };

    const handleMouseUp = (event: globalThis.MouseEvent) => {
      event.preventDefault();
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.classList.remove("resizing");
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const toggleLeftPanel = () => {
    if (leftCollapsed) {
      setLeftCollapsed(false);
      return;
    }

    setLeftCollapsed(true);
    setRightCollapsed(false);
  };

  const toggleRightPanel = () => {
    if (rightCollapsed) {
      setRightCollapsed(false);
      return;
    }

    setRightCollapsed(true);
    setLeftCollapsed(false);
  };

  const startResize = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (leftCollapsed || rightCollapsed) {
      return;
    }

    setIsResizing(true);
  };

  return (
    <div
      className="flex min-h-0 flex-1 overflow-hidden bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)]"
      data-left-collapsed={leftCollapsed}
      data-resizing={isResizing}
      data-right-collapsed={rightCollapsed}
      data-testid="split-panels"
      ref={splitPanelsRef}
    >
      <section
        aria-label={text.commitListPanel}
        className="relative flex min-w-[650px] flex-col overflow-hidden transition-[width] duration-300 data-[collapsed=true]:min-w-10 data-[collapsed=true]:max-w-10 data-[resizing=true]:transition-none"
        data-collapsed={leftCollapsed}
        data-resizing={isResizing}
        style={leftStyle}
      >
        <div className="sticky top-0 z-10 flex h-10 shrink-0 items-center justify-between border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] py-0.5 pl-0 pr-3 data-[collapsed=true]:justify-center data-[collapsed=true]:border-b-0">
          {!leftCollapsed ? (
            <div className="flex min-w-0 flex-1 text-[11px] text-[var(--vscode-descriptionForeground)]">
              {graphHeaderVisible ? (
                <span
                  className="shrink-0 border-r border-[var(--vscode-panel-border)]"
                  style={{ width: `${graphHeaderWidth}px` }}
                >
                  {text.graph}
                </span>
              ) : null}
              <div className="grid min-w-[550px] flex-1 grid-cols-[80px_minmax(180px,1fr)_minmax(96px,180px)_120px_100px] gap-3 px-3">
                <span>{text.hash}</span>
                <span>{text.message}</span>
                <span>{text.refs}</span>
                <span>{text.author}</span>
                <span>{text.date}</span>
              </div>
            </div>
          ) : null}
          <button
            aria-label={leftCollapsed ? text.expandCommitList : text.collapseCommitList}
            className="guigit-icon-tooltip-host flex h-6 min-w-6 items-center justify-center rounded-[3px] border border-[var(--vscode-button-border)] bg-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            onClick={toggleLeftPanel}
            type="button"
          >
            {leftCollapsed ? ">" : "<"}
            <IconTooltip label={leftCollapsed ? text.expandCommitList : text.collapseCommitList} placement="right" />
          </button>
        </div>
        {!leftCollapsed ? left : null}
      </section>

      <div
        aria-label={text.resizePanels}
        aria-orientation="vertical"
        aria-valuemax={80}
        aria-valuemin={20}
        aria-valuenow={leftWidth}
        className="relative w-1 shrink-0 cursor-col-resize bg-[var(--vscode-panel-border)] hover:bg-[var(--vscode-focusBorder)] data-[resizing=true]:bg-[var(--vscode-focusBorder)] after:absolute after:left-1/2 after:top-1/2 after:h-5 after:w-0.5 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-[1px] after:bg-[var(--vscode-icon-foreground)] after:opacity-30 hover:after:opacity-60"
        data-resizing={isResizing}
        onDoubleClick={() => setLeftWidth(80)}
        onMouseDown={startResize}
        role="separator"
      />

      <section
        aria-label={text.commitDetailsPanel}
        className="relative flex min-w-0 flex-col overflow-y-auto transition-[width] duration-300 data-[collapsed=true]:min-w-10 data-[collapsed=true]:max-w-10 data-[collapsed=true]:overflow-hidden data-[resizing=true]:transition-none"
        data-collapsed={rightCollapsed}
        data-resizing={isResizing}
        style={rightStyle}
      >
        <div className="sticky top-0 z-10 flex h-10 shrink-0 items-center border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-0.5 data-[collapsed=true]:justify-center data-[collapsed=true]:border-b-0">
          <button
            aria-label={rightCollapsed ? text.expandCommitDetails : text.collapseCommitDetails}
            className="guigit-icon-tooltip-host flex h-6 min-w-6 items-center justify-center rounded-[3px] border border-[var(--vscode-button-border)] bg-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            onClick={toggleRightPanel}
            type="button"
          >
            {rightCollapsed ? "<" : ">"}
            <IconTooltip label={rightCollapsed ? text.expandCommitDetails : text.collapseCommitDetails} placement="left" />
          </button>
        </div>
        {!rightCollapsed ? right : null}
      </section>
    </div>
  );
}
