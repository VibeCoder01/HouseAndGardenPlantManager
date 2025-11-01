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
import {
  HOUSEPLANT_CATALOG,
  GARDEN_PLANT_CATALOG,
  type HouseplantCatalogEntry,
  type GardenPlantCatalogEntry,
} from "./catalog";
import { PlantIndex } from "./indexer";
import { ensureFile, readFrontMatter, updateFileFrontMatter } from "./yamlIO";
import { addDays, todayYMD } from "./utils/dates";
import { computeWaterDue, WateringComputation } from "./logic/watering";
import { VIEW_TODAY, VIEW_TODAY_NAME } from "./constants";

const FALLBACK_PLANT_TEMPLATE = `---
id: {{id}}
type: plant
common: {{common}}
latin: {{latin}}
acquired: {{date}}
location:
light: {{light}}
pet_safe: {{pet_safe}}
env:
  humidity_pref: {{humidity}}
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
    interval_days_hint: {{water_interval_days_hint}}
  fertilise:
    during: {{fertilise_during}}
    cadence: monthly
    interval_weeks_hint: {{fertilise_interval_weeks}}
status: active
---
# {{common}} ({{latin}})
> {{summary}}
`;

const FALLBACK_BED_TEMPLATE = `---
id: {{id}}
type: bed
name: {{name}}
location: {{location}}
{{size_line}}soil: {{soil}}
rotation_group: {{rotation_group}}
frost_context:
  last_spring_frost: {{last_spring_frost}}
status: active
tags: [garden]
---
# {{name}}

## Notes
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

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

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
      id: "pgm-new-bed",
      name: "Garden: New bed",
      callback: async () => {
        await this.createBed();
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

  private async confirm(
    message: string,
    confirmText = "Override",
    cancelText = "Cancel",
  ): Promise<boolean> {
    const modal = new ConfirmModal(this.app, message, confirmText, cancelText);
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
    const selection = await new HouseplantCatalogModal(this.app).openAndGetChoice();
    if (!selection) return;
    const selectedEntry = selection.kind === "entry" ? selection.entry : null;
    const chosenName = selection.kind === "entry" ? selection.entry.common : selection.name.trim();
    const common = chosenName || (await this.prompt("Common name?"))?.trim();
    if (!common) return;
    const slug = common
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "");
    const id = `hp-${slug}`;
    const today = todayYMD();

    const pot = await this.choosePotForNewPlant();
    if (!pot) return;

    const latin = selectedEntry?.latin ?? "";
    const light = selectedEntry?.light ?? "bright-indirect";
    const humidity = selectedEntry?.humidity ?? "medium";
    const waterInterval = selectedEntry?.water_interval_days_hint ?? 7;
    const fertiliseInterval = selectedEntry?.feeding_interval_weeks ?? 4;
    const summary = selectedEntry?.summary ?? `Care notes for ${common}.`;
    const petSafe = selectedEntry?.pet_safe === true
      ? "true"
      : selectedEntry?.pet_safe === false
      ? "false"
      : "unknown";

    const potVolumeStr = Number.isInteger(pot.volume_l)
      ? pot.volume_l.toString()
      : pot.volume_l.toFixed(2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");

    const replacements = {
      id,
      common,
      latin,
      date: today,
      pot_diameter_mm: String(pot.diameter_mm),
      pot_volume_l: potVolumeStr,
      pot_medium: pot.medium,
      medium: pot.medium,
      pot_name: pot.name ?? "",
      light,
      humidity,
      pet_safe: petSafe,
      water_interval_days_hint: String(waterInterval),
      fertilise_during: "active_only",
      fertilise_interval_weeks: String(fertiliseInterval),
      summary,
    };

    const template = await this.resolveTemplateContent(
      this.settings.templates.plant,
      FALLBACK_PLANT_TEMPLATE,
      replacements,
    );

    const filePath = `${this.settings.folders.plants}/${slug || id}.md`;
    const alreadyExists = await this.app.vault.adapter.exists(filePath).catch(() => false);
    const file = await ensureFile(this.app.vault, filePath, template);
    if (alreadyExists) {
      new Notice("Plant note already existed; opened existing file.");
    }
    await this.app.workspace.getLeaf(true).openFile(file);
    await this.refreshTodayView();
  }

  /** Create a new garden bed note from template. */
  async createBed() {
    const name = await this.promptNonEmpty("Bed name?", "", "Enter a bed name.");
    if (name === null) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const id = slug ? `bed-${slug}` : `bed-${todayYMD()}`;

    const location = await this.promptNonEmpty("Where is the bed located?", "Garden", "Enter a location.");
    if (location === null) return;

    const soil = await this.promptNonEmpty("Soil description?", "loam", "Enter a soil description.");
    if (soil === null) return;

    const rotationGroup = await selectFromList(
      this.app,
      "Rotation group",
      ROTATION_FAMILIES,
      "misc",
    );
    if (!rotationGroup) return;

    let sizeValue: number | undefined;
    while (true) {
      const sizeInput = await this.prompt("Bed size (m²)? Leave blank to skip.", sizeValue ? String(sizeValue) : "");
      if (sizeInput === null) return;
      const trimmed = sizeInput.trim();
      if (!trimmed) {
        sizeValue = undefined;
        break;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        new Notice("Enter a valid bed size in square metres or leave blank.");
        continue;
      }
      sizeValue = Number(parsed.toFixed(2));
      break;
    }

    const defaultFrost = this.settings.default_frost_dates.last_spring_frost;
    let frostDate = defaultFrost;
    while (true) {
      const frostInput = await this.prompt(
        "Last spring frost date? (YYYY-MM-DD)",
        frostDate,
      );
      if (frostInput === null) return;
      const trimmed = frostInput.trim();
      if (!trimmed) {
        frostDate = defaultFrost;
        break;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        frostDate = trimmed;
        break;
      }
      new Notice("Enter a date in YYYY-MM-DD format or leave blank for the default.");
    }

    const replacements = {
      id,
      name,
      location,
      soil,
      rotation_group: rotationGroup,
      last_spring_frost: frostDate,
      size_line: sizeValue !== undefined ? `size_m2: ${sizeValue}\n` : "",
    };

    const template = await this.resolveTemplateContent(
      this.settings.templates.bed,
      FALLBACK_BED_TEMPLATE,
      replacements,
    );

    const filePath = `${this.settings.folders.beds}/${name}.md`;
    const alreadyExists = await this.app.vault.adapter.exists(filePath).catch(() => false);
    const file = await ensureFile(this.app.vault, filePath, template);
    if (alreadyExists) {
      new Notice("Garden bed note already existed; opened existing file.");
    }
    await this.app.workspace.getLeaf(true).openFile(file);
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
    const diameter = await this.promptPositiveNumber(
      "Pot diameter (mm)?",
      defaults?.diameter_mm ?? 120,
      "Enter a valid pot diameter in millimetres.",
    );
    if (diameter === null) return null;

    const volume = await this.promptPositiveNumber(
      "Pot volume (litres)?",
      defaults?.volume_l ?? 1,
      "Enter a valid pot volume in litres.",
    );
    if (volume === null) return null;

    const medium = await this.promptNonEmpty(
      "Potting medium mix?",
      defaults?.medium ?? "peat-free_multipurpose+perlite",
      "Enter a potting medium description.",
    );
    if (medium === null) return null;

    return {
      name: defaults?.name ?? "Custom pot",
      diameter_mm: Math.round(diameter),
      volume_l: Number(volume.toFixed(2)),
      medium,
    };
  }

  private async promptPositiveNumber(
    message: string,
    initial: number,
    errorNotice: string,
  ): Promise<number | null> {
    let current = String(initial);
    while (true) {
      const input = await this.prompt(message, current);
      if (input === null) return null;
      const trimmed = input.trim();
      if (!trimmed) {
        new Notice(errorNotice);
        continue;
      }
      const value = Number(trimmed);
      if (!Number.isFinite(value) || value <= 0) {
        new Notice(errorNotice);
        continue;
      }
      return value;
    }
  }

  private async promptNonEmpty(
    message: string,
    initial: string,
    errorNotice: string,
  ): Promise<string | null> {
    let current = initial;
    while (true) {
      const input = await this.prompt(message, current);
      if (input === null) return null;
      const trimmed = input.trim();
      if (!trimmed) {
        new Notice(errorNotice);
        current = initial;
        continue;
      }
      return trimmed;
    }
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
        const override = await this.confirm(
          "Feeding suppressed for winter/quiescent period. Log feed anyway?",
          "Log feed",
        );
        if (!override) {
          new Notice("Feed cancelled.");
          return false;
        }
      }
    }

    await updateFileFrontMatter(this.app, file, (obj: any) => {
      obj.care = obj.care || {};
      obj.care[action] = obj.care[action] || {};
      obj.care[action].last = todayYMD();
      return obj;
    });

    const performed = new Date().toISOString();
    const safePerformed = performed.replace(/[:.]/g, "-");
    const taskName = `${todayYMD()}_${fm.id}_${action}_${safePerformed}.md`;
    const taskContent = `---
