import type { I18nMessages } from "./rpcContract.generated";

export type Translate = (key: string, ...args: readonly unknown[]) => string;

export function createTranslator(messages: I18nMessages): Translate {
  return (key, ...args) => {
    const message = getMessage(key, messages);
    return args.length > 0 ? formatMessage(message, args) : message;
  };
}

function getMessage(key: string, messages: I18nMessages): string {
  let value: I18nMessages | string = messages;
  for (const segment of key.split(".")) {
    if (typeof value === "string") {
      return key;
    }

    const nextValue: I18nMessages | string | undefined = value[segment];
    if (nextValue === undefined) {
      return key;
    }

    value = nextValue;
  }

  return typeof value === "string" ? value : key;
}

function formatMessage(message: string, args: readonly unknown[]): string {
  return message.replace(/\{(\d+)}/g, (match: string, index: string) => {
    const value = args[Number.parseInt(index, 10)];
    return value === undefined ? match : formatArgument(value);
  });
}

function formatArgument(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  }

  return JSON.stringify(value);
}
