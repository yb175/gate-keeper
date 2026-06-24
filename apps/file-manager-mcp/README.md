# File Manager MCP Server

This is a custom, production-grade Model Context Protocol (MCP) server written in TypeScript. It exposes safe filesystem tools to allow LLMs to read, write, move, list, and delete files inside a secure local sandbox.

---

## Architecture Diagram

The server communicates via standard I/O (stdio) using JSON-RPC. Every file operation undergoes strict path resolution and validation before touching the disk.

```mermaid
graph TD
    subgraph Client Space
        Client[MCP Client / Inspector]
    end

    subgraph MCP Server (file-manager-mcp)
        Server[server.ts<br/>MCP Server]
        Registry[registry.ts<br/>Tool Registry]
        
        subgraph Tools
            RF[readFile.ts]
            WF[writeFile.ts]
            DF[deleteFile.ts]
            MF[moveFile.ts]
            LF[listFiles.ts]
        end
        
        Sandbox[utils/sandbox.ts<br/>validatePath]
    end

    subgraph Storage
        Disk[Local Directory<br/>./sandbox]
    end

    Client -->|JSON-RPC over Stdio| Server
    Server -->|Looks up tool| Registry
    Registry -->|Resolves to| Tools
    Tools -->|Validates path| Sandbox
    Sandbox -->|Restricted Access| Disk
```

---

## Project Structure

The project separates tools into modular, single-responsibility files and dynamically registers them to avoid complex switch statements:

```text
apps/file-manager-mcp/
├── src/
│   ├── tools/
│   │   ├── readFile.ts     # read_file tool implementation
│   │   ├── writeFile.ts    # write_file tool implementation
│   │   ├── deleteFile.ts   # delete_file tool implementation
│   │   ├── moveFile.ts     # move_file tool implementation
│   │   └── listFiles.ts    # list_files tool implementation
│   ├── utils/
│   │   └── sandbox.ts      # Path validation utility
│   ├── types.ts            # Core Tool interface definitions
│   ├── registry.ts         # Centralized list of tools
│   ├── server.ts           # MCP Server registration & request dispatching
│   ├── index.ts            # Entrypoint connecting stdio transport
│   └── file-manager.test.ts # Vitest test suite
├── sandbox/                # Target folder for filesystem operations
├── package.json
└── tsconfig.json
```

---

## Security & Sandboxing

All operations are sandboxed inside the `./sandbox` folder.

The `validatePath(filepath: string): string` utility in `src/utils/sandbox.ts`:
1. Strips any optional `"sandbox/"` or `"sandbox\"` prefix from inputs.
2. Resolves the full path relative to the absolute path of `./sandbox`.
3. Verifies that the resolved path does not escape the sandbox root (using `path.relative` to check for `..` or absolute paths).
4. Throws an error immediately if the path escapes (e.g. `../../etc/passwd` or `/etc/passwd`).

---

## Exposed Tools

### 1. `read_file`
Reads the raw text content of a file.
- **Input Schema**:
  ```json
  {
    "path": "sandbox/test.txt"
  }
  ```
- **Returns**: File text content.

### 2. `write_file`
Creates or overwrites a file with content (automatically creates missing subdirectories).
- **Input Schema**:
  ```json
  {
    "path": "sandbox/test.txt",
    "content": "hello"
  }
  ```
- **Returns**: `"File written successfully"`

### 3. `delete_file`
Deletes a file.
- **Input Schema**:
  ```json
  {
    "path": "sandbox/test.txt"
  }
  ```
- **Returns**: `"File deleted successfully"`

### 4. `move_file`
Moves or renames a file.
- **Input Schema**:
  ```json
  {
    "source": "sandbox/a.txt",
    "destination": "sandbox/b.txt"
  }
  ```
- **Returns**: `"File moved successfully"`

### 5. `list_files`
Lists all files recursively under the sandbox root, returning paths relative to the sandbox.
- **Input Schema**: `{}`
- **Returns**: `["a.txt", "sub/b.txt"]`

---

## How to Test

We use [Vitest](https://vitest.dev/) for unit and integration testing.

To run the test suite, run the following command in `apps/file-manager-mcp/`:
```bash
npm run test
```

This verifies that:
- Operations correctly read, write, list, move, and delete files inside the sandbox.
- Path traversal escapes are blocked.

---

## How to Run the Inspector

The MCP Inspector is an interactive web-based interface for debugging.

To run the server inside the inspector, execute:
```bash
npm run inspector
```

This starts the proxy and automatically prints a local URL (usually `http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=...`). Open that URL in your browser to test calling individual tools interactively.
