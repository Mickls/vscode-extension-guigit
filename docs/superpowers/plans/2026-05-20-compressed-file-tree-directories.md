# Compressed File Tree Directories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render deep single-branch directory chains as one directory row in `tree` mode for commit details and working-tree changes.

**Architecture:** Keep existing file-change view models and tree-building code. Add one shared renderer helper that compresses directory-only single-child chains during render, then use it from both `FileChanges` and `ChangesPanel` so details and changes stay consistent.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, jsdom.

---

## File Structure

- Create `packages/webview/src/components/FileChanges/treeCompression.ts`
  - Exports a generic `compressDirectoryChain` helper for tree renderers.
  - Operates on structural nodes with `children: Map<string, TNode>` and optional `file`.
- Modify `packages/webview/src/components/FileChanges/FileChanges.test.tsx`
  - Update old tree grouping expectation to the compressed behavior.
  - Add branch-point coverage for `app/biz`.
- Modify `packages/webview/src/components/ChangesPanel/ChangesPanel.test.tsx`
  - Update working-tree tree-mode expectation to compressed directory rows.
- Modify `packages/webview/src/components/FileChanges/FileChanges.tsx`
  - Use the shared helper while rendering directory rows.
- Modify `packages/webview/src/components/ChangesPanel/ChangesPanel.tsx`
  - Use the shared helper while rendering staged and unstaged directory rows.

### Task 1: Add Failing FileChanges Tests

**Files:**
- Modify: `packages/webview/src/components/FileChanges/FileChanges.test.tsx`

- [ ] **Step 1: Update the existing tree-mode test to expect compressed directory chains**

Replace the `renders tree mode grouped by directory` assertions with:

```tsx
expect(within(region).getByRole("button", { name: "Collapse src/components" })).toBeInTheDocument();
expect(within(region).getByText("FileChanges.tsx")).toBeInTheDocument();
expect(within(region).getByRole("button", { name: "Collapse assets" })).toBeInTheDocument();
expect(within(region).getByText("logo.png")).toBeInTheDocument();
expect(within(region).queryByRole("button", { name: "Collapse src" })).not.toBeInTheDocument();
expect(within(region).queryByText("components")).not.toBeInTheDocument();
```

- [ ] **Step 2: Add a branch-point test**

Add this test after the tree-mode test:

```tsx
it("stops tree directory compression at branch points", () => {
  render(
    <FileChanges
      files={[
        createFile("app/biz/knowledge/base.go", "modified"),
        createFile("app/biz/biz.go", "modified")
      ]}
      mode="tree"
    />
  );

  const region = screen.getByRole("region", { name: "Files Changed" });

  expect(within(region).getByRole("button", { name: "Collapse app/biz" })).toBeInTheDocument();
  expect(within(region).getByRole("button", { name: "Collapse app/biz/knowledge" })).toBeInTheDocument();
  expect(within(region).getByText("knowledge")).toBeInTheDocument();
  expect(within(region).getByText("base.go")).toBeInTheDocument();
  expect(within(region).getByText("biz.go")).toBeInTheDocument();
  expect(within(region).queryByRole("button", { name: "Collapse app" })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run focused test and verify RED**

Run:

```bash
pnpm --filter @gui-git-history/webview test -- FileChanges.test.tsx
```

Expected: FAIL because `Collapse src/components` and `Collapse app/biz` do not exist yet.

### Task 2: Add Failing ChangesPanel Test Coverage

**Files:**
- Modify: `packages/webview/src/components/ChangesPanel/ChangesPanel.test.tsx`

- [ ] **Step 1: Update the working-tree tree-mode expectation**

Inside `groups staged and unstaged files in tree mode while preserving row actions`, replace the directory row assertions with:

```tsx
expect(screen.getByRole("button", { name: "Collapse src/components" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Collapse assets/styles" })).toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Collapse src" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "Collapse assets" })).not.toBeInTheDocument();
expect(screen.getByText("Button.tsx")).toBeInTheDocument();
expect(screen.getByText("app.css")).toBeInTheDocument();
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
pnpm --filter @gui-git-history/webview test -- ChangesPanel.test.tsx
```

Expected: FAIL because staged and unstaged tree rows still render `src` and `assets`.

### Task 3: Implement Shared Directory Compression Helper

**Files:**
- Create: `packages/webview/src/components/FileChanges/treeCompression.ts`

- [ ] **Step 1: Create the helper**

Add:

```ts
export interface CompressibleTreeNode<TNode extends CompressibleTreeNode<TNode>> {
  children: Map<string, TNode>;
  file?: unknown;
}

export interface CompressedDirectory<TNode> {
  label: string;
  node: TNode;
  path: string;
}

