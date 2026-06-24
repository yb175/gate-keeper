# Gatekeeper MCP Client Gateway

This module serves as the core Model Context Protocol (MCP) gateway for the Gatekeeper API server. It is responsible for dynamically loading MCP servers, caching their tool definitions, routing execution calls, enforcing safety guards, and logging telemetry.

---

## High-Level Architecture

The gateway is built on a decoupled, layered architecture to keep components clean, focused, and easy to maintain:

```
                  ┌──────────────────────┐
                  │  Express API Router  │
                  └──────────┬───────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │  mcpExecutor / mcpDiscovery  │
              └──────────────┬───────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │    PluginRegistry    │
                  └──────────┬───────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   ┌────────────────────┐        ┌────────────────────┐
   │ StdioMCPServer (FM)│        │ StdioMCPServer (C7)│
   └──────────┬─────────┘        └──────────┬─────────┘
              │                             │
              ▼                             ▼
    [Local file-manager]           [Remote context7]
```

### Component Breakdown

- **[registry.ts](./registry.ts)**: A simple in-memory repository for plugins. It holds the active list of registered client adapters.
- **[discovery.ts](./discovery.ts)**: Orchestrates the consolidation of tools across all registered plugins. It caches the discovery promise to prevent cache stampedes and handles conflicts.
- **[execute.ts](./execute.ts)**: Handles tool execution requests. It is the gatekeeper that validates inputs, applies timeout limits, and records metrics.
- **[stdio-server.ts](./stdio-server.ts)**: A generic wrapper class implementing `MCPServer`. It encapsulates standard stdin/stdout JSON-RPC process communication via the `@modelcontextprotocol/sdk`.
- **[logger.ts](./logger.ts)**: Structured JSON logger. Outputs exclusively to `process.stderr` to prevent polluting the standard output channel (which would corrupt stdio-based communications).
- **[bootstrap.ts](./bootstrap.ts)**: Initializes the registry and registers the configured plugins during server startup.

---

## Modular Plugins Directory Structure

To keep configuration decoupled, each plugin has its own directory containing a `manifest.ts` file describing its startup commands and configurations:

```
plugins/
├── context7/
│   └── manifest.ts      # Runs Upstash context7 docs client via npx
└── filemanager/
    └── manifest.ts      # Locates file-manager-mcp and resolves node/npx tsx
```

- **`filemanager/manifest.ts`**: Locates the local `file-manager-mcp` workspace. It runs the compiled JS code if built, or dynamically falls back to `npx tsx` in development.
- **`context7/manifest.ts`**: Registers the `@upstash/context7-mcp` server using `npx -y` to search and fetch live documentation.

---

## Edge Cases Handled

Here is a list of the edge cases and failure modes we designed the gateway to handle:

### 1. External Plugin Failures & Isolation

- **Scenario**: An external MCP server crashes or fails to connect during startup or discovery.
- **Handling**: `ToolsDiscovery` catches the failure, logs a structured warning to stderr, and continues to discover tools from the remaining functional plugins. A single faulty plugin won't take down the entire API gateway.

### 2. Execution Timeouts

- **Scenario**: A plugin hangs indefinitely (e.g. `context7` gets stuck querying a slow external documentation site).
- **Handling**: `ToolExecutor` wraps all executions in a `Promise.race` against a 10-second timer. If the execution exceeds this limit, the request is rejected with a timeout error, and the timer is cleared to prevent memory leaks.

### 3. Subprocess Crash & Automatic Recovery

- **Scenario**: A spawned plugin process exits or crashes mid-call.
- **Handling**: `StdioMCPServer` catches connection/stream failures, cleans up the process resources, and clears its connection cache. The very next execution call will spawn a fresh child process automatically.

### 4. Concurrent Connection Stampede Prevention

- **Scenario**: Multiple execute calls hit a plugin simultaneously before it has completed its initial handshake.
- **Handling**: `StdioMCPServer` caches the connection process promise. Parallel execution calls wait for the same connection handshake to resolve rather than spawning duplicate, competing child processes.

### 5. Cache Stampede in Discovery

- **Scenario**: Multiple users or LLM agents query `GET /mcp/tools` at the exact same time when the server starts.
- **Handling**: `ToolsDiscovery` caches the actual promise of the discovery list. Only one consolidated query is dispatched to the child processes, and all callers wait for the same resolved map.

### 6. Conflict Prevention

- **Scenario**: Two different plugins register a tool with the same name.
- **Handling**: `ToolsDiscovery` detects the collision, logs a structured error, and aborts the discovery process, preventing ambiguous execution states.

### 7. Input Guardrails

- **Scenario**: The LLM sends an empty or whitespace-only tool name.
- **Handling**: `ToolExecutor` immediately rejects the call, logging a validation error to stderr.

### 8. Stdio Stream Protection

- **Scenario**: Normal telemetry or debug logs write to `stdout`, corrupting stdio transport channels.
- **Handling**: The `logger` is restricted to writing JSON-line strings strictly to `process.stderr`.

---

## Running the Tests

To run the test suite (which includes unit tests for all components and a real integration test spawning the `file-manager-mcp` server over stdio):

### From the `apps/api/` Directory

```bash
npm run test
```

### From the Project Root Directory

```bash
npm run test -w api
```
