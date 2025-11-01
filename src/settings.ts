import { App, PluginSettingTab, Setting } from "obsidian";
import type HouseplantGardenPlugin from "./main";
import type { PluginSettings } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  watering_method: "top-until-runoff",
  bottom_watering_mode: false,
  flush_salts_every_months: 4,
  fertiliser_policy: "active-only",
  winter_months_uk: [11, 12, 1, 2],
  lift_test_hints: true,
  rotation_gap_years: 3,
  default_frost_dates: { last_spring_frost: "2025-04-10" },
  folders: { plants: "Plants", beds: "GardenBeds", tasks: "PlantTasks" },
  templates: { plant: "Templates/plant.md" },
};

export class SettingsTab extends PluginSettingTab {
  plugin: HouseplantGardenPlugin;
  constructor(app: App, plugin: HouseplantGardenPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Houseplant & Garden Manager" });

    new Setting(containerEl)
      .setName("Bottom-watering mode")
      .setDesc("If enabled, schedule periodic top-water flush reminders.")
      .addToggle((t) => t.setValue(this.plugin.settings.bottom_watering_mode).onChange(async (v) => {
        this.plugin.settings.bottom_watering_mode = v;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Flush salts every N months")
      .addText((t) => t.setPlaceholder("4").setValue(String(this.plugin.settings.flush_salts_every_months)).onChange(async (v) => {
        const n = Number(v) || 4;
        this.plugin.settings.flush_salts_every_months = Math.max(1, n);
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Winter months (UK)")
      .setDesc("Months where prompts are suppressed for feeds.")
      .addText((t) => t.setValue(this.plugin.settings.winter_months_uk.join(",")).onChange(async (v) => {
        const arr = v.split(",").map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 12);
        if (arr.length) this.plugin.settings.winter_months_uk = arr;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Folders")
      .setDesc("Plants / Beds / Tasks base folders")
      .addText((t) => t.setPlaceholder("Plants").setValue(this.plugin.settings.folders.plants).onChange(async (v) => {
        this.plugin.settings.folders.plants = v || "Plants"; await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .addText((t) => t.setPlaceholder("GardenBeds").setValue(this.plugin.settings.folders.beds).onChange(async (v) => {
        this.plugin.settings.folders.beds = v || "GardenBeds"; await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .addText((t) => t.setPlaceholder("PlantTasks").setValue(this.plugin.settings.folders.tasks).onChange(async (v) => {
        this.plugin.settings.folders.tasks = v || "PlantTasks"; await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Plant template path")
      .addText((t) => t.setPlaceholder("Templates/plant.md").setValue(this.plugin.settings.templates.plant).onChange(async (v) => {
        this.plugin.settings.templates.plant = v || "Templates/plant.md"; await this.plugin.saveSettings();
      }));
  }
}
