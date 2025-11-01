import { App, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import type { PluginSettings, Plant } from "./types";
import { PlantIndex } from "./indexer";
import { ensureFile, readFrontMatter, updateFileFrontMatter } from "./yamlIO";
import { todayYMD, addDays } from "./utils/dates";
import { computeWaterDue } from "./logic/watering";
import { VIEW_TODAY, VIEW_TODAY_NAME } from "./constants";

export default class HouseplantGardenPlugin extends Plugin {
  settings: PluginSettings;
  index?: PlantIndex;

  async onload() {
    await this.loadSettings();

    this.index = new PlantIndex(this.app.vault, this.settings.folders);

    this.addCommand({
      id: "pgm-new-plant",
      name: "Plant: New plant",
      callback: async () => { await this.createPlant(); }
    });

    this.addCommand({
      id: "pgm-log-water",
      name: "Plant: Log water",
      checkCallback: (checking) => this.logActionGuard(checking, "water"),
    });

    this.addCommand({
      id: "pgm-log-feed",
      name: "Plant: Log feed",
      checkCallback: (checking) => this.logActionGuard(checking, "fertilise"),
    });

    this.addCommand({
      id: "pgm-snooze-task",
      name: "Plant: Snooze task",
      callback: async () => { await this.snoozeActivePlant(); }
    });

    this.addSettingTab(new SettingsTab(this.app, this));

    this.registerView(VIEW_TODAY, (leaf) => new TodayView(leaf, this));
    this.addRibbonIcon("leaf", "Open Today view", () => this.activateTodayView());

    await this.activateTodayView();
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() { await this.saveData(this.settings); }

  /** Create a new plant note from template. */
  async createPlant() {
    const common = await this.app.prompt("Common name?");
    if (!common) return;
    const id = `hp-${common.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const content = `---
id: ${id}
type: plant
common: ${common}
acquired: ${todayYMD()}
location: 
light: bright-indirect
env: {}
pot:
  diameter_mm: 120
  volume_l: 1
  medium: peat-free_multipurpose+perlite
growth_phase: auto
seasonal_overrides:
  - months: [11,12,1,2]
    water_factor: 0.6
    fertilise: pause
care:
  water:
    check: combo
    target_rule: pot_10pct_or_runoff
    interval_days_hint: 7
  fertilise:
    during: active_only
    cadence: monthly
status: active
---
# ${common}

`;
    const path = `${this.settings.folders.plants}/${common}.md`;
    const file = await ensureFile(this.app.vault, path, content);
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  /** Guarded log action for plant in active editor. */
  logActionGuard(checking: boolean, action: "water" | "fertilise") {
    const file = this.app.workspace.getActiveFile();
    if (!file) return false;
    if (checking) return true;
    this.logActionForFile(file, action);
    return true;
  }

  async logActionForFile(file: TFile, action: "water" | "fertilise") {
    const raw = await this.app.vault.read(file);
    const fm = readFrontMatter(raw);
    if (!fm || fm.type !== "plant") { new Notice("Not a plant note."); return; }

    if (action === "fertilise") {
      const month = new Date().getMonth() + 1;
      const winter = this.settings.winter_months_uk.includes(month);
      if (fm.drought_stressed) { new Notice("Blocked: plant is drought-stressed."); return; }
      if (this.settings.fertiliser_policy === "active-only" && winter) {
        new Notice("Suppressed in winter. Override by editing note.");
        return;
      }
    }

    // Update last date
    await updateFileFrontMatter(this.app, file, (obj: any) => {
      obj.care = obj.care || {};
      obj.care[action] = obj.care[action] || {};
      obj.care[action].last = todayYMD();
      return obj;
    });

    // Write task entry
    const taskName = `${todayYMD()}_${fm.id}_${action}.md`;
    const taskContent = `---
type: plant-task
plant_id: ${fm.id}
action: ${action}
performed: ${new Date().toISOString()}
---
`;
    await ensureFile(this.app.vault, `${this.settings.folders.tasks}/${taskName}`, taskContent);
    new Notice(`Logged ${action}.`);
  }

  async snoozeActivePlant() {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice("Open a plant note first."); return; }
    const daysStr = await this.app.prompt("Snooze by days?", "2");
    const n = Number(daysStr || "0");
    if (!n) return;
    await updateFileFrontMatter(this.app, file, (obj: any) => {
      const last = obj?.care?.water?.last;
      const hint = obj?.care?.water?.interval_days_hint ?? 7;
      const today = todayYMD();
      const next = last || today;
      // Move 'last' forward so that next due shifts by n days
      obj.care.water.last = addDays(next, n - hint);
      return obj;
    });
    new Notice("Snoozed.");
  }

  async activateTodayView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TODAY);
    if (leaves.length) {
      await this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({ type: VIEW_TODAY, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
}

class TodayView extends (WorkspaceLeaf as any).view.constructor {
  plugin: HouseplantGardenPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: HouseplantGardenPlugin) {
    // @ts-ignore
    super(leaf);
    this.plugin = plugin;
    // @ts-ignore
    this.icon = "leaf";
    // @ts-ignore
    this.navigation = false;
  }
  getViewType(): string { return VIEW_TODAY; }
  getDisplayText(): string { return VIEW_TODAY_NAME; }

  async onOpen() {
    const container = (this as any).containerEl;
    container.empty();
    container.addClass("pgm-today");
    container.createEl("h3", { text: "Today" });

    const idx = await this.plugin.index!.build();
    const list = container.createEl("div");

    const winterMonths = this.plugin.settings.winter_months_uk;

    for (const id in idx.plants) {
      const item = idx.plants[id];
      const res = computeWaterDue(item.data, winterMonths);
      if (!res.due) continue;
      const row = list.createEl("div", { cls: "pgm-row" });
      row.createEl("strong", { text: item.data.common });
      row.createSpan({ text: " — Water due" });
      const btn = row.createEl("button", { text: "Log water" });
      btn.addEventListener("click", () => this.plugin.logActionForFile(this.app.vault.getAbstractFileByPath(item.file) as TFile, "water"));
    }
  }

  async onClose() {}
}
