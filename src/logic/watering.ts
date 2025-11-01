import type { Plant } from "../types";
import { todayYMD } from "../utils/dates";

/** Determine if watering is due, using hints + checks + phase. */
export function computeWaterDue(p: Plant, winterMonths: number[]): { due: boolean; reason: string } {
  // Simplified: due if no last, or hint interval elapsed and not winter-suppressed.
  const today = todayYMD();
  const last = p.care?.water?.last;
  const hint = p.care?.water?.interval_days_hint ?? 7;

  if (!last) return { due: true, reason: "No watering logged yet" };

  const d1 = new Date(last);
  const d2 = new Date(today);
  const diffDays = Math.floor((d2.getTime() - d1.getTime()) / 86400000);

  // Seasonal suppression for quiescent/winter
  const month = new Date().getMonth() + 1;
  const quiescent = p.growth_phase === "quiescent" || winterMonths.includes(month);

  const factor = seasonalWaterFactor(p, month);
  const threshold = Math.max(1, Math.round(hint / factor));

  if (quiescent && diffDays < threshold + 2) {
    return { due: false, reason: "Winter suppression" };
  }

  return diffDays >= threshold ? { due: true, reason: `>${threshold} days since last` } : { due: false, reason: `Only ${diffDays} days elapsed` };
}

function seasonalWaterFactor(p: Plant, month: number): number {
  const overrides = p.seasonal_overrides ?? [];
  for (const o of overrides) {
    if (o.months?.includes(month)) {
      return o.water_factor ?? 1;
    }
  }
  return 1;
}
