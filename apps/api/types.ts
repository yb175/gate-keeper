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
