# SPEC — Houseplant & Garden Manager MVP

## Goals
- Keep fields and commands lean.
- Guide watering by moisture checks and growth phase.
- Encourage restrained fertiliser use in winter.
- Support simple garden rotation and frost-date aware sowing windows.
- Work fully offline.

## Data Model

### 1) Plant front‑matter (`type: plant`)
```yaml
id: hp-<slug>                  # unique id per plant
type: plant
common: Spider Plant
latin: Chlorophytum comosum
acquired: 2024-11-02
location: Kitchen window
light: bright-indirect         # low | medium | bright-indirect | full-sun
env:
  humidity_pct:                # optional snapshot
  temp_c:
pot:
  diameter_mm: 120
  volume_l: 1.2
  medium: peat-free_multipurpose+perlite
growth_phase: auto             # auto | active | quiescent
seasonal_overrides:            # optional: month ranges adjust schedules
  - months: [11,12,1,2]        # late autumn–winter
    water_factor: 0.6          # multiply interval hints
    fertilise: pause
care:
  water:
    check: combo               # finger | weight | meter | combo
    target_rule: pot_10pct_or_runoff   # or soak-then-drain
    interval_days_hint: 7
    last: 2025-10-20
    flush_salts_months: 4      # optional periodic top-water flush reminder
  fertilise:
    during: active_only        # active_only | always | paused
    cadence: monthly           # monthly | every_watering_quarter_strength
    last: 2025-09-30
    product: balanced_10-10-10
  prune:
    interval_days_hint: 90
    last:
  repot:
    last: 2025-04-01
    guidance: spring_preferred
status: active                 # active | dormant | gifted | dead
water_quality:
  rest_tap_24h: false          # optional tip for chlorine-sensitive plants
drought_stressed: false        # if true, block feed until watered
tags: [houseplant, easy]
```
Principles:
- Intervals are hints only. Checks and phase drive due logic.
- Feeding defaults to active growing periods. Winter prompts suppressed.

### 2) Bed front‑matter (`type: bed`)
```yaml
id: bed-<slug>
type: bed
name: Raised Bed A
location: Garden NE
size_m2: 1.2
soil: loam
rotation_group: legumes        # brassicas | legumes | roots | alliums | solanaceae | cucurbits | misc
frost_context:
  last_spring_frost: 2025-04-10
crops:
  - crop: Carrot
    variety: Nantes
    sow_window:
      outdoors: [03-15, 07-15] # editable
    harvest_window: [06-20, 08-15]
    sowed: 2025-03-20
    notes: []
care:
  water:
    check: soil_surface+finger
    last: 2025-10-30
  fertilise:
    type: general_veg
    last: 2025-09-10
status: active
tags: [vegetables]
```
Principles:
- Enforce 3‑year gap for same family in the same bed.
- Sowing windows keyed to user frost dates.

### 3) Task log front‑matter (`type: plant-task`)
```yaml
type: plant-task
plant_id: hp-spider-1
action: water                 # water | fertilise | prune | repot | custom
performed: 2025-11-01T08:30
method: pot_10pct_or_runoff
amount_note: approx 120 ml; runoff observed
note: Slightly dry top 2 cm; pot felt light
```

## Derived Fields
- next_due.water: from checks + growth phase + seasonal modifiers.
- due flags: overdue, due today, due soon (3 days).
- garden rotation conflict: true if same family in < 3 seasons.

## Commands
1. **Plant: New plant** — prompt minimal fields. Create from template.
2. **Plant: Log water** — update `care.water.last` and write a task note.
3. **Plant: Log feed** — guard: block if `drought_stressed` or quiescent; allow override.
4. **Plant: Calibrate pot weight** — store wet and ready-to-water weights in hidden plugin cache.
5. **Plant: Snooze task** — push next due by N days.
6. **Plant: Move plant / Mark status** — quick updates.
7. **Garden: Insert crop template** — insert sow/harvest windows and rotation family; warn on 3‑year conflict.

## Views
### Today's Watering View
- Sections: Overdue, Today's Watering, Soon, Winter-suppressed.
- Display tip: "Log feeding before logging watering if you need to capture both."
- Each item: {name, action, last, hint, quick buttons [Water, Feed, Snooze]}.

### Plants View (vNext, optional)
- List and search plants. Sort by next due or location.

## Logic Summary
- **Watering**: “until runoff” default. If bottom-watering mode enabled, schedule periodic top-water flush every 4 months.
- **Feeding**: “active_only” default. Suppress in winter months. Suggest watering first.
- **Repot**: spring-preferred banner unless rootbound. User can mark rootbound to suppress warning.
- **Rotation**: 3‑year gap per family in each bed.
- **Frost**: sow‑window suggestions relative to `last_spring_frost` date.

## Settings
```yaml
watering_method: top-until-runoff         # or bottom-soak
bottom_watering_mode: false
flush_salts_every_months: 4
fertiliser_policy: active-only            # active-only | always | paused
winter_months_uk: [11,12,1,2]
lift_test_hints: true
rotation_gap_years: 3
default_frost_dates:
  last_spring_frost: 2025-04-10
folders:
  plants: Plants
  beds: GardenBeds
  tasks: PlantTasks
templates:
  plant: Templates/plant.md
```

## Non-goals for MVP
- No cloud sync or third-party APIs.
- No charts.
- No mobile camera integration.

## File Structure
```
/src
  main.ts
  settings.ts
  types.ts
  indexer.ts
  yamlIO.ts
  logic/watering.ts
  logic/rotation.ts
  utils/dates.ts
/schemas
  plant.schema.yaml
  bed.schema.yaml
  task.schema.yaml
/Templates/plant.md
/example_vault/...
```

## Testing
- Fixtures in `example_vault`. Simulate edits and ensure indexer recomputes dues and rotation flags.
- Manual E2E: create plant, log water/feed, snooze, move, and insert crop template.
