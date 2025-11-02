import {
  App,
  TFile,
  TFolder,
  Vault,
  normalizePath,
  parseYaml,
  stringifyYaml,
} from "obsidian";

/** Read front-matter block from a file's raw content. */
export function readFrontMatter(content: string): any {
  const fm = /^---\n([\s\S]*?)\n---/m.exec(content);
  if (!fm) return null;
  try { return parseYaml(fm[1]); } catch { return null; }
}

/** Replace or insert front-matter block. */
export function writeFrontMatter(content: string, obj: any): string {
  const yaml = stringifyYaml(obj).trim();
  const fm = /^---\n([\s\S]*?)\n---/m;
  if (fm.test(content)) {
    return content.replace(fm, `---\n${yaml}\n---`);
  } else {
    return `---\n${yaml}\n---\n` + content;
  }
}

export async function updateFileFrontMatter(app: App, file: TFile, updater: (fm: any) => void | any): Promise<void> {
  const data = await app.vault.read(file);
  const fm = readFrontMatter(data) ?? {};
  const next = updater(fm) ?? fm;
  const updated = writeFrontMatter(data, next);
  await app.vault.modify(file, updated);
}

/** Create a note from a path and content, making folders as needed. */
async function ensureFolder(vault: Vault, dir: string): Promise<void> {
  const normalised = normalizePath(dir);
  if (!normalised.length) return;
  const parts = normalised.split("/");
  let current = "";
  for (const part of parts) {
    if (!part) continue;
    current = current ? `${current}/${part}` : part;
    const existing = vault.getAbstractFileByPath(current);
    if (!existing) {
      await vault.createFolder(current);
      continue;
    }
    if (existing instanceof TFile) {
      throw new Error(`Cannot create folder '${dir}': '${current}' is a file.`);
    }
  }
}

export async function ensureFile(vault: Vault, path: string, content: string): Promise<TFile> {
  const np = normalizePath(path);
  const dir = np.split("/").slice(0, -1).join("/");
  if (dir) await ensureFolder(vault, dir);
  const existing = vault.getAbstractFileByPath(np);
  if (existing instanceof TFile) {
    return existing;
  }
  if (existing instanceof TFolder) {
    throw new Error(`Cannot create file '${np}': a folder already exists at this path.`);
  }
  return await vault.create(np, content);
}
