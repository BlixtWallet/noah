export const redactSensitiveErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "<redacted>");
};
