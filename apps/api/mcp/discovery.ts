import { MCPServer, Tool } from "../types.js";
import { PluginRegistry } from "./registry.js";
import { logger } from "./logger.js";

type DiscoveredTool = {
  server: MCPServer;
  tool: Tool;
};

export class ToolsDiscovery {
  private discoveryPromise: Promise<Map<string, DiscoveredTool>> | null = null;

  constructor(private registry: PluginRegistry) {}

  async discoverTools(
    forceRefresh = false,
  ): Promise<Map<string, DiscoveredTool>> {
    if (forceRefresh || !this.discoveryPromise) {
      const promise = this.performDiscovery().catch((error) => {
        if (this.discoveryPromise === promise) {
          this.discoveryPromise = null;
        }
        throw error;
      });
      this.discoveryPromise = promise;
    }
    return this.discoveryPromise;
  }

  private async performDiscovery(): Promise<Map<string, DiscoveredTool>> {
    const discovered = new Map<string, DiscoveredTool>();
    const plugins = this.registry.getPlugins();

    for (const plugin of plugins) {
      let tools: Tool[] = [];
      try {
        tools = await plugin.listTools();
      } catch (error: any) {
        logger.warn(`Failed to discover tools from ${plugin.name}`, {
          error_message: error?.message || String(error),
        });
        continue;
      }

      for (const tool of tools) {
        if (!tool?.name?.trim()) {
          continue;
        }

        const existing = discovered.get(tool.name);
        if (existing) {
          const errorMsg = `Tool ${tool.name} already registered by ${existing.server.name}`;
          logger.error(errorMsg, {
            tool_name: tool.name,
            error_message: errorMsg,
          });
          throw new Error(errorMsg);
        }

        discovered.set(tool.name, {
          server: plugin,
          tool,
        });
      }
    }

    return discovered;
  }
}
