export type GrowthPhase = "auto" | "active" | "quiescent";
export type LightLevel = "low" | "medium" | "bright-indirect" | "full-sun";

export interface PotPreset {
  name: string;
  diameter_mm: number;
  volume_l: number;
  medium: string;
}

export interface Plant {
  id: string;
  type: "plant";
  common: string;
  latin?: string;
  acquired: string; // YYYY-MM-DD
  location: string;
  light: LightLevel;
  env?: { humidity_pct?: number; temp_c?: number };
  pot: { diameter_mm: number; volume_l: number; medium: string };
  growth_phase: GrowthPhase;
  seasonal_overrides?: Array<{ months: number[]; water_factor?: number; fertilise?: "pause" | "as-normal" }>;
  care: {
    water: {
      check: "finger" | "weight" | "meter" | "combo";
      target_rule: "pot_10pct_or_runoff" | "soak-then-drain";
      interval_days_hint?: number;
      last?: string; // YYYY-MM-DD
      flush_salts_months?: number;
    };
    fertilise: {
      during: "active_only" | "always" | "paused";
      cadence: "monthly" | "every_watering_quarter_strength";
      last?: string;
      product?: string;
    };
    prune?: { interval_days_hint?: number; last?: string };
    repot?: { last?: string; guidance?: "spring_preferred" };
  };
  status: "active" | "dormant" | "gifted" | "dead";
  water_quality?: { rest_tap_24h?: boolean };
  drought_stressed?: boolean;
  tags?: string[];
}

export interface BedCrop {
  crop: string;
  variety?: string;
  sow_window?: { outdoors?: [string, string] };
  harvest_window?: [string, string];
  sowed?: string;
  notes?: string[];
}

export interface Bed {
  id: string;
  type: "bed";
  name: string;
  location: string;
  size_m2?: number;
  soil: string;
  rotation_group: "brassicas" | "legumes" | "roots" | "alliums" | "solanaceae" | "cucurbits" | "misc";
  frost_context?: { last_spring_frost?: string };
  crops?: BedCrop[];
  care?: { water?: { check?: string; last?: string }; fertilise?: { type?: string; last?: string } };
  status?: "active" | "dormant";
  tags?: string[];
}

export type TaskAction = "water" | "fertilise" | "prune" | "repot" | "custom";
export interface PlantTask {
  type: "plant-task";
  plant_id: string;
  action: TaskAction;
  performed: string; // ISO datetime
  method?: string;
  amount_note?: string;
  note?: string;
}

export interface WeightCalibration {
  wet: number;
  ready: number;
  updated: string; // ISO datetime
}

export interface PluginSettings {
  watering_method: "top-until-runoff" | "bottom-soak";
  bottom_watering_mode: boolean;
  flush_salts_every_months: number;
  fertiliser_policy: "active-only" | "always" | "paused";
  winter_months_uk: number[];
  lift_test_hints: boolean;
  rotation_gap_years: number;
  default_frost_dates: { last_spring_frost: string };
  folders: { plants: string; beds: string; tasks: string };
  templates: { plant: string; bed: string };
  pot_presets: PotPreset[];
  calibration: Record<string, WeightCalibration>;
}
