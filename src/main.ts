import {
  App,
  Editor,
  ItemView,
  Modal,
  MarkdownView,
  Notice,
  Plugin,
  SuggestModal,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import { DEFAULT_POT_PRESETS, DEFAULT_SETTINGS, SettingsTab } from "./settings";
import type { PluginSettings, Plant, PotPreset, WeightCalibration } from "./types";
import { PlantIndex } from "./indexer";
import { ensureFile, readFrontMatter, updateFileFrontMatter } from "./yamlIO";
import { addDays, todayYMD } from "./utils/dates";
import { computeWaterDue, WateringComputation } from "./logic/watering";
import { VIEW_TODAY, VIEW_TODAY_NAME } from "./constants";

const FALLBACK_PLANT_TEMPLATE = `---
id: {{id}}
type: plant
common: {{common}}
acquired: {{date}}
location:
light: bright-indirect
env: {}
pot:
  diameter_mm: {{pot_diameter_mm}}
  volume_l: {{pot_volume_l}}
  medium: {{medium}}
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
# {{common}}
`;

type PotChoice = { name?: string; diameter_mm: number; volume_l: number; medium: string };

const ROTATION_FAMILIES = [
  "brassicas",
  "legumes",
  "roots",
  "alliums",
  "solanaceae",
  "cucurbits",
  "misc",
];

export default class HouseplantGardenPlugin extends Plugin {
  settings!: PluginSettings;
  index?: PlantIndex;
  todayView?: TodayView;

  async onload() {
    await this.loadSettings();

    this.index = new PlantIndex(this.app.vault, this.settings.folders);

    this.addCommand({
      id: "pgm-new-plant",
      name: "Plant: New plant",
      callback: async () => {
        await this.createPlant();
      },
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
      callback: async () => {
        await this.snoozeActivePlant();
      },
    });

    this.addCommand({
      id: "pgm-calibrate-weight",
      name: "Plant: Calibrate pot weight",
      checkCallback: (checking) => this.calibrateWeightGuard(checking),
    });

    this.addCommand({
      id: "pgm-move-status",
      name: "Plant: Move plant / Mark status",
      checkCallback: (checking) => this.moveStatusGuard(checking),
    });

    this.addCommand({
      id: "pgm-insert-crop-template",
      name: "Garden: Insert crop template",
      editorCallback: async (editor: Editor, ctx) => {
        const file = ctx instanceof MarkdownView ? ctx.file : ctx.file;
        if (!(file instanceof TFile)) {
          new Notice("Open a garden bed note first.");
          return;
        }
        await this.insertCropTemplate(editor, file);
      },
    });

    this.addSettingTab(new SettingsTab(this.app, this));

    this.registerView(VIEW_TODAY, (leaf) => {
      const view = new TodayView(leaf, this);
      this.todayView = view;
      return view;
    });

    this.addRibbonIcon("leaf", "Open Today view", () => this.activateTodayView());

    await this.activateTodayView();
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TODAY);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async refreshTodayView() {
    this.todayView?.requestRender();
  }

  private async prompt(message: string, defaultValue = ""): Promise<string | null> {
    const appAny = this.app as any;
    if (typeof appAny.prompt === "function") {
      try {
        return await appAny.prompt(message, defaultValue);
      } catch (error) {
        console.warn("Fallback prompt modal due to error", error);
      }
    }
    const modal = new PromptModal(this.app, message, defaultValue);
    return await modal.openAndGetValue();
  }

  private async resolveTemplateContent(
    path: string,
    fallback: string,
    replacements: Record<string, string>,
  ): Promise<string> {
    const abstract = this.app.vault.getAbstractFileByPath(path);
    let template = fallback;
    if (abstract instanceof TFile) {
      try {
        template = await this.app.vault.read(abstract);
      } catch (err) {
        console.error("Failed to read template", err);
      }
    }
    let result = template;
    for (const key in replacements) {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), replacements[key]);
    }
    return result;
  }

  /** Create a new plant note from template. */
  async createPlant() {
    const common = await this.prompt("Common name?");
    if (!common) return;
    const id = `hp-${common.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const today = todayYMD();

    const pot = await this.choosePotForNewPlant();
    if (!pot) return;

    const potVolumeStr = Number.isInteger(pot.volume_l)
      ? pot.volume_l.toString()
      : pot.volume_l.toFixed(2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");

    const replacements = {
      id,
      common,
      date: today,
      pot_diameter_mm: String(pot.diameter_mm),
      pot_volume_l: potVolumeStr,
      pot_medium: pot.medium,
      medium: pot.medium,
      pot_name: pot.name ?? "",
    };

    const template = await this.resolveTemplateContent(
      this.settings.templates.plant,
      FALLBACK_PLANT_TEMPLATE,
      replacements,
    );

    const filePath = `${this.settings.folders.plants}/${common}.md`;
    const alreadyExists = await this.app.vault.adapter.exists(filePath).catch(() => false);
    const file = await ensureFile(this.app.vault, filePath, template);
    if (alreadyExists) {
      new Notice("Plant note already existed; opened existing file.");
    }
    await this.app.workspace.getLeaf(true).openFile(file);
    await this.refreshTodayView();
  }

  private async choosePotForNewPlant(): Promise<PotChoice | null> {
    const stored = this.settings.pot_presets;
    const presets = Array.isArray(stored) ? stored : DEFAULT_POT_PRESETS;
    if (!presets.length) {
      return this.promptCustomPot();
    }
    const options = [...presets.map((preset) => preset.name), "Custom dimensions…"];
    const selection = await selectFromList(
      this.app,
      "Choose pot",
      options,
      presets[0]?.name,
    );
    if (!selection) return null;
    if (selection === "Custom dimensions…") {
      return this.promptCustomPot(presets[0]);
    }
    const preset = presets.find((p) => p.name === selection) ?? presets[0];
    return { ...preset };
  }

  private async promptCustomPot(defaults?: PotPreset): Promise<PotChoice | null> {
    const diameterStr = await this.prompt(
      "Pot diameter (mm)?",
      defaults ? String(defaults.diameter_mm) : "120",
    );
    if (!diameterStr) return null;
    const diameter = Number(diameterStr);
    if (!Number.isFinite(diameter) || diameter <= 0) {
      new Notice("Enter a valid pot diameter in millimetres.");
      return null;
    }

    const volumeStr = await this.prompt(
      "Pot volume (litres)?",
      defaults ? String(defaults.volume_l) : "1",
    );
    if (!volumeStr) return null;
    const volume = Number(volumeStr);
    if (!Number.isFinite(volume) || volume <= 0) {
      new Notice("Enter a valid pot volume in litres.");
      return null;
    }

    const medium = await this.prompt(
      "Potting medium mix?",
      defaults?.medium ?? "peat-free_multipurpose+perlite",
    );
    if (medium === null) return null;
    const trimmedMedium = medium.trim();
    if (!trimmedMedium) {
      new Notice("Enter a potting medium description.");
      return null;
    }

    return {
      name: defaults?.name ?? "Custom pot",
      diameter_mm: Math.round(diameter),
      volume_l: Number(volume.toFixed(2)),
      medium: trimmedMedium,
    };
  }

  /** Guarded log action for plant in active editor. */
  private logActionGuard(checking: boolean, action: "water" | "fertilise") {
    const file = this.app.workspace.getActiveFile();
    if (!file) return false;
    if (checking) return true;
    void this.logActionForFile(file, action);
    return true;
  }

  private calibrateWeightGuard(checking: boolean) {
    const file = this.app.workspace.getActiveFile();
    if (!file) return false;
    if (checking) return true;
    void this.calibrateWeights(file);
    return true;
  }

  private moveStatusGuard(checking: boolean) {
    const file = this.app.workspace.getActiveFile();
    if (!file) return false;
    if (checking) return true;
    void this.moveOrMarkPlant(file);
    return true;
  }

  async logActionForFile(file: TFile, action: "water" | "fertilise"): Promise<boolean> {
    const raw = await this.app.vault.read(file);
    const fm = readFrontMatter(raw);
    if (!fm || fm.type !== "plant") {
      new Notice("Not a plant note.");
      return false;
    }

    if (action === "fertilise") {
      const month = new Date().getMonth() + 1;
      const winter = this.settings.winter_months_uk.includes(month);
      if (fm.care?.fertilise?.during === "paused") {
        new Notice("Feeding paused for this plant.");
        return false;
      }
      if (fm.drought_stressed) {
        new Notice("Blocked: plant is drought-stressed. Water first.");
        return false;
      }
      if (
        this.settings.fertiliser_policy === "active-only" &&
        (winter || fm.growth_phase === "quiescent")
      ) {
        new Notice("Suppressed in winter/quiescent period. Override manually if needed.");
        return false;
      }
    }

    await updateFileFrontMatter(this.app, file, (obj: any) => {
      obj.care = obj.care || {};
      obj.care[action] = obj.care[action] || {};
      obj.care[action].last = todayYMD();
      return obj;
    });

    const taskName = `${todayYMD()}_${fm.id}_${action}.md`;
    const taskContent = `---
type: plant-task
plant_id: ${fm.id}
action: ${action}
performed: ${new Date().toISOString()}
---
`;
    await ensureFile(
      this.app.vault,
      `${this.settings.folders.tasks}/${taskName}`,
      taskContent,
    );
    new Notice(`Logged ${action}.`);
    await this.refreshTodayView();
    return true;
  }

  async logActionForPath(path: string, action: "water" | "fertilise") {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.logActionForFile(file, action);
    }
  }

  private async calibrateWeights(file: TFile) {
    const raw = await this.app.vault.read(file);
    const fm = readFrontMatter(raw);
    if (!fm || fm.type !== "plant") {
      new Notice("Calibration requires a plant note.");
      return;
    }

    const wetStr = await this.prompt(
      "Fully watered weight (grams)?",
      this.settings.calibration?.[fm.id]?.wet?.toString() ?? "",
    );
    if (!wetStr) return;
    const wet = Number(wetStr);
    if (!Number.isFinite(wet) || wet <= 0) {
      new Notice("Enter a valid number for wet weight.");
      return;
    }

    const readyStr = await this.prompt(
      "Ready-to-water weight (grams)?",
      this.settings.calibration?.[fm.id]?.ready?.toString() ?? "",
    );
    if (!readyStr) return;
    const ready = Number(readyStr);
    if (!Number.isFinite(ready) || ready <= 0) {
      new Notice("Enter a valid number for ready weight.");
      return;
    }

    const calibration: WeightCalibration = {
      wet,
      ready,
      updated: new Date().toISOString(),
    };
    this.settings.calibration[fm.id] = calibration;
    await this.saveSettings();
    new Notice(`Stored weight profile for ${fm.common ?? fm.id}.`);
  }

  private async moveOrMarkPlant(file: TFile) {
    const raw = await this.app.vault.read(file);
    const fm = readFrontMatter(raw);
    if (!fm || fm.type !== "plant") {
      new Notice("Open a plant note to move or mark status.");
      return;
    }

    const newLocation = await this.prompt("New location?", fm.location ?? "");
    if (newLocation === null) return;

    const status = await selectFromList(
      this.app,
      "Update status",
      ["active", "dormant", "gifted", "dead"],
      fm.status ?? "active",
    );
    if (!status) return;

    await updateFileFrontMatter(this.app, file, (obj: any) => {
      obj.location = newLocation ?? obj.location;
      obj.status = status;
      return obj;
    });
    new Notice("Plant updated.");
    await this.refreshTodayView();
  }

  async snoozeActivePlant() {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Open a plant note first.");
      return;
    }
    await this.promptSnoozeForFile(file);
  }

  async promptSnoozeForFile(file: TFile) {
    const raw = await this.app.vault.read(file);
    const fm = readFrontMatter(raw);
    if (!fm || fm.type !== "plant") {
      new Notice("Snooze applies to plant notes only.");
      return;
    }
    const daysStr = await this.prompt("Snooze by days?", "2");
    const n = Number(daysStr || "0");
    if (!Number.isFinite(n) || n === 0) return;
    await updateFileFrontMatter(this.app, file, (obj: any) => {
      obj.care = obj.care || {};
      obj.care.water = obj.care.water || {};
      const last = obj.care.water.last;
      const hint = obj.care.water.interval_days_hint ?? 7;
      const today = todayYMD();
      const next = last || today;
      obj.care.water.last = addDays(next, n - hint);
      return obj;
    });
    new Notice("Snoozed.");
    await this.refreshTodayView();
  }

  async promptSnoozeForPath(path: string) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.promptSnoozeForFile(file);
    }
  }

  async activateTodayView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TODAY);
    if (leaves.length) {
      await this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TODAY, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async insertCropTemplate(editor: Editor, file: TFile) {
    const raw = await this.app.vault.read(file);
    const fm = readFrontMatter(raw);
    if (!fm || fm.type !== "bed") {
      new Notice("Use this command inside a garden bed note.");
      return;
    }

    const crop = await this.prompt("Crop name?", "");
    if (!crop) return;

    const family = await selectFromList(
      this.app,
      "Rotation family",
      ROTATION_FAMILIES,
      fm.rotation_group ?? "misc",
    );
    if (!family) return;

    const historyFamilies: string[] = Array.isArray(fm.rotation_history)
      ? fm.rotation_history
      : [];
    const gap = fm.rotation_gap_years ?? this.settings.rotation_gap_years;
    const hasConflict = historyFamilies.slice(0, gap).includes(family);
    if (hasConflict) {
      new Notice("⚠️ Rotation conflict: same family seen within gap.");
    }

    const frost =
      fm?.frost_context?.last_spring_frost ??
      this.settings.default_frost_dates.last_spring_frost;
    const early = addDays(frost, -14).slice(5);
    const late = addDays(frost, 60).slice(5);

      const snippetLines = [
        `- crop: ${crop}`,
        "  variety:",
        `  family: ${family}`,
        "  sow_window:",
        `    outdoors: [${early}, ${late}]`,
        "  harvest_window:",
        "  sowed:",
        "  notes: []",
      ];
    if (hasConflict) {
      snippetLines.push("  rotation_warning: true");
    }
    const snippet = snippetLines.join("\n") + "\n";

    editor.replaceSelection(snippet);
    new Notice("Inserted crop template.");
  }
}

class TodayView extends ItemView {
  private rendering = false;
  constructor(public leaf: WorkspaceLeaf, public plugin: HouseplantGardenPlugin) {
    super(leaf);
    this.icon = "leaf";
    this.navigation = false;
  }

  getViewType(): string {
    return VIEW_TODAY;
  }

  getDisplayText(): string {
    return VIEW_TODAY_NAME;
  }

  async onOpen() {
    await this.render();
  }

  async onClose() {}

  requestRender() {
    void this.render();
  }

  private async render() {
    if (this.rendering) return;
    this.rendering = true;
    try {
      const container = this.containerEl;
      container.empty();
      container.addClass("pgm-today");

      const title = container.createEl("h3", { text: "Today" });
      title.addClass("pgm-heading");

      if (!this.plugin.index) {
        container.createSpan({ text: "Index unavailable yet." });
        return;
      }

      const idx = await this.plugin.index.build();
      const winterMonths = this.plugin.settings.winter_months_uk;

      const groups: Record<string, Array<{ file: string; plant: Plant; water: WateringComputation }>> = {
        overdue: [],
        today: [],
        soon: [],
        suppressed: [],
      };

      for (const id in idx.plants) {
        const item = idx.plants[id];
        const res = computeWaterDue(item.data, winterMonths);
        switch (res.status) {
          case "overdue":
            groups.overdue.push({ file: item.file, plant: item.data, water: res });
            break;
          case "due-today":
            groups.today.push({ file: item.file, plant: item.data, water: res });
            break;
          case "soon":
            groups.soon.push({ file: item.file, plant: item.data, water: res });
            break;
          case "suppressed":
            groups.suppressed.push({ file: item.file, plant: item.data, water: res });
            break;
          default:
            break;
        }
      }

      this.renderSection(container, "Overdue", groups.overdue, true);
      this.renderSection(container, "Today", groups.today, true);
      this.renderSection(container, "Soon", groups.soon, false);
      this.renderSection(container, "Winter-suppressed", groups.suppressed, false);

      if (
        !groups.overdue.length &&
        !groups.today.length &&
        !groups.soon.length &&
        !groups.suppressed.length
      ) {
        container.createDiv({ text: "All plants are within hints." }).addClass("pgm-empty");
      }
    } finally {
      this.rendering = false;
    }
  }

  private renderSection(
    container: HTMLElement,
    title: string,
    items: Array<{ file: string; plant: Plant; water: WateringComputation }>,
    emphasise: boolean,
  ) {
    if (!items.length) return;
    const section = container.createDiv({ cls: "pgm-section" });
    section.createEl("h4", { text: title });
    const list = section.createDiv({ cls: "pgm-list" });

    for (const item of items) {
      const row = list.createDiv({ cls: emphasise ? "pgm-row emphasise" : "pgm-row" });
      row.createEl("strong", { text: item.plant.common });
      const metaParts: string[] = [];
      const lastWater = item.plant.care?.water?.last;
      if (lastWater) {
        metaParts.push(`last: ${lastWater}`);
      } else {
        metaParts.push("last: —");
      }
      metaParts.push(item.water.reason);
      if (item.water.nextDue) {
        metaParts.push(`next hint: ${item.water.nextDue}`);
      }
      row.createSpan({ text: metaParts.join(" • "), cls: "pgm-meta" });

      const actions = row.createDiv({ cls: "pgm-actions" });
      const waterBtn = actions.createEl("button", { text: "Log water" });
      waterBtn.addEventListener("click", () => {
        void this.plugin.logActionForPath(item.file, "water");
      });

      const feedBtn = actions.createEl("button", { text: "Log feed" });
      feedBtn.addEventListener("click", () => {
        void this.plugin.logActionForPath(item.file, "fertilise");
      });

      const snoozeBtn = actions.createEl("button", { text: "Snooze" });
      snoozeBtn.addEventListener("click", () => {
        void this.plugin.promptSnoozeForPath(item.file);
      });

      const openBtn = actions.createEl("button", { text: "Open" });
      openBtn.addEventListener("click", async () => {
        const abstract = this.plugin.app.vault.getAbstractFileByPath(item.file);
        if (abstract instanceof TFile) {
          const leaf = this.plugin.app.workspace.getLeaf(true);
          await leaf.openFile(abstract);
        }
      });
    }
  }
}

class StringSuggestModal extends SuggestModal<string> {
  private resolveFn: ((value: string | null) => void) | null = null;
  private settled = false;
  constructor(app: App, private promptText: string, private options: string[], private initial?: string) {
    super(app);
  }

  onOpen() {
    super.onOpen();
    this.setPlaceholder(this.promptText);
    if (this.initial) {
      this.inputEl.value = this.initial;
      this.inputEl.select();
    }
  }

  getSuggestions(query: string): string[] {
    const normalised = query.toLowerCase();
    return this.options.filter((opt) => opt.toLowerCase().includes(normalised));
  }

  renderSuggestion(value: string, el: HTMLElement) {
    el.createSpan({ text: value });
  }

  onChooseSuggestion(item: string) {
    this.settled = true;
    this.resolveFn?.(item);
    this.resolveFn = null;
    this.close();
  }

  onClose() {
    super.onClose();
    if (!this.settled) {
      this.resolveFn?.(null);
    }
    this.resolveFn = null;
    this.settled = false;
  }

  openAndGetValue(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.settled = false;
      this.open();
    });
  }
}

async function selectFromList(
  app: App,
  promptText: string,
  options: string[],
  initial?: string,
): Promise<string | null> {
  const modal = new StringSuggestModal(app, promptText, options, initial);
  const result = await modal.openAndGetValue();
  return result;
}

class PromptModal extends Modal {
  private resolveFn: ((value: string | null) => void) | null = null;
  private result: string | null = null;
  constructor(app: App, private message: string, private initial: string) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.message });
    const input = contentEl.createEl("input", { type: "text" });
    input.value = this.initial;
    input.focus();
    const actions = contentEl.createDiv({ cls: "pgm-modal-actions" });
    const confirm = actions.createEl("button", { text: "OK" });
    confirm.addEventListener("click", () => this.submit(input.value));
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.submit(null));
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        this.submit(input.value);
      }
      if (evt.key === "Escape") {
        evt.preventDefault();
        this.submit(null);
      }
    });
  }

  private submit(value: string | null) {
    this.result = value;
    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    const resolve = this.resolveFn;
    this.resolveFn = null;
    const result = this.result;
    this.result = null;
    resolve?.(result);
  }

  openAndGetValue(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.open();
    });
  }
}
