import type { MCPServer } from "../types.js";

export class PluginRegistry {
  private plugins: MCPServer[] = [];

  registerPlugin(plugin: MCPServer): void {
    const trimmedName = plugin.name.trim();
    if (!trimmedName) {
      throw new Error("Plugin name required");
    }
    if (this.plugins.some((p) => p.name.trim() === trimmedName)) {
      throw new Error(`${trimmedName} already registered`);
    }

    this.plugins.push(plugin);
  }

  unregisterPlugin(name: string): void {
    const trimmedName = name.trim();
    this.plugins = this.plugins.filter((p) => p.name.trim() !== trimmedName);
  }

  getPlugins(): MCPServer[] {
    return [...this.plugins];
  }
}
