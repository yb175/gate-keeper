import { readFile } from "./tools/readFile.js";
import { writeFile } from "./tools/writeFile.js";
import { deleteFile } from "./tools/deleteFile.js";
import { moveFile } from "./tools/moveFile.js";
import { listFiles } from "./tools/listFiles.js";

export const tools = [readFile, writeFile, deleteFile, moveFile, listFiles];
