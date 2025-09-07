/* eslint-disable @typescript-eslint/no-explicit-any */
import { nativeLog, LogLevel } from "noah-tools";

// TODO(hsjoberg): we don't have got code to know if it's debug mode or not
const Debug = true;

export const logEntries: [LogLevel, string][] = [];

// TODO: maybe make array observable in order trigger re-render for hook
export function useGetLogEntries(): [LogLevel, string][] {
  return logEntries;
}

const isDebugMode = __DEV__;

const log = (tag?: string) => {
  tag = tag ?? "";

  return {
    v: (message: string, data: any[] = []) => {
      if (Debug) {
        const msg = fixMessage(message, data);
        logEntries.push(["verbose", `${tag}: ${msg}`]);
        if (isDebugMode) {
          console.debug(`${tag}: ${msg}`);
          nativeLog("verbose", tag, msg);
        } else {
          nativeLog("verbose", tag, msg);
        }
      }
    },

    d: (message: string, data: any[] = []) => {
      if (Debug) {
        const msg = fixMessage(message, data);
        logEntries.push(["debug", `${tag}: ${msg}`]);
        if (isDebugMode) {
          console.debug(`${tag}: ${msg}`);
          nativeLog("debug", tag, msg);
        } else {
          nativeLog("debug", tag, msg);
        }
      }
    },

    i: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      logEntries.push(["info", `${tag}: ${msg}`]);
      if (isDebugMode) {
        console.log(`${tag}: ${msg}`);
        nativeLog("info", tag, msg);
      } else {
        nativeLog("info", tag, msg);
      }
    },

    w: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      logEntries.push(["warn", `${tag}: ${msg}`]);
      if (isDebugMode) {
        console.warn(`${tag}: ${msg}`);
        nativeLog("warn", tag, msg);
      } else {
        nativeLog("warn", tag, msg);
      }
    },

    e: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      logEntries.push(["error", `${tag}: ${msg}`]);
      if (isDebugMode) {
        console.error(`${tag}: ${msg}`);
        nativeLog("error", tag, msg);
      } else {
        nativeLog("error", tag, msg);
      }
    },
  };
};

export default log;

const processDataArg = (data: any[]) =>
  data
    .map((d) => {
      if (d instanceof Error) {
        return JSON.stringify({
          name: d.name,
          message: d.message,
          // stack: d.stack,
        });
      }
      return JSON.stringify(d);
    })
    .join("\n  ");

const fixMessage = (message: string, data: any[]) => {
  if (!Array.isArray(data)) {
    log("log.ts").e(
      `Invalid data arg passed to logging function: ${JSON.stringify(data)}. Must be an array`,
    );
  }
  if (data.length > 0) {
    message += `\n  ${processDataArg(data)}`;
  }
  return message;
};
