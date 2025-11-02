import { requestUrl } from "obsidian";
import { IndexedDbCache } from "../storage/IndexedDbCache";

export interface SeasonalTrendPoint {
  month: number; // 1-12
  temperatureC?: number;
  precipitationMm?: number;
}

export class OpenMeteoClient {
  constructor(private readonly cache = new IndexedDbCache("pgm-open-meteo")) {}

  async getSeasonalTrends(latitude: number, longitude: number): Promise<SeasonalTrendPoint[]> {
    const cacheKey = `trend:${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = await this.cache.get<SeasonalTrendPoint[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const now = new Date();
    const endYear = now.getFullYear() - 1;
    const startYear = endYear - 9;
    const url =
      `https://climate-api.open-meteo.com/v1/climate?latitude=${latitude}&longitude=${longitude}` +
      `&start_year=${startYear}&end_year=${endYear}&models=ERA5`;

    try {
      const response = await requestUrl({ url });
      const data = response.json as any;
      const monthly = data?.monthly ?? {};
      const temps: number[] | undefined = monthly.temperature_2m_mean;
      const precipitation: number[] | undefined = monthly.precipitation_sum;
      const result: SeasonalTrendPoint[] = [];
      for (let month = 1; month <= 12; month++) {
        const idx = month - 1;
        result.push({
          month,
          temperatureC: temps?.[idx] !== undefined ? roundNumber(temps[idx]) : undefined,
          precipitationMm: precipitation?.[idx] !== undefined ? roundNumber(precipitation[idx]) : undefined,
        });
      }
      await this.cache.set(cacheKey, result, { ttlMs: 1000 * 60 * 60 * 24 });
      return result;
    } catch (error) {
      console.error("OpenMeteoClient failed to fetch climate data", error);
      return [];
    }
  }
}

export function parseLocationCoordinates(location: string): { latitude: number; longitude: number } | null {
  if (!location) return null;
  const trimmed = location.trim();
  const match = trimmed.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (match) {
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  // Allow common shorthand keywords for convenience
  const lowered = trimmed.toLowerCase();
  switch (lowered) {
    case "london":
      return { latitude: 51.5072, longitude: -0.1276 };
    case "new york":
    case "nyc":
      return { latitude: 40.7128, longitude: -74.006 }; // approximate
    case "sydney":
      return { latitude: -33.8688, longitude: 151.2093 };
    default:
      return null;
  }
}

export function findTrendForMonth(
  trends: SeasonalTrendPoint[],
  month: number,
): SeasonalTrendPoint | undefined {
  return trends.find((point) => point.month === month);
}

function roundNumber(value: number): number {
  return Math.round(value * 10) / 10;
}
