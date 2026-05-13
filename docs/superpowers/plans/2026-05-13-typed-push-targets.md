# Typed Push Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let both Advanced Push and Push All Commits To Here accept typed branch targets directly, creating new remote branches without an extra create-branch selection.

**Architecture:** Reuse the existing input-enabled QuickPick path in `GitService`. Keep resolved targets in `remote/branch` form, then split them at push execution time with the existing `splitRemoteBranch` helper.

**Tech Stack:** TypeScript, Vitest, VS Code QuickPick/InputBox abstractions, simple-git raw commands.

---

## File Structure

- Modify `packages/extension/test/unit/gitService.test.ts`: add behavior tests around typed push targets.
- Modify `packages/extension/src/backend/git/GitService.ts`: change Push All Commits To Here target picking to use `showQuickPickWithInput`, and teach typed target creation to preserve known explicit remotes.

### Task 1: Add Failing Tests

**Files:**
- Modify: `packages/extension/test/unit/gitService.test.ts`

- [x] **Step 1: Write the failing tests**

Add these tests near the existing `pushAllCommitsToHere` coverage:

```ts
  it("pushes all commits to a typed default-remote branch target", async () => {
    const calls: string[] = [];
    const showQuickPickWithInput = vi.fn().mockResolvedValue({
      label: "origin/review/topic",
      value: "origin/review/topic"
    });
    const showQuickPick = vi.fn().mockResolvedValue({ label: "Push Commits", value: "confirm" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n";
        }

        return "";
      },
      showQuickPick,
      showQuickPickWithInput
    });

    await expect(service.pushAllCommitsToHere("/repo", "abc123")).resolves.toEqual({
      message: "Pushed commits to origin/review/topic",
      status: "ok"
    });

    expect(showQuickPickWithInput).toHaveBeenCalledWith(
      [
        { label: "origin/main", value: "origin/main" },
        { label: "+ Create new remote branch", value: "__create__" }
      ],
      { createRemote: "origin", placeHolder: "Select target remote branch" }
    );
    expect(calls).toEqual(["branch -r", "push origin abc123:refs/heads/review/topic"]);
  });

  it("pushes all commits to a typed explicit remote branch target", async () => {
    const calls: string[] = [];
    const showQuickPickWithInput = vi.fn().mockResolvedValue({
      label: "upstream/review/topic",
      value: "upstream/review/topic"
    });
    const showQuickPick = vi.fn().mockResolvedValue({ label: "Push Commits", value: "confirm" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n  upstream/main\n";
        }

        return "";
      },
      showQuickPick,
      showQuickPickWithInput
    });

    await expect(service.pushAllCommitsToHere("/repo", "abc123")).resolves.toEqual({
      message: "Pushed commits to upstream/review/topic",
      status: "ok"
    });

    expect(calls).toEqual(["branch -r", "push upstream abc123:refs/heads/review/topic"]);
  });
```

- [x] **Step 2: Add an Advanced Push assertion for explicit remote typing**

Add this test near the existing Advanced Push typed-input tests:

```ts
  it("preserves an explicit remote when advanced push input has no branch match", async () => {
    const calls: string[] = [];
    const showQuickPickWithInput = vi.fn().mockResolvedValue({
      label: "upstream/feature/new-branch",
      value: "upstream/feature/new-branch"
    });
    const showQuickPick = vi.fn().mockResolvedValue({ label: "Normal", value: "normal" });
    const service = createService({
      gitRaw: async (_repositoryRoot, args) => {
        calls.push(args.join(" "));
        if (args.join(" ") === "branch -r") {
          return "  origin/main\n  upstream/main\n";
        }

        return "";
      },
      showQuickPick,
      showQuickPickWithInput
    });

    await expect(service.advancedPush("/repo")).resolves.toEqual({ message: "Advanced push completed", status: "ok" });

    expect(calls).toEqual([
      "branch -r",
      "push upstream HEAD:feature/new-branch",
      "rev-parse --abbrev-ref HEAD"
    ]);
  });
```

- [x] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm --filter vscode-extension-guigit test -- test/unit/gitService.test.ts
```

Expected: the new Push All Commits tests fail because `pickPushAllCommitsTarget` calls `showQuickPick`, not `showQuickPickWithInput`. The real QuickPick typing test fails until explicit remote names are preserved during typed target creation.

### Task 2: Implement Push All Commits Typed Target Selection

**Files:**
- Modify: `packages/extension/src/backend/git/GitService.ts`
- Test: `packages/extension/test/unit/gitService.test.ts`

- [x] **Step 1: Replace Push All Commits target picker implementation**

Change `pickPushAllCommitsTarget` to:

```ts
  private async pickPushAllCommitsTarget(repositoryRoot: string): Promise<string | undefined> {
    const remoteBranches = preferMainBranches(parseRemoteBranches(await this.runGitRaw(repositoryRoot, ["branch", "-r"])));
    const createRemote = await this.getDefaultCreateRemote(repositoryRoot, remoteBranches);
    const remotes = remoteNamesFromBranches(remoteBranches);
    const target = await this.showQuickPickWithInput(
      [
        ...remoteBranches.map((branch) => ({ label: branch, value: branch })),
        { label: "+ Create new remote branch", value: "__create__" }
      ],
      { createRemote, placeHolder: "Select target remote branch", remotes }
    );
    if (!target) {
      return undefined;
    }

    if (target.value !== "__create__") {
      return target.value;
    }

    const branch = await this.showInputBox({
      placeHolder: `${createRemote}/feature-branch`,
      prompt: "Enter new remote branch name"
    });
    if (!branch) {
      return undefined;
    }

    return createRemoteBranchItem(createRemote, branch.trim(), remotes).value;
  }
```

- [x] **Step 2: Run focused tests to verify green**

Run:

```bash
pnpm --filter vscode-extension-guigit test -- test/unit/gitService.test.ts
```

Expected: all `gitService.test.ts` tests pass.

- [x] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter vscode-extension-guigit typecheck
```

Expected: TypeScript completes without errors.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add packages/extension/src/backend/git/GitService.ts packages/extension/test/unit/gitService.test.ts docs/superpowers/plans/2026-05-13-typed-push-targets.md
git commit -m "feat: streamline typed push targets"
```
