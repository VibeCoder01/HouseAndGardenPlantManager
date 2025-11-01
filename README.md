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

## Settings

Navigate to *Settings → Community plugins → HaG-PM* to configure:

- Watering method and fertiliser policy defaults.
- Winter months (used to suppress fertiliser prompts).
- Folder locations for plants, garden beds, and task logs.
- Plant template path.
- Pot presets for the new plant command.
- Default frost date for crop templates.
- Weight calibration data (stored automatically per plant).

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
