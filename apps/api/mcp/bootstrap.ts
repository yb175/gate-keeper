import { PluginRegistry } from "./registry.js";
import { ToolsDiscovery } from "./discovery.js";
import { ToolExecutor } from "./execute.js";
import { fileURLToPath } from "url";
import { fileManagerPlugin } from "./plugins/filemanager/manifest.js";
import { context7Plugin } from "./plugins/context7/manifest.js";
import { puppeteerPlugin } from "./plugins/puppeteer/manifest.js";

export const mcpRegistry = new PluginRegistry();

// Register plugins from modular layout manifests
mcpRegistry.registerPlugin(fileManagerPlugin);
mcpRegistry.registerPlugin(context7Plugin);
mcpRegistry.registerPlugin(puppeteerPlugin);

export const mcpDiscovery = new ToolsDiscovery(mcpRegistry);
export const mcpExecutor = new ToolExecutor(mcpDiscovery);
