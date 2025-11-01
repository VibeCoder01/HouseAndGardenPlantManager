# House and Garden Plant Manager (HaG-PM)

House and Garden Plant Manager is an offline-first Obsidian plugin that helps you keep tabs on houseplants and garden beds using practical care hints instead of rigid timers. The plugin follows the [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) and stores all data locally in your vault.

## Features

- **Watering guidance** driven by moisture checks, growth phase, and seasonal overrides. The Today view groups plants into Overdue, Today, Soon, and Winter-suppressed buckets with quick actions.
- **Task logging** for watering and fertilising. Each log writes a dedicated note in the configured task folder for easy auditing.
- **Weight calibration** prompts to store wet and ready-to-water pot weights per plant for reliable lift tests.
- **Configurable pot presets** so new plant notes can start with the right container size and medium.
- **Location & status updates** from a single command so you can quickly move a plant or mark it dormant/gifted.
- **Garden rotation helpers** with a crop template inserter that warns about conflicts and pre-fills sow windows from frost dates.
- **Fully local** operation. No network calls and no personal data leaves your vault.

## Commands

| Command | Description |
| ------- | ----------- |
| Plant: New plant | Creates a plant note using the configured template, substituting the ID, name, and today’s date. |
| Plant: Log water / Log feed | Updates the plant front matter, appends a task log note, and refreshes the Today view. Feeding honours winter and drought safeguards. |
| Plant: Snooze task | Pushes the next watering hint forward by the number of days you provide. |
| Plant: Calibrate pot weight | Stores wet and ready-to-water weights for the active plant. |
| Plant: Move plant / Mark status | Prompts for a new location and status (active, dormant, gifted, dead). |
| Garden: Insert crop template | Inserts a YAML snippet into a garden bed note, warning when rotation history conflicts with the configured gap. |

## Views

### Today view

Open from the leaf ribbon icon or the command palette. The view contains:

- **Overdue** – plants that exceeded their watering hint.
- **Today** – plants hitting the hint interval today.
- **Soon** – plants due within three days.
- **Winter-suppressed** – quiescent or winter-suppressed plants, shown for awareness.

Each entry shows the last logged watering date, the next hint, and buttons for logging water, logging feed, snoozing, or opening the note.

## Quick start

1. **Install and enable the plugin**
   - Open *Settings → Community plugins*, browse for **House and Garden Plant Manager**, and click *Install* then *Enable*.
   - If installing from source, copy the build output into `.obsidian/plugins/houseplant-garden-manager/` and enable the plugin from the same screen.
2. **Run the setup command**
   - Use the command palette to trigger **HaG-PM: Initialise vault folders**. This creates the plant, bed, and task folders when they do not yet exist.
3. **Adjust your defaults**
   - Follow the checklist in the [Settings](#settings) section to match your watering style, winter months, and note locations.
4. **Create your first plant**
   - Run **Plant: New plant** from the command palette, supply the plant name, and confirm the suggested file path.
   - Review the generated front matter and tweak the pot size, watering interval hint, or tags before saving.
5. **Log care tasks**
   - From the Today view or the plant note, run **Plant: Log water** or **Plant: Log feed** to append a task note and update the next due hint.
   - If you prefer weight-based watering, run **Plant: Calibrate pot weight** once per plant to store wet and ready-to-water baselines.

Keep the Today view pinned for a dashboard of overdue, due-today, and upcoming tasks. Snooze hints from the view when a plant feels wetter than expected.

## Settings

Open *Settings → Community plugins → HaG-PM* to review every control. The settings pane is organised into the following sections:

### Care defaults

| Setting | Description |
| ------- | ----------- |
| **Watering method** | Choose between `top-until-runoff` and `bottom-soak`. The selection updates the hint text shown in plant notes and the Today view. |
| **Flush salts every X months** | Sets a reminder interval for top-watering flushes when bottom watering is enabled. Enter `0` to disable the reminder. |
| **Fertiliser policy** | Controls when fertiliser prompts appear: `active-only`, `always`, or `paused`. Winter months still suppress prompts unless you set `always`. |
| **Winter months** | Configure which months count as winter in your region. The plugin pauses fertiliser suggestions during these months and highlights plants as winter-suppressed. |

### Vault structure

| Setting | Description |
| ------- | ----------- |
| **Plant folder** | Where new plant notes are created. The default is `Plants/`. Update the path if you keep plants in a different folder. |
| **Garden bed folder** | Destination for garden bed notes. Used by the crop template command. |
| **Task log folder** | Where watering and fertilising logs are stored. Each log creates an individual markdown note in this folder. |
| **Plant template path** | Path to the markdown template used by **Plant: New plant**. The template should include the YAML front matter defined in [`Templates/plant.md`](Templates/plant.md). |

### Seasonal references

| Setting | Description |
| ------- | ----------- |
| **Default frost dates** | Provide the last spring frost date so the crop template command can pre-fill sow and harvest windows. Adjust for your local climate. |
| **Rotation gap** | The minimum number of seasons before planting the same crop family in a bed. Conflicts show up when inserting templates or viewing a bed note. |

### Per-plant calibration

| Setting | Description |
| ------- | ----------- |
| **Weight calibration data** | Displays stored wet and ready-to-water weight values per plant. These records are maintained automatically after you run **Plant: Calibrate pot weight**. Use the trash icon next to a plant entry to reset its calibration. |

After updating settings, visit the Today view to verify the hints match your expectations. You can tweak individual plants by editing their front matter without changing the global defaults.

## Installation

### From source

1. `npm install`
2. `npm run build`
3. Copy the contents of `dist/` (including `manifest.json`, `main.js`, `styles.css`, and `versions.json` if present) into your vault under `.obsidian/plugins/houseplant-garden-manager/`.
4. Enable *House and Garden Plant Manager* from Obsidian’s community plugins screen.

### Development build

1. `npm install`
2. `npm run dev`
3. Symlink or copy the repository into your vault’s plugins folder. The development build writes to `dist/` on changes.

## Compatibility

- Minimum Obsidian version: 1.5.0
- Desktop and mobile supported (no desktop-only APIs used).

## Privacy & Security

- No analytics, telemetry, or network requests.
- All plugin data remains inside your vault. Weight calibrations are stored in the plugin’s data JSON.
- The plugin respects the [Developer policies](https://docs.obsidian.md/Developer+policies) by avoiding code execution from untrusted sources and by not collecting user data.

## License

Released under the MIT License. See [LICENSE](./LICENSE) for details.

## Support

Please open an issue or submit a pull request if you find a bug or want to propose improvements. Contributions are welcome, but please ensure they remain in line with the official [submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins).
