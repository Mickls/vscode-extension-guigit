# GUI Git History

[中文说明](./README.zh-CN.md)

GUI Git History is a visual Git history viewer for VS Code. It gives you an interactive commit graph, commit details, file change views, compare workflows, remote management, proxy settings, and inline blame annotations without leaving the editor.

## Features

- Browse repository history in a dedicated Git History panel.
- Inspect commit metadata, refs, author information, and changed files.
- Switch changed files between tree and list view.
- Compare commits and open file diffs from the comparison view.
- Open file-specific history from the Explorer or editor context menu.
- Manage remotes from the extension UI.
- Configure Git proxy settings from inside VS Code.
- Show inline Git blame annotations with quick actions for opening commits and copying hashes.
- Choose the extension UI language, including automatic VS Code language detection.

## Getting Started

1. Open a folder or workspace that contains a Git repository.
2. Run **GUI Git History: Show Git History** from the Command Palette, or open the **Git History** panel.
3. Select a repository if your workspace contains more than one.
4. Browse commits, inspect file changes, compare commits, or open a file's history from the editor or Explorer.

## Settings

GUI Git History contributes these VS Code settings:

- `guigit.fileViewMode`: default changed-file view mode, either `tree` or `list`.
- `guigit.language`: UI language preference.
- `guigit.autoStashOnPull`: how pull operations handle local changes.
- `guigit.proxy.enabled`: enable custom Git proxy configuration.
- `guigit.proxy.http`: HTTP proxy URL.
- `guigit.proxy.https`: HTTPS proxy URL.
- `guigit.proxy.noProxy`: comma-separated no-proxy hosts.
- `guigit.blame.enabled`: enable inline Git blame annotations.
- `guigit.blame.showOnlyCurrentLine`: show blame only for the active editor line.
- `guigit.blame.format`: inline blame text format.
- `guigit.logLevel`: diagnostic logging level.

## Commands

- **GUI Git History: Show Git History**
- **GUI Git History: Refresh**
- **GUI Git History: Toggle Git Blame**
- **GUI Git History: View File History**
- **GUI Git History: Show Commit Details**
- **GUI Git History: Copy Commit Hash**

## Requirements

GUI Git History depends on the built-in VS Code Git extension and requires the workspace to contain a Git repository.

## Support

Open the **GUI Git History** output channel when reporting issues. If possible, set `guigit.logLevel` to `debug`, reproduce the problem, and include the relevant log lines.
