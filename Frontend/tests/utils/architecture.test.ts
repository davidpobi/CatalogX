// @vitest-environment node
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const filesUnder = async (directory: string): Promise<string[]> => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async (entry) => entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();

describe("architecture boundaries", () => {
  it("does not retain the legacy server or repository layers", async () => {
    const root = join(process.cwd(), "src");
    const files = await filesUnder(root);
    await expect(access(join(root, "server"))).rejects.toThrow();
    expect(files.filter((file) => file.endsWith(".repository.ts"))).toEqual([]);
    const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
    expect(contents.some((content) => content.includes("@/server/"))).toBe(false);
  });

  it("keeps API implementation imports out of client components", async () => {
    const files = await filesUnder(join(process.cwd(), "src/components"));
    const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
    expect(contents.some((content) => /from ["']@\/app\/api\//.test(content))).toBe(false);
  });

  it("keeps direct fetch calls out of components", async () => {
    const files = await filesUnder(join(process.cwd(), "src/components"));
    const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
    expect(contents.some((content) => /\bfetch\s*\(/.test(content))).toBe(false);
  });

  it("keeps direct fetch calls out of page modules", async () => {
    const appFiles = await filesUnder(join(process.cwd(), "src/app"));
    const pageFiles = appFiles.filter((file) => file.endsWith("/page.tsx"));
    const contents = await Promise.all(pageFiles.map((file) => readFile(file, "utf8")));
    expect(contents.some((content) => /\bfetch\s*\(/.test(content))).toBe(false);
  });

  it("keeps provider SDKs out of components", async () => {
    const files = await filesUnder(join(process.cwd(), "src/components"));
    const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
    expect(contents.some((content) => /from ["'](?:openai|firebase-admin|replicate)/.test(content))).toBe(false);
  });

  it("keeps direct network calls out of Redux and hooks", async () => {
    const featureDirectories = ["src/redux/slices"];
    const files = (await Promise.all(featureDirectories.map((directory) => filesUnder(join(process.cwd(), directory))))).flat();
    files.push(join(process.cwd(), "src/redux/hooks.ts"));
    const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
    expect(contents.some((content) => /\bfetch\s*\(/.test(content))).toBe(false);
  });

  it("centralizes shared exported contracts in the interfaces layer", async () => {
    const root = join(process.cwd(), "src");
    const files = await filesUnder(root);
    const exceptions = new Set([join(root, "redux/store.ts"), join(root, "utils/catalogSchema.ts")]);
    const contractFiles = files.filter((file) => !file.startsWith(join(root, "interfaces")) && !exceptions.has(file));
    const contents = await Promise.all(contractFiles.map(async (file) => ({ file, content: await readFile(file, "utf8") })));
    expect(contents.filter(({ content }) => /export\s+(?:interface|type|enum)\s+[A-Z]/.test(content)).map(({ file }) => file)).toEqual([]);
  });
});
