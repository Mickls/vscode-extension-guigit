# Typed Push Targets Design

## Goal

Make push target selection accept direct branch typing for both Advanced Push and Push All Commits To Here.

## User Experience

When choosing a remote push target, the user can type a branch name and press Enter. If the typed value does not match an existing remote branch, the command treats it as a new remote branch target.

Short branch names such as `review/topic` are resolved against the default create remote, normally `origin`, and push to `origin/review/topic`. Fully qualified values such as `upstream/review/topic` preserve the typed remote and push to that remote. Existing remote branches can still be selected from the list.

Push All Commits To Here should not require selecting `+ Create new remote branch` before typing. After typing a new target, the existing confirmation prompt remains the final step before running the push.

## Backend Behavior

Reuse the existing input-enabled QuickPick behavior for target selection. The default create remote comes from the first known remote branch, or the first configured remote when no remote branch exists.

The resolved target stays in `remote/branch` form inside `GitService`, then the push command splits it into the remote and branch refspec:

- Advanced Push: `git push <remote> HEAD:<branch>`.
- Push All Commits To Here: `git push <remote> <hash>:refs/heads/<branch>`.

## Testing

Add unit tests that cover:

- Push All Commits To Here creates a default-remote target from a typed short branch.
- Push All Commits To Here preserves an explicitly typed non-default remote target.
- Advanced Push preserves the same typed target behavior.
