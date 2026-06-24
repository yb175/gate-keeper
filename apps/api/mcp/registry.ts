import type { MCPServer } from "../types.js";

export class PluginRegistry {
  private plugins: MCPServer[] = [];

  registerPlugin(plugin: MCPServer): void {
    if (!plugin.name.trim()) {
      throw new Error("Plugin name required");
    }
    if (this.plugins.some((p) => p.name === plugin.name)) {
      throw new Error(`${plugin.name} already registered`);
    }

    this.plugins.push(plugin);
  }

  unregisterPlugin(name: string): void {
    this.plugins = this.plugins.filter((p) => p.name !== name);
  }

  getPlugins(): MCPServer[] {
    return [...this.plugins];
  }
}
