import pino from "pino";

// Personal data never reaches the logs, wherever it sits in a log object.
const redactedFields = ["phone", "email", "name", "token", "code", "password", "text"];

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.FF_SERVICE ?? "web" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: redactedFields.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
    censor: "[redacted]",
  },
});
