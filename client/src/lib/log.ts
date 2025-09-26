/* eslint-disable @typescript-eslint/no-explicit-any */
import { nativeLog } from "noah-tools";

const isDevMode = __DEV__;

const log = (tag?: string) => {
  tag = tag ?? "";

  return {
    v: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      if (isDevMode) {
        nativeLog("verbose", tag, msg);
      } else {
        console.debug(tag, msg);
      }
    },

    d: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      if (isDevMode) {
        nativeLog("debug", tag, msg);
      } else {
        console.debug(tag, msg);
      }
    },

    i: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      if (isDevMode) {
        nativeLog("info", tag, msg);
      } else {
        console.info(tag, msg);
      }
    },

    w: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      if (isDevMode) {
        nativeLog("warn", tag, msg);
      } else {
        console.warn(tag, msg);
      }
    },

    e: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      if (isDevMode) {
        nativeLog("error", tag, msg);
      } else {
        console.error(tag, msg);
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
