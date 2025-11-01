import { TFile, Vault, normalizePath } from "obsidian";
import type { Plant, Bed } from "./types";
import { readFrontMatter } from "./yamlIO";

export interface Index {
  plants: Record<string, { file: string; data: Plant }>;
  beds: Record<string, { file: string; data: Bed }>;
}

export class PlantIndex {
  constructor(private vault: Vault, private folders: { plants: string; beds: string }) {}
  async build(): Promise<Index> {
    const idx: Index = { plants: {}, beds: {} };
    const add = async (base: string, kind: "plant" | "bed") => {
      const folder = normalizePath(base);
      // Traverse vault
      const files: TFile[] = [];
      // @ts-ignore: adapter has list
      const list = await this.vault.adapter.list(folder).catch(() => ({ files: [], folders: [] }));
      const walk = async (dir: string) => {
        // @ts-ignore
        const listing = await this.vault.adapter.list(dir).catch(() => ({ files: [], folders: [] }));
        for (const f of listing.files) {
          if (f.endsWith(".md")) {
            const af = this.vault.getAbstractFileByPath(f);
            if (af instanceof TFile) files.push(af);
          }
        }
        for (const sub of listing.folders) await walk(sub);
      };
      await walk(folder);
      for (const f of files) {
        const raw = await this.vault.read(f);
        const fm = readFrontMatter(raw);
        if (!fm || fm.type !== kind) continue;
        if (kind === "plant") idx.plants[fm.id] = { file: f.path, data: fm as Plant };
        if (kind === "bed") idx.beds[fm.id] = { file: f.path, data: fm as Bed };
      }
    };
    await add(this.folders.plants, "plant");
    await add(this.folders.beds, "bed");
    return idx;
  }
}