type: plant-task
plant_id: ${fm.id}
action: ${action}
performed: ${performed}
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
      const baseDue = last ? addDays(last, hint) : today;
      obj.care.water.last = addDays(baseDue, n - hint);
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

    const cropSelection = await new GardenCatalogModal(this.app).openAndGetChoice();
    if (!cropSelection) return;
    const cropEntry = cropSelection.kind === "entry" ? cropSelection.entry : null;
    let cropName = cropEntry?.common ?? (cropSelection.kind === "custom" ? cropSelection.name.trim() : "");
    if (!cropName) {
      const typed = (await this.prompt("Crop name?", ""))?.trim();
      if (!typed) return;
      cropName = typed;
    }
    const crop = cropName;

    const defaultFamily = cropEntry?.family ?? fm.rotation_group ?? "misc";
    const family = await selectFromList(
      this.app,
      "Rotation family",
      ROTATION_FAMILIES,
      defaultFamily,
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
    const sowOutdoors = cropEntry?.sow_outdoors ?? [early, late];
    const sowIndoors = cropEntry?.sow_indoors;
    const harvestWindow = cropEntry?.harvest_window;

      const snippetLines = [`- crop: ${crop}`];
      if (cropEntry?.latin) {
        snippetLines.push(`  latin: ${cropEntry.latin}`);
      }
      snippetLines.push("  variety:");
      snippetLines.push(`  family: ${family}`);
      if (cropEntry?.sun) {
        snippetLines.push(`  sun: ${cropEntry.sun}`);
      }
      if (typeof cropEntry?.spacing_cm === "number") {
        snippetLines.push(`  spacing_cm: ${cropEntry.spacing_cm}`);
      }
      if (typeof cropEntry?.frost_sensitive === "boolean") {
        snippetLines.push(`  frost_sensitive: ${cropEntry.frost_sensitive ? "true" : "false"}`);
      }
      snippetLines.push("  sow_window:");
      if (sowIndoors) {
        snippetLines.push(`    indoors: [${sowIndoors[0]}, ${sowIndoors[1]}]`);
      }
      if (sowOutdoors) {
        snippetLines.push(`    outdoors: [${sowOutdoors[0]}, ${sowOutdoors[1]}]`);
      }
      if (harvestWindow) {
        snippetLines.push(`  harvest_window: [${harvestWindow[0]}, ${harvestWindow[1]}]`);
      } else {
        snippetLines.push("  harvest_window:");
      }
      snippetLines.push("  sowed:");
      if (cropEntry?.summary) {
        snippetLines.push("  notes:");
        snippetLines.push(`    - ${quoteYaml(cropEntry.summary)}`);
      } else {
        snippetLines.push("  notes: []");
      }
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
      const waterBtn = actions.createEl("button", {
        text: "Log water",
        attr: { title: "Record that this plant has been watered." },
      });
      waterBtn.addEventListener("click", () => {
        void this.plugin.logActionForPath(item.file, "water");
      });

      const feedBtn = actions.createEl("button", {
        text: "Log feed",
        attr: { title: "Record that this plant has been fertilised." },
      });
      feedBtn.addEventListener("click", () => {
        void this.plugin.logActionForPath(item.file, "fertilise");
      });

      const snoozeBtn = actions.createEl("button", {
        text: "Snooze",
        attr: { title: "Postpone this task and remind me later." },
      });
      snoozeBtn.addEventListener("click", () => {
        void this.plugin.promptSnoozeForPath(item.file);
      });

      const openBtn = actions.createEl("button", {
        text: "Open",
        attr: { title: "Open this plant's note in a new pane." },
      });
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

class ConfirmModal extends Modal {
  private resolveFn: ((value: boolean) => void) | null = null;
  private choice: boolean | null = null;
  private handleKeydown = (evt: KeyboardEvent) => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      this.submit(true);
    }
    if (evt.key === "Escape") {
      evt.preventDefault();
      this.submit(false);
    }
  };

  constructor(app: App, private message: string, private confirmText: string, private cancelText: string) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", { text: this.message });
    const actions = contentEl.createDiv({ cls: "pgm-modal-actions" });
    const confirmBtn = actions.createEl("button", {
      text: this.confirmText,
      attr: { title: "Confirm and carry out this action." },
    });
    const cancelBtn = actions.createEl("button", {
      text: this.cancelText,
      attr: { title: "Cancel and close this dialog without changes." },
    });
    confirmBtn.addEventListener("click", () => this.submit(true));
    cancelBtn.addEventListener("click", () => this.submit(false));
    confirmBtn.focus();
    this.modalEl.addEventListener("keydown", this.handleKeydown);
  }

  private submit(choice: boolean) {
    this.choice = choice;
    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.removeEventListener("keydown", this.handleKeydown);
    const resolve = this.resolveFn;
    this.resolveFn = null;
    const choice = this.choice;
    this.choice = null;
    resolve?.(choice ?? false);
  }

  openAndGetValue(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.open();
    });
  }
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
    const confirm = actions.createEl("button", {
      text: "OK",
      attr: { title: "Save this value and close the prompt." },
    });
    confirm.addEventListener("click", () => this.submit(input.value));
    const cancel = actions.createEl("button", {
      text: "Cancel",
      attr: { title: "Dismiss the prompt without saving changes." },
    });
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

