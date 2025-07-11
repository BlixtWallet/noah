// TODO(hsjoberg): we don't have got code to know if it's debug mode or not
const Debug = true;

export type LogLevel = "Verbose" | "Debug" | "Info" | "Warning" | "Error";
export const logEntries: [LogLevel, string][] = [];

// TODO: maybe make array observable in order trigger re-render for hook
export function useGetLogEntries(): [LogLevel, string][] {
  return logEntries;
}

const log = (tag?: string) => {
  tag = tag ?? "";

  return {
    v: (message: string, data: any[] = []) => {
      if (Debug) {
        const msg = fixMessage(message, data);
        logEntries.push(["Debug", `${tag}: ${msg}`]);
        console.debug(`${tag}: ${msg}`);
      }
    },

    d: (message: string, data: any[] = []) => {
      if (Debug) {
        const msg = fixMessage(message, data);
        logEntries.push(["Debug", `${tag}: ${msg}`]);
        console.debug(`${tag}: ${msg}`);
      }
    },

    i: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      logEntries.push(["Info", `${tag}: ${msg}`]);
      console.log(`${tag}: ${msg}`);
    },

    w: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      logEntries.push(["Warning", `${tag}: ${msg}`]);
      console.warn(`${tag}: ${msg}`);
    },

    e: (message: string, data: any[] = []) => {
      const msg = fixMessage(message, data);
      logEntries.push(["Error", `${tag}: ${msg}`]);
      console.log(`${tag}: ${msg}`);
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
