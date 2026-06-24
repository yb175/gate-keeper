import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { StdioMCPServer } from "../../stdio-server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve project root dynamically by searching upwards for turbo.json
const findProjectRoot = (startDir: string): string => {
  let current = startDir;
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, "turbo.json"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(startDir, "../../../../../..");
};

const projectRoot = findProjectRoot(__dirname);
const fmSource = path.join(projectRoot, "apps/file-manager-mcp/src/index.ts");
const fmDist = path.join(projectRoot, "apps/file-manager-mcp/dist/index.js");

let fileManagerCommand = "node";
let fileManagerArgs = [fmDist];

// Fallback to npx tsx in development if dist folder is not compiled yet
if (!fs.existsSync(fmDist) && fs.existsSync(fmSource)) {
  fileManagerCommand = "npx";
  fileManagerArgs = ["tsx", fmSource];
}

export const fileManagerPlugin = new StdioMCPServer(
  "file-manager-mcp",
  fileManagerCommand,
  fileManagerArgs,
);
