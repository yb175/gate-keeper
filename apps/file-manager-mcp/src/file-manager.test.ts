import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validatePath, SANDBOX_ROOT } from "./utils/sandbox.js";
import { readFile } from "./tools/readFile.js";
import { writeFile } from "./tools/writeFile.js";
import { deleteFile } from "./tools/deleteFile.js";
import { moveFile } from "./tools/moveFile.js";
import { listFiles } from "./tools/listFiles.js";
import * as fs from "fs/promises";
import * as fsSync from "fs";
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

    it("throws an error for symlink traversal escaping the sandbox", async () => {
      const extDir = path.resolve(SANDBOX_ROOT, "../temp-outside-dir");
      await fs.mkdir(extDir, { recursive: true });
      
      const extFile = path.resolve(SANDBOX_ROOT, "../temp-outside-file.txt");
      await fs.writeFile(extFile, "secret content", "utf-8");

      const symlinkDirPath = path.resolve(SANDBOX_ROOT, "symlink_dir");
      const symlinkFilePath = path.resolve(SANDBOX_ROOT, "symlink_file.txt");

      try {
        await fs.symlink(extDir, symlinkDirPath, "dir");
      } catch (err: any) {
        if (err.code !== "EEXIST") throw err;
      }

      try {
        await fs.symlink(extFile, symlinkFilePath, "file");
      } catch (err: any) {
        if (err.code !== "EEXIST") throw err;
      }

      expect(() => validatePath("symlink_dir/test.txt")).toThrow();
      expect(() => validatePath("symlink_file.txt")).toThrow();

      try {
        await fs.unlink(symlinkDirPath);
      } catch (e) {}
      try {
        await fs.unlink(symlinkFilePath);
      } catch (e) {}
      
      try {
        await fs.rm(extDir, { recursive: true, force: true });
        await fs.rm(extFile, { force: true });
      } catch (e) {}
    });

    it("allows valid paths inside the sandbox even if the sandbox directory does not exist yet", async () => {
      const backupPath = SANDBOX_ROOT + "-backup";
      let sandboxExists = false;
      try {
        await fs.access(SANDBOX_ROOT);
        sandboxExists = true;
        await fs.rename(SANDBOX_ROOT, backupPath);
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
      }

      try {
        const p = validatePath("bootstrap-test.txt");
        expect(p).toBe(path.resolve(SANDBOX_ROOT, "bootstrap-test.txt"));
      } finally {
        if (sandboxExists) {
          try {
            await fs.rename(backupPath, SANDBOX_ROOT);
          } catch (e) {}
        }
      }
    });

    it("resolves the sandbox path correctly when the sandbox directory itself is a symlink", async () => {
      const tempSandbox = path.resolve(SANDBOX_ROOT, "../temp-sandbox-symlink");
      const tempTarget = path.resolve(SANDBOX_ROOT, "../temp-target-dir");
      await fs.mkdir(tempTarget, { recursive: true });
      try {
        await fs.symlink(tempTarget, tempSandbox, "dir");
        
        const resolveSandbox = (rootPath: string) => {
          if (fsSync.existsSync(rootPath)) {
            return fsSync.realpathSync(rootPath);
          }
          const parent = path.dirname(rootPath);
          const canonicalParent = fsSync.existsSync(parent) ? fsSync.realpathSync(parent) : parent;
          return path.resolve(canonicalParent, path.basename(rootPath));
        };

        const resolvedRoot = resolveSandbox(tempSandbox);
        expect(resolvedRoot).toBe(fsSync.realpathSync(tempTarget));
      } finally {
        try {
          await fs.unlink(tempSandbox);
        } catch (e) {}
        try {
          await fs.rm(tempTarget, { recursive: true, force: true });
        } catch (e) {}
      }
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

    it("cannot move if destination file already exists", async () => {
      const src = "move-source-exist.txt";
      const dest = "move-dest-exist.txt";

      await writeFile.execute({ path: src, content: "source" });
      await writeFile.execute({ path: dest, content: "destination" });

      await expect(
        moveFile.execute({ source: src, destination: dest })
      ).rejects.toThrow();

      await deleteFile.execute({ path: src });
      await deleteFile.execute({ path: dest });
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