type HouseplantCatalogChoice =
  | { kind: "entry"; entry: HouseplantCatalogEntry }
  | { kind: "custom"; name: string };

class HouseplantCatalogModal extends SuggestModal<HouseplantCatalogChoice> {
  private resolveFn: ((value: HouseplantCatalogChoice | null) => void) | null = null;
  private settled = false;
  private readonly entries = [...HOUSEPLANT_CATALOG].sort((a, b) =>
    a.common.localeCompare(b.common),
  );

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    super.onOpen();
    this.setPlaceholder("Search houseplant catalog or type a custom name");
    this.inputEl.focus();
  }

  getSuggestions(query: string): HouseplantCatalogChoice[] {
    const trimmed = query.trim();
    const normalised = trimmed.toLowerCase();
    const matches = (normalised
      ? this.entries.filter(
          (entry) =>
            entry.common.toLowerCase().includes(normalised) ||
            entry.latin.toLowerCase().includes(normalised),
        )
      : this.entries
    ).slice(0, 30);
    const suggestions: HouseplantCatalogChoice[] = matches.map((entry) => ({
      kind: "entry",
      entry,
    }));
    if (trimmed.length) {
      const exact = this.entries.some((entry) => entry.common.toLowerCase() === normalised);
      if (!exact) {
        suggestions.push({ kind: "custom", name: trimmed });
      }
    } else if (!suggestions.some((s) => s.kind === "custom")) {
      suggestions.push({ kind: "custom", name: "" });
    }
    return suggestions;
  }

  renderSuggestion(value: HouseplantCatalogChoice, el: HTMLElement) {
    el.empty();
    if (value.kind === "entry") {
      el.createEl("div", { text: value.entry.common, cls: "pgm-suggest-title" });
      el.createEl("div", {
        text: value.entry.latin,
        cls: "pgm-suggest-sub",
      });
      el.createEl("div", {
        text: `Light: ${value.entry.light} • Water ~${value.entry.water_interval_days_hint}d`,
        cls: "pgm-suggest-meta",
      });
    } else {
      const label = value.name
        ? `Use custom name: ${value.name}`
        : "Create custom plant name…";
      el.createEl("div", { text: label });
    }
  }

  onChooseSuggestion(value: HouseplantCatalogChoice) {
    this.settled = true;
    this.resolveFn?.(value);
    this.resolveFn = null;
    this.close();
  }

  onClose() {
    super.onClose();
    if (!this.settled) {
      const typed = this.inputEl.value.trim();
      if (typed) {
        this.resolveFn?.({ kind: "custom", name: typed });
      } else {
        this.resolveFn?.(null);
      }
    }
    this.resolveFn = null;
    this.settled = false;
  }

  openAndGetChoice(): Promise<HouseplantCatalogChoice | null> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.settled = false;
      this.open();
    });
  }
}

