# Compressed File Tree Directories Design

## Goal

Improve the `tree` file-change view in both `Details` and `Changes` so deep single-branch directory chains render as one directory row instead of many nested rows.

## Current Behavior

`Details` uses `FileChanges`, and `Changes` has a similar local working-tree renderer. Both build a path tree from changed file paths and render every directory segment as its own expandable row.

For a single changed file:

```text
app/biz/knowledge/base.go
```

the current tree expands as:

```text
app
  biz
    knowledge
      base.go
```

This wastes vertical space when only one file exists under a deep directory chain.

## Desired Behavior

When consecutive tree nodes are directory-only and each has exactly one directory child, render that chain as one directory row.

For one changed file:

```text
app/biz/knowledge
  base.go
```

If the tree branches at `app/biz`, such as:

```text
app/biz/knowledge/base.go
app/biz/biz.go
```

render the shared single-child prefix only until the branch point:

```text
app/biz
  knowledge
    base.go
  biz.go
```

Compressed directory labels do not include a trailing slash.

## Scope

This applies only to `tree` mode. `list` mode keeps full file paths unchanged.

This applies to:

- commit detail file changes in `packages/webview/src/components/FileChanges/FileChanges.tsx`
- working-tree staged and unstaged file changes in `packages/webview/src/components/ChangesPanel/ChangesPanel.tsx`

No backend, RPC, or persisted settings changes are needed.

## Interaction and Accessibility

Compressed directory rows remain expandable and collapsible. Their internal key and aria label use the full compressed directory path, such as `app/biz/knowledge`.

Examples:

- expanded row label: `Collapse app/biz/knowledge`
- collapsed row label: `Expand app/biz/knowledge`

File rows continue to use the original `file.path` for open diff, open file, file history, stage, unstage, and discard actions.

## Implementation Approach

Keep the existing tree data shape and perform compression during rendering. A helper should inspect a directory node before rendering it:

1. Start with the current directory name and full path.
2. While the current node has no file and exactly one child, and that child is also a directory node, append the child name to the display path and advance to the child node.
3. Render one directory row for the resulting display path.
4. Render children from the final node, increasing depth by one.

This preserves the original file paths and keeps collapse state keyed by the full visible directory path.

## Testing

Add failing tests before implementation:

- `FileChanges` tree mode compresses a deep single-file directory chain to `app/biz/knowledge`.
- `FileChanges` tree mode stops compression at a branch point, rendering `app/biz`, `knowledge`, `base.go`, and `biz.go`.
- `ChangesPanel` tree mode uses the same compression behavior for working-tree file sections.

Run focused webview tests first, then the webview package test suite.
