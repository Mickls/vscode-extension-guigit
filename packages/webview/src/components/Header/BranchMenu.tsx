import { useEffect, useRef, useState, type ReactElement } from "react";
import type { BranchesViewModel } from "../../app/rpcContract.generated";

export interface BranchMenuLabels {
  allBranches: string;
  branch: string;
  selectedBranches: string;
}

export interface BranchMenuProps {
  branches?: BranchesViewModel;
  labels: BranchMenuLabels;
  onBranchSelectionChange?: (branches: readonly string[]) => void;
  selectedBranches: readonly string[];
}

export function BranchMenu({
  branches,
  labels,
  onBranchSelectionChange,
  selectedBranches
}: BranchMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const branchOptions = flattenBranches(branches);
  const selectedBranchSet = new Set(selectedBranches);
  const branchLabel = selectedBranches.length === 0
    ? labels.allBranches
    : selectedBranches.length === 1
      ? selectedBranches[0]!
      : labels.selectedBranches.replace("{0}", selectedBranches.length.toString());

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root?.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    };

    window.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [open]);

  const toggleBranch = (branch: string) => {
    const nextBranches = selectedBranchSet.has(branch)
      ? selectedBranches.filter((selectedBranch) => selectedBranch !== branch)
      : [...selectedBranches, branch];
    onBranchSelectionChange?.(nextBranches);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={labels.branch}
        className="h-7 max-w-[220px] truncate rounded-[3px] border border-[var(--vscode-dropdown-border)] bg-[var(--vscode-dropdown-background)] px-2 text-left text-xs text-[var(--vscode-dropdown-foreground)]"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {branchLabel}
      </button>
      {open ? (
        <div
          aria-label={labels.branch}
          className="absolute left-0 top-8 z-[1000] max-h-[320px] min-w-[220px] overflow-y-auto rounded border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] py-1 text-xs shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          role="menu"
        >
          <button
            className="block w-full bg-transparent px-3 py-2 text-left text-[var(--vscode-menu-foreground,var(--vscode-foreground))] hover:bg-[var(--vscode-menu-selectionBackground)]"
            onClick={() => {
              onBranchSelectionChange?.([]);
              setOpen(false);
            }}
            role="menuitem"
            type="button"
          >
            {labels.allBranches}
          </button>
          {branchOptions.map((branch) => (
            <label
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[var(--vscode-menu-foreground,var(--vscode-foreground))] hover:bg-[var(--vscode-menu-selectionBackground)]"
              key={branch}
            >
              <input
                checked={selectedBranchSet.has(branch)}
                onChange={() => toggleBranch(branch)}
                type="checkbox"
              />
              <span>{branch}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function flattenBranches(branches: BranchesViewModel | undefined): readonly string[] {
  if (!branches) {
    return [];
  }

  return [
    ...branches.locals.map((branch) => branch.name),
    ...branches.remotes.flatMap((remote) => remote.branches.map((branch) => branch.name))
  ];
}
