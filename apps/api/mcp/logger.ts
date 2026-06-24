export const logger = {
  info: (message: string, meta?: Record<string, any>) => {
    process.stderr.write(
      JSON.stringify({ ...meta, level: "info", message }) + "\n",
    );
  },
  warn: (message: string, meta?: Record<string, any>) => {
    process.stderr.write(
      JSON.stringify({ ...meta, level: "warn", message }) + "\n",
    );
  },
  error: (message: string, meta?: Record<string, any>) => {
    process.stderr.write(
      JSON.stringify({ ...meta, level: "error", message }) + "\n",
    );
  },
};
