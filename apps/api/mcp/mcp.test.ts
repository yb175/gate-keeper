import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PluginRegistry } from "./registry.js";
import { ToolsDiscovery } from "./discovery.js";
import { ToolExecutor } from "./execute.js";
import { MCPServer, Tool } from "../types.js";
import path from "path";
import { fileURLToPath } from "url";
import { StdioMCPServer } from "./stdio-server.js";
import { logger } from "./logger.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MockMCPServer implements MCPServer {
  constructor(
    public name: string,
    private tools: Tool[] = [],
    private executeFn?: (toolName: string, args: unknown) => Promise<unknown>,
    private listToolsFn?: () => Promise<Tool[]>,
  ) {}

  async listTools(): Promise<Tool[]> {
    if (this.listToolsFn) {
      return this.listToolsFn();
    }
    return this.tools;
  }

  async execute(toolName: string, args: unknown): Promise<unknown> {
    if (this.executeFn) {
      return this.executeFn(toolName, args);
    }
    const tool = this.tools.find((t) => t.name === toolName);
    if (tool) {
      return tool.execute(args);
    }
    throw new Error(`Tool ${toolName} not found on server ${this.name}`);
  }
}

describe("MCP Production-Ready Module", () => {
  let registry: PluginRegistry;
  let discovery: ToolsDiscovery;
  let executor: ToolExecutor;
  let loggedItems: any[];
  let stderrSpy: any;

  beforeEach(() => {
    registry = new PluginRegistry();
    discovery = new ToolsDiscovery(registry);
    executor = new ToolExecutor(discovery);
    loggedItems = [];
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        try {
          loggedItems.push(JSON.parse(chunk.toString().trim()));
        } catch (e) {
          // Ignore non-JSON logs
        }
        return true;
      });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe("PluginRegistry", () => {
    it("should register a valid plugin", () => {
      const plugin = new MockMCPServer("server1");
      registry.registerPlugin(plugin);
      expect(registry.getPlugins()).toHaveLength(1);
      expect(registry.getPlugins()[0]).toBe(plugin);
    });

    it("should throw an error for empty plugin name", () => {
      const plugin = new MockMCPServer("");
      expect(() => registry.registerPlugin(plugin)).toThrow(
        "Plugin name required",
      );
    });

    it("should throw an error for duplicate plugin name", () => {
      const plugin1 = new MockMCPServer("server1");
      const plugin2 = new MockMCPServer("server1");
      registry.registerPlugin(plugin1);
      expect(() => registry.registerPlugin(plugin2)).toThrow(
        "server1 already registered",
      );
    });

    it("should unregister a plugin", () => {
      const plugin = new MockMCPServer("server1");
      registry.registerPlugin(plugin);
      registry.unregisterPlugin("server1");
      expect(registry.getPlugins()).toHaveLength(0);
    });

    it("should normalize duplicate plugin name checks with whitespace", () => {
      const plugin1 = new MockMCPServer("  server1  ");
      const plugin2 = new MockMCPServer("server1");
      registry.registerPlugin(plugin1);
      expect(() => registry.registerPlugin(plugin2)).toThrow(
        "server1 already registered",
      );
    });
  });

  describe("ToolsDiscovery Caching & Errors", () => {
    it("should discover tools from registered plugins", async () => {
      const mockTool: Tool = {
        name: "testTool",
        description: "test desc",
        inputSchema: {},
        execute: async () => "result",
      };
      const plugin = new MockMCPServer("server1", [mockTool]);
      registry.registerPlugin(plugin);

      const toolsMap = await discovery.discoverTools();
      expect(toolsMap.has("testTool")).toBe(true);
      expect(toolsMap.get("testTool")?.tool.name).toBe("testTool");
      expect(toolsMap.get("testTool")?.server).toBe(plugin);
    });

    it("should catch and log errors if multiple plugins register the same tool name", async () => {
      const mockTool1: Tool = {
        name: "duplicateTool",
        description: "d1",
        inputSchema: {},
        execute: async () => {},
      };
      const mockTool2: Tool = {
        name: "duplicateTool",
        description: "d2",
        inputSchema: {},
        execute: async () => {},
      };

      registry.registerPlugin(new MockMCPServer("server1", [mockTool1]));
      registry.registerPlugin(new MockMCPServer("server2", [mockTool2]));

      await expect(discovery.discoverTools()).rejects.toThrow(
        "already registered",
      );

      const errLog = loggedItems.find((log) => log.level === "error");
      expect(errLog).toBeDefined();
      expect(errLog.message).toContain("already registered");
      expect(errLog.tool_name).toBe("duplicateTool");
    });

    it("should cache discovery and not call listTools repeatedly unless forceRefresh is true", async () => {
      let listToolsCalls = 0;
      const plugin = new MockMCPServer("server1", [], undefined, async () => {
        listToolsCalls++;
        return [];
      });
      registry.registerPlugin(plugin);

      await discovery.discoverTools();
      await discovery.discoverTools();
      expect(listToolsCalls).toBe(1);

      await discovery.discoverTools(true);
      expect(listToolsCalls).toBe(2);
    });

    it("should handle error in one plugin discovery without crashing others", async () => {
      const badPlugin = new MockMCPServer(
        "serverBad",
        [],
        undefined,
        async () => {
          throw new Error("crashed listing tools");
        },
      );
      const goodTool: Tool = {
        name: "goodTool",
        description: "d",
        inputSchema: {},
        execute: async () => {},
      };
      const goodPlugin = new MockMCPServer("serverGood", [goodTool]);

      registry.registerPlugin(badPlugin);
      registry.registerPlugin(goodPlugin);

      const discovered = await discovery.discoverTools();
      expect(discovered.has("goodTool")).toBe(true);

      const warnLog = loggedItems.find((log) => log.level === "warn");
      expect(warnLog).toBeDefined();
      expect(warnLog.message).toContain(
        "Failed to discover tools from serverBad",
      );
    });

    it("should not poison discovery cache on a rejected promise", async () => {
      const mockTool1: Tool = {
        name: "dup",
        description: "d",
        inputSchema: {},
        execute: async () => {},
      };
      const mockTool2: Tool = {
        name: "dup",
        description: "d",
        inputSchema: {},
        execute: async () => {},
      };

      const plugin1 = new MockMCPServer("server1", [mockTool1]);
      const plugin2 = new MockMCPServer("server2", [mockTool2]);

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);

      // First discovery call fails due to conflict and rejects
      await expect(discovery.discoverTools()).rejects.toThrow(
        "already registered",
      );

      // Resolve the issue by unregistering the conflict server
      registry.unregisterPlugin("server2");

      // Second call should succeed because the rejected promise cache was cleared
      const result = await discovery.discoverTools();
      expect(result.has("dup")).toBe(true);
    });

    it("should not clear a newer discovery promise if a stale promise is rejected", async () => {
      const mockTool1: Tool = {
        name: "dup",
        description: "d",
        inputSchema: {},
        execute: async () => {},
      };
      const mockTool2: Tool = {
        name: "dup",
        description: "d",
        inputSchema: {},
        execute: async () => {},
      };

      const plugin1 = new MockMCPServer("server1", [mockTool1]);
      const plugin2 = new MockMCPServer("server2", [mockTool2]);

      registry.registerPlugin(plugin1);
      registry.registerPlugin(plugin2);

      // Start the first discovery call which will fail due to duplicate names
      const p1 = discovery.discoverTools();
      const p1_internal = (discovery as any).discoveryPromise;

      // Resolve the conflict by unregistering the second server
      registry.unregisterPlugin("server2");

      // Start a second discovery call with forceRefresh = true
      const p2 = discovery.discoverTools(true);
      const p2_internal = (discovery as any).discoveryPromise;

      // Wait for the first promise to reject
      await expect(p1).rejects.toThrow("already registered");

      // Verify that the cached promise is NOT null and is still the second internal promise
      const pAfter = (discovery as any).discoveryPromise;
      expect(pAfter).not.toBeNull();
      expect(pAfter).toBe(p2_internal);

      // Verify that p2 successfully resolves
      const resolved = await p2;
      expect(resolved.has("dup")).toBe(true);
    });
  });


  describe("ToolExecutor Execution & Safeness", () => {
    it("should execute a registered tool successfully (Happy Path)", async () => {
      const mockTool: Tool = {
        name: "mathAdd",
        description: "add two numbers",
        inputSchema: {},
        execute: async (args: any) => args.a + args.b,
      };
      registry.registerPlugin(new MockMCPServer("mathServer", [mockTool]));

      const result = await executor.execute(
        "mathAdd",
        { a: 2, b: 3 },
        { conversationId: "conv123" },
      );
      expect(result).toBe(5);

      const infoLog = loggedItems.find((log) => log.level === "info");
      expect(infoLog).toBeDefined();
      expect(infoLog.message).toBe("Tool executed successfully");
      expect(infoLog.tool_name).toBe("mathAdd");
      expect(infoLog.conversation_id).toBe("conv123");
      expect(infoLog.decision).toBe("ALLOW");
      expect(infoLog.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("should throw an error for empty tool name", async () => {
      await expect(executor.execute("", {})).rejects.toThrow(
        "Tool name cannot be empty",
      );

      const errLog = loggedItems.find((log) => log.level === "error");
      expect(errLog).toBeDefined();
      expect(errLog.tool_name).toBe("empty");
      expect(errLog.error_message).toBe("Tool name cannot be empty");
    });

    it("should throw if the tool is not found", async () => {
      await expect(executor.execute("missingTool", {})).rejects.toThrow(
        "Tool not found: missingTool",
      );

      const errLog = loggedItems.find((log) => log.level === "error");
      expect(errLog).toBeDefined();
      expect(errLog.tool_name).toBe("missingTool");
      expect(errLog.error_message).toBe("Tool not found: missingTool");
    });

    it("should reject with timeout if execution is too slow", async () => {
      const slowTool: Tool = {
        name: "slowTool",
        description: "slow",
        inputSchema: {},
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return "done";
        },
      };
      registry.registerPlugin(new MockMCPServer("slowServer", [slowTool]));

      await expect(
        executor.execute("slowTool", {}, { timeoutMs: 10 }),
      ).rejects.toThrow("Execution timed out after 10ms");

      const errLog = loggedItems.find((log) => log.level === "error");
      expect(errLog).toBeDefined();
      expect(errLog.tool_name).toBe("slowTool");
      expect(errLog.error_message).toBe("Execution timed out after 10ms");
    });

    it("should handle non-string toolName validation without throwing TypeError", async () => {
      await expect(executor.execute(123 as any, {})).rejects.toThrow(
        "must be a non-empty string",
      );
      await expect(executor.execute(null as any, {})).rejects.toThrow(
        "must be a non-empty string",
      );

      const errLog = loggedItems.find(
        (log) => log.level === "error" && log.tool_name === "invalid_type",
      );
      expect(errLog).toBeDefined();
    });
  });

  describe("StdioMCPServer listTools recovery", () => {
    it("should reset client transport state on listTools failure", async () => {
      const server = new StdioMCPServer("dead-server", "node", [
        "non-existent-script.js",
      ]);
      const closeSpy = vi.spyOn(server, "close");

      await expect(server.listTools()).rejects.toThrow();
      expect(closeSpy).toHaveBeenCalled();

      closeSpy.mockRestore();
    });
  });

  describe("StdioMCPServer Integration with file-manager-mcp", () => {
    it("should list tools and execute file-manager-mcp tools successfully", async () => {
      const projectRoot = path.resolve(__dirname, "../../..");
      const fmSource = path.join(
        projectRoot,
        "apps/file-manager-mcp/src/index.ts",
      );

      const server = new StdioMCPServer("file-manager-mcp-test", "npx", [
        "tsx",
        fmSource,
      ]);

      try {
        const tools = await server.listTools();
        expect(tools.length).toBeGreaterThan(0);

        const writeTool = tools.find((t) => t.name === "write_file");
        expect(writeTool).toBeDefined();
        expect(writeTool?.name).toBe("write_file");
      } finally {
        await server.close();
      }
    }, 30000); // 30s timeout for spawning npx tsx
  });

  describe("StdioMCPServer Integration with context7-mcp", () => {
    it("should list tools successfully from `@upstash/context7-mcp`", async () => {
      const server = new StdioMCPServer("context7-test", "npx", [
        "-y",
        "@upstash/context7-mcp",
      ]);

      try {
        const tools = await server.listTools();
        expect(tools.length).toBeGreaterThan(0);

        const resolveTool = tools.find((t) => t.name === "resolve-library-id");
        const queryDocsTool = tools.find((t) => t.name === "query-docs");

        expect(resolveTool).toBeDefined();
        expect(queryDocsTool).toBeDefined();
      } finally {
        await server.close();
      }
    }, 30000); // 30s timeout for downloading and starting context7
  });

  describe("Logger Metadata Protection", () => {
    it("should prevent overriding core properties via meta argument", () => {
      logger.info("Main message", { level: "hacked", message: "spoofed message", extra: "valid" });
      logger.warn("Main message", { level: "hacked", message: "spoofed message", extra: "valid" });
      logger.error("Main message", { level: "hacked", message: "spoofed message", extra: "valid" });

      const infoLogs = loggedItems.filter((log) => log.extra === "valid");
      expect(infoLogs.length).toBe(3);

      expect(infoLogs[0].level).toBe("info");
      expect(infoLogs[0].message).toBe("Main message");

      expect(infoLogs[1].level).toBe("warn");
      expect(infoLogs[1].message).toBe("Main message");

      expect(infoLogs[2].level).toBe("error");
      expect(infoLogs[2].message).toBe("Main message");
    });
  });
});

