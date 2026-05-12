/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationCenter, type NotificationCenterLabels, type NotificationHistoryItem } from "./NotificationCenter";

const labels: NotificationCenterLabels = {
  clear: "Clear notifications",
  close: "Close notifications",
  copy: "Copy notification",
  empty: "No notifications",
  showUnreadCount: "Show unread count",
  states: {
    error: "Error",
    running: "Running",
    success: "Success",
    warning: "Warning"
  },
  title: "Notifications"
};

const notifications: readonly NotificationHistoryItem[] = [
  {
    createdAt: "2026-05-12T08:00:00.000Z",
    id: "one",
    message: "Pull completed",
    read: false,
    state: "success"
  }
];

describe("NotificationCenter", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders retained notifications with per-item actions", () => {
    render(
      <NotificationCenter
        labels={labels}
        notifications={notifications}
        onClear={vi.fn()}
        onClose={vi.fn()}
        onCopyNotification={vi.fn()}
        onShowUnreadCountChange={vi.fn()}
        open
        showUnreadCount
      />
    );

    expect(screen.getByRole("region", { name: "Notifications" })).toHaveTextContent("Pull completed");
    expect(screen.getByRole("button", { name: "Copy notification" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Show unread count" })).toBeChecked();
  });

  it("sends notification center intents", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onCopyNotification = vi.fn();
    const onShowUnreadCountChange = vi.fn();

    render(
      <NotificationCenter
        labels={labels}
        notifications={notifications}
        onClear={onClear}
        onClose={onClose}
        onCopyNotification={onCopyNotification}
        onShowUnreadCountChange={onShowUnreadCountChange}
        open
        showUnreadCount
      />
    );

    await user.click(screen.getByRole("button", { name: "Copy notification" }));
    await user.click(screen.getByRole("button", { name: "Clear notifications" }));
    await user.click(screen.getByRole("checkbox", { name: "Show unread count" }));
    await user.click(screen.getByRole("button", { name: "Close notifications" }));

    expect(onCopyNotification).toHaveBeenCalledWith(notifications[0]);
    expect(onClear).toHaveBeenCalled();
    expect(onShowUnreadCountChange).toHaveBeenCalledWith(false);
    expect(onClose).toHaveBeenCalled();
  });
});
