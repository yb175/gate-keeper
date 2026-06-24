export interface Tool {
  name: string;

  description: string;

  inputSchema: object;

  execute(args: unknown): Promise<unknown>;
}

export interface MCPServer {
  name: string;

  listTools(): Promise<Tool[]>;

  execute(toolName: string, args: unknown): Promise<unknown>;
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
    // Maintain proper stack trace in V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

