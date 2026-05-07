import type { MouseEvent, ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export interface SplitPanelsProps {
  initialLeftCollapsed?: boolean;
  initialRightCollapsed?: boolean;
  left: ReactNode;
  right: ReactNode;
}

export function SplitPanels({
  initialLeftCollapsed = false,
  initialRightCollapsed = false,
  left,
  right
}: SplitPanelsProps): ReactElement {
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
        aria-label="Commit list panel"
        className="relative flex min-w-[650px] flex-col overflow-hidden transition-[width] duration-300 data-[collapsed=true]:min-w-10 data-[collapsed=true]:max-w-10 data-[resizing=true]:transition-none"
        data-collapsed={leftCollapsed}
        data-resizing={isResizing}
        style={leftStyle}
      >
        <div className="sticky top-0 z-10 flex h-10 shrink-0 items-center justify-between border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-3 py-0.5 data-[collapsed=true]:justify-center data-[collapsed=true]:border-b-0">
          {!leftCollapsed ? (
            <div className="grid flex-1 grid-cols-[80px_minmax(180px,1fr)_minmax(96px,180px)_120px_100px] gap-3 text-[11px] text-[var(--vscode-descriptionForeground)]">
              <span>Hash</span>
              <span>Message</span>
              <span>Refs</span>
              <span>Author</span>
              <span>Date</span>
            </div>
          ) : null}
          <button
            aria-label={leftCollapsed ? "Expand commit list panel" : "Collapse commit list panel"}
            className="flex h-6 min-w-6 items-center justify-center rounded-[3px] border border-[var(--vscode-button-border)] bg-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            onClick={toggleLeftPanel}
            type="button"
          >
            {leftCollapsed ? ">" : "<"}
          </button>
        </div>
        {!leftCollapsed ? left : null}
      </section>

      <div
        aria-label="Resize panels"
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
        aria-label="Commit details panel"
        className="relative flex min-w-0 flex-col overflow-y-auto transition-[width] duration-300 data-[collapsed=true]:min-w-10 data-[collapsed=true]:max-w-10 data-[collapsed=true]:overflow-hidden data-[resizing=true]:transition-none"
        data-collapsed={rightCollapsed}
        data-resizing={isResizing}
        style={rightStyle}
      >
        <div className="sticky top-0 z-10 flex h-10 shrink-0 items-center border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-0.5 data-[collapsed=true]:justify-center data-[collapsed=true]:border-b-0">
          <button
            aria-label={rightCollapsed ? "Expand commit details panel" : "Collapse commit details panel"}
            className="flex h-6 min-w-6 items-center justify-center rounded-[3px] border border-[var(--vscode-button-border)] bg-transparent px-1.5 text-xs text-[var(--vscode-icon-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            onClick={toggleRightPanel}
            type="button"
          >
            {rightCollapsed ? "<" : ">"}
          </button>
        </div>
        {!rightCollapsed ? right : null}
      </section>
    </div>
  );
}