type GardenCatalogChoice =
  | { kind: "entry"; entry: GardenPlantCatalogEntry }
  | { kind: "custom"; name: string };

class GardenCatalogModal extends SuggestModal<GardenCatalogChoice> {
  private resolveFn: ((value: GardenCatalogChoice | null) => void) | null = null;
  private settled = false;
  private readonly entries = [...GARDEN_PLANT_CATALOG].sort((a, b) =>
    a.common.localeCompare(b.common),
  );

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    super.onOpen();
    this.setPlaceholder("Search garden catalog or type a custom crop");
    this.inputEl.focus();
  }

  getSuggestions(query: string): GardenCatalogChoice[] {
    const trimmed = query.trim();
    const normalised = trimmed.toLowerCase();
    const matches = (normalised
      ? this.entries.filter(
          (entry) =>
            entry.common.toLowerCase().includes(normalised) ||
            entry.latin.toLowerCase().includes(normalised),
        )
      : this.entries
    ).slice(0, 30);
    const suggestions: GardenCatalogChoice[] = matches.map((entry) => ({
      kind: "entry",
      entry,
    }));
    if (trimmed.length) {
      const exact = this.entries.some((entry) => entry.common.toLowerCase() === normalised);
      if (!exact) {
        suggestions.push({ kind: "custom", name: trimmed });
      }
    } else if (!suggestions.some((s) => s.kind === "custom")) {
      suggestions.push({ kind: "custom", name: "" });
    }
    return suggestions;
  }

  renderSuggestion(value: GardenCatalogChoice, el: HTMLElement) {
    el.empty();
    if (value.kind === "entry") {
      el.createEl("div", { text: value.entry.common, cls: "pgm-suggest-title" });
      const subParts = [value.entry.latin];
      if (value.entry.family) {
        subParts.push(`Family: ${value.entry.family}`);
      }
      el.createEl("div", { text: subParts.join(" • "), cls: "pgm-suggest-sub" });
      const details: string[] = [];
      if (value.entry.sun) {
        details.push(`Sun: ${value.entry.sun}`);
      }
      if (value.entry.sow_outdoors) {
        details.push(`Outdoors: ${value.entry.sow_outdoors[0]}-${value.entry.sow_outdoors[1]}`);
      }
      if (details.length) {
        el.createEl("div", { text: details.join(" • "), cls: "pgm-suggest-meta" });
      }
    } else {
      const label = value.name
        ? `Use custom crop: ${value.name}`
        : "Create custom crop entry…";
      el.createEl("div", { text: label });
    }
  }

  onChooseSuggestion(value: GardenCatalogChoice) {
    this.settled = true;
    this.resolveFn?.(value);
    this.resolveFn = null;
    this.close();
  }

  onClose() {
    super.onClose();
    if (!this.settled) {
      const typed = this.inputEl.value.trim();
      if (typed) {
        this.resolveFn?.({ kind: "custom", name: typed });
      } else {
        this.resolveFn?.(null);
      }
    }
    this.resolveFn = null;
    this.settled = false;
  }

  openAndGetChoice(): Promise<GardenCatalogChoice | null> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.settled = false;
      this.open();
    });
  }
}
