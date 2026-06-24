import { PluginRegistry } from "./registry.js";
import { ToolsDiscovery } from "./discovery.js";
import { ToolExecutor } from "./execute.js";
import { fileManagerPlugin } from "./plugins/filemanager/manifest.js";
import { context7Plugin } from "./plugins/context7/manifest.js";

export const mcpRegistry = new PluginRegistry();

// Register plugins from modular layout manifests
mcpRegistry.registerPlugin(fileManagerPlugin);
mcpRegistry.registerPlugin(context7Plugin);

export const mcpDiscovery = new ToolsDiscovery(mcpRegistry);
export const mcpExecutor = new ToolExecutor(mcpDiscovery);