export function compressDirectoryChain<TNode extends CompressibleTreeNode<TNode>>(input: {
  name: string;
  node: TNode;
  path: string;
}): CompressedDirectory<TNode> {
  const labelParts = [input.name];
  let current = input.node;
  let currentPath = input.path;

  while (!current.file && current.children.size === 1) {
    const [childName, child] = [...current.children.entries()][0]!;
    if (child.file) {
      break;
    }

    labelParts.push(childName);
    current = child;
    currentPath = `${currentPath}/${childName}`;
  }

  return {
    label: labelParts.join("/"),
    node: current,
    path: currentPath
  };
}
```

### Task 4: Use Compression in FileChanges

**Files:**
- Modify: `packages/webview/src/components/FileChanges/FileChanges.tsx`

- [ ] **Step 1: Import the helper**

Add:

```ts
import { compressDirectoryChain } from "./treeCompression";
```

- [ ] **Step 2: Compress directory nodes in `renderTree`**

Replace the directory branch after `child.file` with:

```tsx
const directoryPath = input.parentPath ? `${input.parentPath}/${name}` : name;
const directory = compressDirectoryChain({ name, node: child, path: directoryPath });
const collapsed = input.collapsedDirectories.has(directory.path);
return [
  <button
    aria-expanded={!collapsed}
    aria-label={formatLabel(collapsed ? input.labels.expandDirectory : input.labels.collapseDirectory, directory.path)}
    className="guigit-icon-tooltip-host flex w-full items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-transparent px-2 py-1.5 text-left text-[11px] text-[var(--vscode-descriptionForeground)] last:border-b-0 hover:bg-[var(--vscode-list-hoverBackground)]"
    key={`directory-${input.depth}-${directory.path}`}
    onClick={() => input.toggleDirectory(directory.path)}
    style={{ paddingLeft: `${8 + input.depth * 14}px` }}
    type="button"
  >
    <span className="w-3 text-center">{collapsed ? "+" : "-"}</span>
    <span className="truncate">{directory.label}</span>
    <span className="ml-auto text-[10px]">{countFiles(directory.node)}</span>
    <IconTooltip
      label={formatLabel(collapsed ? input.labels.expandDirectory : input.labels.collapseDirectory, directory.path)}
      placement="bottom"
    />
  </button>,
  ...(collapsed
    ? []
    : renderTree({
        ...input,
        depth: input.depth + 1,
        node: directory.node,
        parentPath: directory.path
      }))
];
```

- [ ] **Step 3: Run focused test and verify FileChanges is GREEN**

Run:

```bash
pnpm --filter @gui-git-history/webview test -- FileChanges.test.tsx
```

Expected: PASS for `FileChanges.test.tsx`.

### Task 5: Use Compression in ChangesPanel

**Files:**
- Modify: `packages/webview/src/components/ChangesPanel/ChangesPanel.tsx`

- [ ] **Step 1: Import the helper**

Add:

```ts
import { compressDirectoryChain } from "../FileChanges/treeCompression";
```

- [ ] **Step 2: Compress directory nodes in `renderWorkingTree`**

Replace the directory branch after `child.file` with:

```tsx
const directoryPath = input.parentPath ? `${input.parentPath}/${name}` : name;
const directory = compressDirectoryChain({ name, node: child, path: directoryPath });
const collapsed = input.collapsedDirectories.has(directory.path);
return [
  <button
    aria-expanded={!collapsed}
    aria-label={formatLabel(collapsed ? input.labels.expandDirectory : input.labels.collapseDirectory, directory.path)}
    className="guigit-icon-tooltip-host flex w-full items-center gap-2 border-b border-[var(--vscode-panel-border)] bg-transparent px-2 py-1.5 text-left text-[11px] text-[var(--vscode-descriptionForeground)] last:border-b-0 hover:bg-[var(--vscode-list-hoverBackground)]"
    key={`directory-${input.depth}-${directory.path}`}
    onClick={() => input.toggleDirectory(directory.path)}
    style={{ paddingLeft: `${8 + input.depth * 14}px` }}
    type="button"
  >
    <span className="w-3 text-center">{collapsed ? "+" : "-"}</span>
    <span className="truncate">{directory.label}</span>
    <span className="ml-auto text-[10px]">{countFiles(directory.node)}</span>
    <IconTooltip
      label={formatLabel(collapsed ? input.labels.expandDirectory : input.labels.collapseDirectory, directory.path)}
      placement="bottom"
    />
  </button>,
  ...(collapsed
    ? []
    : renderWorkingTree({
        ...input,
        depth: input.depth + 1,
        node: directory.node,
        parentPath: directory.path
      }))
];
```

- [ ] **Step 3: Run focused test and verify ChangesPanel is GREEN**

Run:

```bash
pnpm --filter @gui-git-history/webview test -- ChangesPanel.test.tsx
```

Expected: PASS for `ChangesPanel.test.tsx`.

### Task 6: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run all focused webview tests**

Run:

```bash
pnpm --filter @gui-git-history/webview test -- FileChanges.test.tsx ChangesPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run webview test suite**

Run:

```bash
pnpm --filter @gui-git-history/webview test
```

Expected: PASS.

- [ ] **Step 3: Run webview typecheck**

Run:

```bash
pnpm --filter @gui-git-history/webview typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add docs/superpowers/plans/2026-05-20-compressed-file-tree-directories.md packages/webview/src/components/FileChanges/FileChanges.test.tsx packages/webview/src/components/ChangesPanel/ChangesPanel.test.tsx packages/webview/src/components/FileChanges/FileChanges.tsx packages/webview/src/components/ChangesPanel/ChangesPanel.tsx packages/webview/src/components/FileChanges/treeCompression.ts
git commit -m "fix: compress file tree directories"
```

Expected: commit succeeds.
