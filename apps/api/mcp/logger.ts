export const logger = {
  info: (message: string, meta?: Record<string, any>) => {
    process.stderr.write(
      JSON.stringify({ level: "info", message, ...meta }) + "\n",
    );
  },
  warn: (message: string, meta?: Record<string, any>) => {
    process.stderr.write(
      JSON.stringify({ level: "warn", message, ...meta }) + "\n",
    );
  },
  error: (message: string, meta?: Record<string, any>) => {
    process.stderr.write(
      JSON.stringify({ level: "error", message, ...meta }) + "\n",
    );
  },
};
