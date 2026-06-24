import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validatePath, SANDBOX_ROOT } from "./utils/sandbox.js";
import { readFile } from "./tools/readFile.js";
import { writeFile } from "./tools/writeFile.js";
import { deleteFile } from "./tools/deleteFile.js";
import { moveFile } from "./tools/moveFile.js";
import { listFiles } from "./tools/listFiles.js";
import * as fs from "fs/promises";
import * as path from "path";

describe("FileManager MCP Server Tools", () => {
  beforeAll(async () => {
    await fs.mkdir(SANDBOX_ROOT, { recursive: true });
  });

  afterAll(async () => {
    try {
      const files = await fs.readdir(SANDBOX_ROOT);
      for (const file of files) {
        await fs.rm(path.join(SANDBOX_ROOT, file), { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore
    }
  });

  describe("Sandboxing (validatePath)", () => {
    it("allows paths inside the sandbox", () => {
      const p = validatePath("test.txt");
      expect(p).toBe(path.resolve(SANDBOX_ROOT, "test.txt"));

      const p2 = validatePath("sandbox/test.txt");
      expect(p2).toBe(path.resolve(SANDBOX_ROOT, "test.txt"));

      const p3 = validatePath("sub/dir/test.txt");
      expect(p3).toBe(path.resolve(SANDBOX_ROOT, "sub/dir/test.txt"));
    });

    it("throws an error for paths escaping the sandbox", () => {
      expect(() => validatePath("../../etc/passwd")).toThrow();
      expect(() => validatePath("/etc/passwd")).toThrow();
      expect(() => validatePath("sandbox/../../etc/passwd")).toThrow();
      expect(() => validatePath("../test.txt")).toThrow();
    });
  });

  describe("write_file and read_file", () => {
    it("writes and reads a file successfully", async () => {
      const filename = "test-write-read.txt";
      const content = "Hello, Vitest!";

      const writeResult = await writeFile.execute({ path: filename, content });
      expect(writeResult).toBe("File written successfully");

      const diskContent = await fs.readFile(path.join(SANDBOX_ROOT, filename), "utf-8");
      expect(diskContent).toBe(content);

      const readResult = await readFile.execute({ path: filename });
      expect(readResult).toBe(content);
    });

    it("cannot write outside sandbox", async () => {
      await expect(
        writeFile.execute({ path: "../../escape.txt", content: "evil" })
      ).rejects.toThrow();
    });

    it("cannot read outside sandbox", async () => {
      await expect(
        readFile.execute({ path: "../../escape.txt" })
      ).rejects.toThrow();
    });
  });

  describe("list_files", () => {
    it("lists all files in the sandbox", async () => {
      const existingFiles = await fs.readdir(SANDBOX_ROOT);
      for (const f of existingFiles) {
        await fs.rm(path.join(SANDBOX_ROOT, f), { recursive: true, force: true });
      }

      await writeFile.execute({ path: "file1.txt", content: "1" });
      await writeFile.execute({ path: "dir/file2.txt", content: "2" });

      const files = await listFiles.execute({});
      expect(files).toEqual(["dir/file2.txt", "file1.txt"]);
    });
  });

  describe("move_file", () => {
    it("moves a file to a new location within the sandbox", async () => {
      const src = "move-source.txt";
      const dest = "move-dest.txt";
      const content = "move-content";

      await writeFile.execute({ path: src, content });

      const moveResult = await moveFile.execute({ source: src, destination: dest });
      expect(moveResult).toBe("File moved successfully");

      await expect(fs.access(path.join(SANDBOX_ROOT, src))).rejects.toThrow();
      const destContent = await readFile.execute({ path: dest });
      expect(destContent).toBe(content);
    });

    it("cannot move source from outside sandbox", async () => {
      await expect(
        moveFile.execute({ source: "../../outside.txt", destination: "inside.txt" })
      ).rejects.toThrow();
    });

    it("cannot move dest to outside sandbox", async () => {
      await expect(
        moveFile.execute({ source: "inside.txt", destination: "../../outside.txt" })
      ).rejects.toThrow();
    });
  });

  describe("delete_file", () => {
    it("deletes a file successfully", async () => {
      const filename = "test-delete.txt";
      await writeFile.execute({ path: filename, content: "to delete" });

      const deleteResult = await deleteFile.execute({ path: filename });
      expect(deleteResult).toBe("File deleted successfully");

      await expect(fs.access(path.join(SANDBOX_ROOT, filename))).rejects.toThrow();
    });

    it("cannot delete outside sandbox", async () => {
      await expect(
        deleteFile.execute({ path: "../../escape.txt" })
      ).rejects.toThrow();
    });
  });
});
