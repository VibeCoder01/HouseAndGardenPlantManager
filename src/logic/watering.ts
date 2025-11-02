import type { Plant } from "../types";
import { addDays, todayYMD } from "../utils/dates";

export type WateringStatus = "overdue" | "due-today" | "soon" | "suppressed" | "not-due";

export interface WateringComputation {
  due: boolean;
  status: WateringStatus;
  reason: string;
  daysSince?: number;
  threshold?: number;
  nextDue?: string;
}

/** Determine if watering is due, using hints + checks + phase. */
export function computeWaterDue(p: Plant): WateringComputation {
  const today = todayYMD();
  const last = p.care?.water?.last;
  const hint = p.care?.water?.interval_days_hint ?? 7;
  const month = new Date().getMonth() + 1;
  const factor = seasonalWaterFactor(p, month);
  const threshold = Math.max(1, Math.round(hint / factor));

  if (!last) {
    return {
      due: true,
      status: "overdue",
      reason: "No watering logged yet",
      threshold,
      nextDue: today,
    };
  }

  const d1 = new Date(last);
  const d2 = new Date(today);
  const diffDays = Math.floor((d2.getTime() - d1.getTime()) / 86400000);
  const nextDue = addDays(last, threshold);

  if (diffDays < 0) {
    return {
      due: false,
      status: "not-due",
      reason: "Last watering logged in the future",
      daysSince: diffDays,
      threshold,
      nextDue,
    };
  }

  const winterSuppressed = p.growth_phase === "quiescent" || isSeasonallySuppressed(p, month);
  if (winterSuppressed && diffDays < threshold + 2) {
    const reason =
      p.growth_phase === "quiescent" ? "Quiescent phase" : "Seasonal pause";
    return {
      due: false,
      status: "suppressed",
      reason,
      daysSince: diffDays,
      threshold,
      nextDue,
    };
  }

  if (diffDays > threshold) {
    return {
      due: true,
      status: "overdue",
      reason: `${diffDays} days since last watering (target ${threshold})`,
      daysSince: diffDays,
      threshold,
      nextDue,
    };
  }

  if (diffDays === threshold) {
    return {
      due: true,
      status: "due-today",
      reason: "Hit interval hint",
      daysSince: diffDays,
      threshold,
      nextDue,
    };
  }

  const daysRemaining = threshold - diffDays;
  if (daysRemaining <= 3) {
    return {
      due: false,
      status: "soon",
      reason: `Due in ${daysRemaining} day(s)`,
      daysSince: diffDays,
      threshold,
      nextDue,
    };
  }

  return {
    due: false,
    status: "not-due",
    reason: `${daysRemaining} day(s) until hint interval`,
    daysSince: diffDays,
    threshold,
    nextDue,
  };
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

function isSeasonallySuppressed(p: Plant, month: number): boolean {
  const overrides = p.seasonal_overrides ?? [];
  for (const o of overrides) {
    if (!o.months?.includes(month)) continue;
    if (o.fertilise === "pause") {
      return true;
    }
  }
  return false;
}
