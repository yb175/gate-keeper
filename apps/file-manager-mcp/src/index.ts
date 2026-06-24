import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs/promises";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

// Allowed directory defaults to current working directory
const ALLOWED_DIR = path.resolve(process.env.ALLOWED_DIR || process.cwd());

const server = new Server(
  {
    name: "file-manager-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper to check if a path is within the allowed directory
function safePath(targetPath: string): string {
  const resolved = path.resolve(ALLOWED_DIR, targetPath);
  if (!resolved.startsWith(ALLOWED_DIR)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Access denied: path '${targetPath}' is outside the allowed directory '${ALLOWED_DIR}'`
    );
  }
  return resolved;
}

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_directory",
        description: "List the contents of a directory in the allowed space",
        inputSchema: {
          type: "object",
          properties: {
            dirPath: {
              type: "string",
              description: "The directory path relative to the allowed root (empty for root)",
            },
          },
        },
      },
      {
        name: "read_file",
        description: "Read the contents of a file in the allowed space",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The file path relative to the allowed root",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "write_file",
        description: "Create or overwrite a file in the allowed space with content",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The file path relative to the allowed root",
            },
            content: {
              type: "string",
              description: "The string content to write to the file",
            },
          },
          required: ["filePath", "content"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_directory": {
        const inputPath = (args?.dirPath as string) || ".";
        const targetDir = safePath(inputPath);
        const entries = await fs.readdir(targetDir, { withFileTypes: true });

        const formatted = entries.map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formatted, null, 2),
            },
          ],
        };
      }

      case "read_file": {
        const inputPath = args?.filePath as string;
        if (!inputPath) {
          throw new McpError(ErrorCode.InvalidParams, "filePath is required");
        }
        const targetFile = safePath(inputPath);
        const data = await fs.readFile(targetFile, "utf-8");

        return {
          content: [
            {
              type: "text",
              text: data,
            },
          ],
        };
      }

      case "write_file": {
        const inputPath = args?.filePath as string;
        const content = args?.content as string;
        if (!inputPath || content === undefined) {
          throw new McpError(ErrorCode.InvalidParams, "filePath and content are required");
        }
        const targetFile = safePath(inputPath);

        // Ensure parent directory exists
        await fs.mkdir(path.dirname(targetFile), { recursive: true });
        await fs.writeFile(targetFile, content, "utf-8");

        return {
          content: [
            {
              type: "text",
              text: `File written successfully to ${inputPath}`,
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    const err = error as Error;
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: err.message || String(error),
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`File Manager MCP server running on allowed directory: ${ALLOWED_DIR}`);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
