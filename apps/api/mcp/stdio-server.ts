import { MCPServer, Tool } from "../types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class StdioMCPServer implements MCPServer {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connectPromise: Promise<Client> | null = null;

  constructor(
    public name: string,
    private command: string,
    private args: string[],
    private env: Record<string, string> = {},
  ) {}

  private getConnectedClient(): Promise<Client> {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      try {
        const client = new Client(
          {
            name: `gate-keeper-client-${this.name}`,
            version: "1.0.0",
          },
          {
            capabilities: {},
          },
        );

        const mergedEnv = {
          ...process.env,
          ...this.env,
        } as Record<string, string>;

        this.transport = new StdioClientTransport({
          command: this.command,
          args: this.args,
          env: mergedEnv,
        });

        // Set a connection timeout of 15 seconds
        const timeoutMs = 15000;
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timer = setTimeout(() => {
            reject(
              new Error(
                `Connection to MCP server '${this.name}' timed out after ${timeoutMs}ms`,
              ),
            );
          }, timeoutMs);
          if (timer.unref) {
            timer.unref();
          }
        });

        await Promise.race([client.connect(this.transport), timeoutPromise]);

        this.client = client;
        return client;
      } catch (error) {
        // Clean up connections on failure
        await this.close();
        throw error;
      }
    })();

    return this.connectPromise;
  }

  async listTools(): Promise<Tool[]> {
    try {
      const client = await this.getConnectedClient();
      const response = await client.listTools();

      return (response.tools || []).map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema || {},
        execute: async (args: unknown) => {
          return this.execute(t.name, args);
        },
      }));
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async execute(toolName: string, args: unknown): Promise<unknown> {
    try {
      const client = await this.getConnectedClient();
      const response = await client.callTool({
        name: toolName,
        arguments: args as Record<string, any>,
      });
      return response;
    } catch (error) {
      // On connection errors, close/reset transport so subsequent attempts can reconnect
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    this.connectPromise = null;
    this.client = null;
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (e) {
        // Ignore close errors
      }
      this.transport = null;
    }
  }
}
