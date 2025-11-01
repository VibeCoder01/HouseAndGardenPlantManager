import type { LightLevel } from "../types";

export type HumidityPreference = "low" | "medium" | "high";

export interface HouseplantCatalogEntry {
  kind: "house";
  common: string;
  latin: string;
  light: LightLevel;
  water_interval_days_hint: number;
  humidity: HumidityPreference;
  feeding_interval_weeks: number;
  summary: string;
  pet_safe?: boolean;
}

export type GardenSunExposure = "full-sun" | "partial-sun" | "partial-shade" | "shade";

export interface GardenPlantCatalogEntry {
  kind: "garden";
  common: string;
  latin: string;
  family: "brassicas" | "legumes" | "roots" | "alliums" | "solanaceae" | "cucurbits" | "misc";
  sun: GardenSunExposure;
  sow_indoors?: [string, string];
  sow_outdoors?: [string, string];
  harvest_window?: [string, string];
  spacing_cm?: number;
  frost_sensitive?: boolean;
  summary: string;
}

export type PlantCatalogEntry = HouseplantCatalogEntry | GardenPlantCatalogEntry;
