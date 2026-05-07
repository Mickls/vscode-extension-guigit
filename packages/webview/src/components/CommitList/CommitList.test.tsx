/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { CommitList } from "./CommitList";
import type { CommitListItemViewModel } from "../../app/rpcContract.generated";

describe("CommitList", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses a fixed row model shared by the graph strip and commit rows", () => {
    render(<CommitList commits={[createCommit("first"), createCommit("second")]} />);

    expect(screen.getByTestId("graph-strip")).toHaveStyle({ height: "72px" });
    for (const row of screen.getAllByTestId("commit-row")) {
      expect(row).toHaveClass("h-9");
      expect(row).not.toHaveClass("min-h-9");
    }
  });
});

function createCommit(hash: string): CommitListItemViewModel {
  return {
    author: "Ada",
    canEditMessage: false,
    date: "2026-05-07 10:00:00 +0800",
    hash,
    message: `Commit ${hash}`,
    parents: [],
    refs: [],
    shortHash: hash.slice(0, 7)
  };
}
