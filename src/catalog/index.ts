export { HOUSEPLANT_CATALOG } from "./houseplants";
export { GARDEN_PLANT_CATALOG } from "./gardenPlants";
export type {
  HouseplantCatalogEntry,
  GardenPlantCatalogEntry,
  PlantCatalogEntry,
  GardenSunExposure,
  HumidityPreference,
} from "./types";

export function findHouseplantByName(name: string) {
  const normalised = name.trim().toLowerCase();
  return HOUSEPLANT_CATALOG.find((entry) => entry.common.toLowerCase() === normalised);
}

export function findGardenPlantByName(name: string) {
  const normalised = name.trim().toLowerCase();
  return GARDEN_PLANT_CATALOG.find((entry) => entry.common.toLowerCase() === normalised);
}
