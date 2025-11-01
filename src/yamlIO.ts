import { TFile, normalizePath, parseYaml, stringifyYaml, App, Vault } from "obsidian";

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
export async function ensureFile(vault: Vault, path: string, content: string): Promise<TFile> {
  const np = normalizePath(path);
  const dir = np.split("/").slice(0, -1).join("/");
  if (dir && !(await vault.adapter.exists(dir))) await vault.createFolder(dir);
  const exists = await vault.adapter.exists(np);
  if (exists) {
    const f = await vault.getAbstractFileByPath(np);
    if (f && f instanceof TFile) return f;
  }
  return await vault.create(np, content);
}
