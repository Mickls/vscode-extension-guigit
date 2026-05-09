/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { CommitDetails } from "./CommitDetails";
import type { CommitDetailsViewModel } from "../../app/rpcContract.generated";

describe("CommitDetails", () => {
  it("shows the full hash and linked author identity", () => {
    render(<CommitDetails commit={commit} fileViewMode="list" />);

    expect(screen.getByText("abc1234567890abcdef")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@users.noreply.github.com")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ada Lovelace avatar" })).toHaveAttribute(
      "src",
      expect.stringContaining("https://www.gravatar.com/avatar/")
    );
    expect(screen.getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", "https://github.com/ada");
  });
});

const commit = {
  author: "Ada Lovelace",
  body: "Body",
  canEditMessage: false,
  date: "2026-05-07 10:00:00 +0800",
  email: "ada@users.noreply.github.com",
  files: [],
  hash: "abc1234567890abcdef",
  message: "Add graph",
  refs: []
} satisfies CommitDetailsViewModel;
