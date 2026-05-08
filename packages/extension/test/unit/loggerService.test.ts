import { describe, expect, it } from "vitest";
import { LoggerService } from "../../src/logging/LoggerService";

describe("LoggerService", () => {
  it("writes messages at or above the configured level", () => {
    const lines: string[] = [];
    const logger = new LoggerService({
      level: () => "info",
      sink: {
        appendLine: (line) => lines.push(line)
      }
    });

    logger.debug("hidden.debug", { value: 1 });
    logger.info("visible.info", { value: 2 });
    logger.error("visible.error", { value: 3 });

    expect(lines).toEqual([
      "[info] visible.info {\"value\":2}",
      "[error] visible.error {\"value\":3}"
    ]);
  });

  it("writes plain text tokens for syntax highlighting instead of ANSI escape codes", () => {
    const lines: string[] = [];
    const logger = new LoggerService({
      level: () => "debug",
      sink: {
        appendLine: (line) => lines.push(line)
      }
    });

    logger.debug("debug.command");
    logger.info("info.command");
    logger.error("error.command");

    expect(lines).toEqual([
      "[debug] debug.command",
      "[info] info.command",
      "[error] error.command"
    ]);
    expect(lines.join("\n")).not.toContain("\u001B");
  });
});
