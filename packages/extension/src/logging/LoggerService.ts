export type LogLevel = "debug" | "info" | "error" | "off";

export interface LogSink {
  appendLine(line: string): void;
}

export interface LoggerServiceInput {
  level: () => LogLevel;
  sink: LogSink;
}

export interface Logger {
  debug(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
}

const priorities = {
  off: 0,
  error: 1,
  info: 2,
  debug: 3
} as const satisfies Record<LogLevel, number>;

export class LoggerService implements Logger {
  private readonly level: () => LogLevel;
  private readonly sink: LogSink;

  public constructor(input: LoggerServiceInput) {
    this.level = input.level;
    this.sink = input.sink;
  }

  public debug(message: string, context?: unknown): void {
    this.write("debug", message, context);
  }

  public info(message: string, context?: unknown): void {
    this.write("info", message, context);
  }

  public error(message: string, context?: unknown): void {
    this.write("error", message, context);
  }

  private write(level: Exclude<LogLevel, "off">, message: string, context: unknown): void {
    if (priorities[this.level()] < priorities[level]) {
      return;
    }

    const serializedContext = context === undefined ? "" : ` ${JSON.stringify(context)}`;
    this.sink.appendLine(`[${level}] ${message}${serializedContext}`);
  }
}
