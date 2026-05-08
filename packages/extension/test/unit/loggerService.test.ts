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
      "\u001B[32m[info] visible.info {\"value\":2}\u001B[0m",
      "\u001B[31m[error] visible.error {\"value\":3}\u001B[0m"
    ]);
  });

  it("uses distinct colors for debug, info, and error output", () => {
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
      "\u001B[33m[debug] debug.command\u001B[0m",
      "\u001B[32m[info] info.command\u001B[0m",
      "\u001B[31m[error] error.command\u001B[0m"
    ]);
  });
});
