/* eslint no-console: "off" */
import { nativeLog, type LogLevel } from "noah-tools";
import { Result } from "neverthrow";

const isDevMode = __DEV__;

type LogFn = (message: string, data?: unknown[]) => void;
type LogMethods = {
  v: LogFn;
  verbose: LogFn;
  d: LogFn;
  debug: LogFn;
  i: LogFn;
  info: LogFn;
  w: LogFn;
  warn: LogFn;
  e: LogFn;
  error: LogFn;
};

const log = (tag = ""): LogMethods => {
  const performLog =
    (level: LogLevel): LogFn =>
    (message, data = []) => {
      const normalizedData = Array.isArray(data) ? data : [data];
      const formattedMessage = buildMessage(message, normalizedData);

      if (isDevMode) {
        pipeToConsole(level, `[${tag}] ${formattedMessage}`);
      }

      Result.fromThrowable(() => nativeLog(level, tag, formattedMessage))().mapErr((error) => {
        if (isDevMode) {
          console.warn(`Failed to write native log (${level}):`, error);
        }
      });
    };

  return {
    v: performLog("verbose"),
    verbose: performLog("verbose"),
    d: performLog("debug"),
    debug: performLog("debug"),
    i: performLog("info"),
    info: performLog("info"),
    w: performLog("warn"),
    warn: performLog("warn"),
    e: performLog("error"),
    error: performLog("error"),
  };
};

export default log;

const buildMessage = (message: string, data: unknown[]): string => {
  if (!data || data.length === 0) {
    return message;
  }

  const formattedData = data.map(safeStringify).join("\n  ");
  return `${message}\n  ${formattedData}`;
};

const safeStringify = (value: unknown): string => {
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      stack: value.stack,
    });
  }

  const stringified = Result.fromThrowable(() => JSON.stringify(value))();
  return stringified.isOk() ? String(stringified.value) : String(value);
};

const pipeToConsole = (level: LogLevel, message: string) => {
  switch (level) {
    case "verbose":
    case "debug":
      console.debug(message);
      break;
    case "info":
      console.info(message);
      break;
    case "warn":
      console.warn(message);
      break;
    case "error":
      console.error(message);
      break;
    default:
      console.log(message);
  }
};
