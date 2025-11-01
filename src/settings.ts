import { App, PluginSettingTab, Setting } from "obsidian";
import type HouseplantGardenPlugin from "./main";
import type { PluginSettings, PotPreset } from "./types";

export const DEFAULT_POT_PRESETS: PotPreset[] = [
  {
    name: "12 cm nursery pot",
    diameter_mm: 120,
    volume_l: 1,
    medium: "peat-free_multipurpose+perlite",
  },
  {
    name: "15 cm nursery pot",
    diameter_mm: 150,
    volume_l: 2,
    medium: "peat-free_multipurpose+perlite",
  },
  {
    name: "20 cm decorative pot",
    diameter_mm: 200,
    volume_l: 4,
    medium: "houseplant_mix_with_bark",
  },
];

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
  pot_presets: DEFAULT_POT_PRESETS,
  calibration: {},
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
    containerEl.createEl("p", {
      text:
        "Configure how the plugin schedules care tasks and where it stores generated files. Hover over each option to read a quick reminder.",
    });
    containerEl.createEl("p", {
      text:
        "All paths are relative to your vault root. Changes are saved instantly, so there is no extra save button to click.",
    });

    new Setting(containerEl)
      .setName("Bottom-watering mode")
      .setDesc("If enabled, schedule periodic top-water flush reminders.")
      .addToggle((t) => t.setValue(this.plugin.settings.bottom_watering_mode).onChange(async (v) => {
        this.plugin.settings.bottom_watering_mode = v;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Flush salts every N months")
      .setDesc("Choose how often the plugin reminds you to perform a thorough flush.")
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
      .setDesc(
        "Plants / Beds / Tasks base folders. The plugin will create new notes underneath these locations.",
      )
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
      .setDesc("Used when generating a new plant note. Provide a Markdown template file.")
      .addText((t) => t.setPlaceholder("Templates/plant.md").setValue(this.plugin.settings.templates.plant).onChange(async (v) => {
        this.plugin.settings.templates.plant = v || "Templates/plant.md"; await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("Pot presets")
      .setDesc(
        "Define the pot options offered when creating a new plant. One per line as: Name | diameter_mm | volume_l | medium.",
      )
      .addTextArea((t) => {
        t.setValue(formatPotPresets(this.plugin.settings.pot_presets));
        t.inputEl.rows = Math.max(3, this.plugin.settings.pot_presets.length);
        t.onChange(async (value) => {
          const parsed = parsePotPresets(value);
          if (parsed.length > 0 || value.trim().length === 0) {
            this.plugin.settings.pot_presets = parsed;
            await this.plugin.saveSettings();
          }
        });
      });
  }
}

function formatPotPresets(presets: PotPreset[]): string {
  return presets
    .map((preset) =>
      [preset.name, preset.diameter_mm, preset.volume_l, preset.medium]
        .map((part) => String(part).trim())
        .join(" | "),
    )
    .join("\n");
}

function parsePotPresets(value: string): PotPreset[] {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const presets: PotPreset[] = [];
  for (const line of lines) {
    const [nameRaw, diameterRaw, volumeRaw, mediumRaw] = line.split("|").map((part) => part.trim());
    if (!nameRaw || !diameterRaw || !volumeRaw || !mediumRaw) {
      continue;
    }
    const diameter = Number(diameterRaw);
    const volume = Number(volumeRaw);
    if (!Number.isFinite(diameter) || diameter <= 0) {
      continue;
    }
    if (!Number.isFinite(volume) || volume <= 0) {
      continue;
    }
    presets.push({
      name: nameRaw,
      diameter_mm: Math.round(diameter),
      volume_l: Number(volume.toFixed(2)),
      medium: mediumRaw,
    });
  }
  return presets;
}
