import type { Plant, TaskAction } from "../types";
import {
  addDaysToDate,
  addMonths,
  addMonthsToDate,
  differenceInDays,
  differenceInMonths,
  endOfMonth,
  formatYMD,
  monthKey,
  parseYMD,
  startOfMonth,
} from "../utils/dates";

export type TaskIntensity = "normal" | "reduced" | "increased" | "paused";

export interface MonthlyTaskSummary {
  action: TaskAction;
  dueDates: string[];
  note?: string;
  intensity?: TaskIntensity;
}

export interface PlantMonthlySchedule {
  plantId: string;
  plantName: string;
  location: string;
  tasks: MonthlyTaskSummary[];
}

export interface MonthlySchedule {
  month: string; // YYYY-MM
  plants: PlantMonthlySchedule[];
}

export interface CalendarOptions {
  months?: number;
  startDate?: Date;
  winterMonths?: number[];
}

interface SeasonalOverride {
  months: number[];
  water_factor?: number;
  fertilise?: "pause" | "as-normal";
}

export function computeMonthlyCareSchedule(
  plants: Plant[],
  options: CalendarOptions = {},
): MonthlySchedule[] {
  const months = Math.max(1, options.months ?? 6);
  const baseDate = options.startDate ? startOfMonth(options.startDate) : startOfMonth(new Date());
  const result: MonthlySchedule[] = [];
  for (let offset = 0; offset < months; offset++) {
    const monthDate = addMonths(baseDate, offset);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const monthNumber = monthStart.getMonth() + 1;

    const plantsWithTasks: PlantMonthlySchedule[] = [];
    for (const plant of plants) {
      if (plant.status && plant.status !== "active") {
        continue;
      }
      const tasks = collectTasksForMonth(plant, monthStart, monthEnd, monthNumber, options);
      if (tasks.length === 0) continue;
      plantsWithTasks.push({
        plantId: plant.id,
        plantName: plant.common,
        location: plant.location,
        tasks,
      });
    }

    result.push({
      month: monthKey(monthStart),
      plants: plantsWithTasks,
    });
  }
  return result;
}

function collectTasksForMonth(
  plant: Plant,
  monthStart: Date,
  monthEnd: Date,
  monthNumber: number,
  options: CalendarOptions,
): MonthlyTaskSummary[] {
  const tasks: MonthlyTaskSummary[] = [];
  const override = findOverride(plant, monthNumber);

  const waterTask = computeWaterTasks(plant, monthStart, monthEnd, override);
  if (waterTask) {
    tasks.push(waterTask);
  }

  const fertiliseTask = computeFertiliseTasks(
    plant,
    monthStart,
    monthEnd,
    override,
    options.winterMonths,
  );
  if (fertiliseTask) {
    tasks.push(fertiliseTask);
  }

  const flushTask = computeFlushTask(plant, monthStart, monthEnd);
  if (flushTask) {
    tasks.push(flushTask);
  }

  const pruneTask = computeIntervalTask(plant, monthStart, monthEnd, "prune");
  if (pruneTask) {
    tasks.push(pruneTask);
  }

  const repotTask = computeRepotTask(plant, monthStart, monthNumber);
  if (repotTask) {
    tasks.push(repotTask);
  }

  return tasks;
}

function computeWaterTasks(
  plant: Plant,
  monthStart: Date,
  monthEnd: Date,
  override: SeasonalOverride | null,
): MonthlyTaskSummary | null {
  const water = plant.care?.water;
  if (!water) return null;

  const baseInterval = water.interval_days_hint ?? 7;
  const factor = typeof override?.water_factor === "number" && override.water_factor > 0 ? override.water_factor : 1;
  const adjustedInterval = Math.max(1, Math.round(baseInterval / factor));

  const dueDates: string[] = [];
  const lastWaterDate = parseYMD(water.last);
  let cursor = lastWaterDate ? addDaysToDate(lastWaterDate, adjustedInterval) : addDaysToDate(monthStart, Math.max(0, Math.round(adjustedInterval / 2)));

  while (cursor <= monthEnd) {
    if (cursor >= monthStart) {
      dueDates.push(formatYMD(cursor));
    }
    cursor = addDaysToDate(cursor, adjustedInterval);
  }

  if (dueDates.length === 0) {
    // Ensure at least one hint within the month for awareness
    const midpoint = addDaysToDate(monthStart, Math.max(1, Math.round(adjustedInterval)));
    if (midpoint <= monthEnd) {
      dueDates.push(formatYMD(midpoint));
    }
  }

  let intensity: TaskIntensity = "normal";
  if (factor < 1) intensity = "reduced";
  if (factor > 1) intensity = "increased";

  return {
    action: "water",
    dueDates,
    intensity,
    note: `Every ~${adjustedInterval} days${lastWaterDate ? " (based on last log)" : ""}`,
  };
}

function computeFertiliseTasks(
  plant: Plant,
  monthStart: Date,
  monthEnd: Date,
  override: SeasonalOverride | null,
  winterMonths: number[] | undefined,
): MonthlyTaskSummary | null {
  const fertilise = plant.care?.fertilise;
  if (!fertilise) return null;
  if (fertilise.during === "paused") return null;

  const monthNumber = monthStart.getMonth() + 1;
  if (override?.fertilise === "pause") {
    return {
      action: "fertilise",
      dueDates: [],
      intensity: "paused",
      note: "Seasonal pause",
    };
  }

  if (fertilise.during === "active_only" && winterMonths?.includes(monthNumber)) {
    return null;
  }

  const dueDates: string[] = [];
  if (fertilise.cadence === "monthly") {
    const lastFertilise = parseYMD(fertilise.last);
    if (lastFertilise) {
      let target = addMonthsToDate(lastFertilise, 1);
      while (target < monthStart) {
        target = addMonthsToDate(target, 1);
      }
      if (target <= monthEnd) {
        dueDates.push(formatYMD(target));
      }
    }
    if (!dueDates.length) {
      const span = Math.max(0, differenceInDays(monthEnd, monthStart));
      const midOffset = Math.min(14, span);
      const target = addDaysToDate(monthStart, midOffset);
      dueDates.push(formatYMD(target));
    }
  } else {
    // every watering quarter strength -> piggy-back on watering hints
    const waterTask = computeWaterTasks(plant, monthStart, monthEnd, override);
    if (waterTask) {
      dueDates.push(...waterTask.dueDates.slice(0, 2));
    }
  }

  if (!dueDates.length) {
    const span = Math.max(0, differenceInDays(monthEnd, monthStart));
    const fallback = addDaysToDate(monthStart, Math.min(21, span));
    dueDates.push(formatYMD(fallback));
  }

  return {
    action: "fertilise",
    dueDates: Array.from(new Set(dueDates)),
    intensity: "normal",
    note: fertilise.cadence === "monthly" ? "Monthly feed" : "Quarter-strength alongside watering",
  };
}

function computeFlushTask(
  plant: Plant,
  monthStart: Date,
  monthEnd: Date,
): MonthlyTaskSummary | null {
  const flushInterval = plant.care?.water?.flush_salts_months;
  if (!flushInterval || flushInterval <= 0) return null;

  const acquired = parseYMD(plant.acquired);
  if (!acquired) return null;

  const monthsSince = differenceInMonths(startOfMonth(monthStart), startOfMonth(acquired));
  if (monthsSince <= 0) return null;
  if (monthsSince % flushInterval !== 0) return null;

  const span = Math.max(0, differenceInDays(monthEnd, monthStart));
  const offset = Math.min(2, span);
  const dueDate = addDaysToDate(monthStart, offset);

  return {
    action: "flush",
    dueDates: [formatYMD(dueDate)],
    intensity: "normal",
    note: `Flush salts (every ${flushInterval} months)`,
  };
}

type IntervalTask = "prune";

function computeIntervalTask(
  plant: Plant,
  monthStart: Date,
  monthEnd: Date,
  kind: IntervalTask,
): MonthlyTaskSummary | null {
  const details = plant.care?.[kind];
  if (!details?.interval_days_hint) return null;

  const interval = Math.max(1, Math.round(details.interval_days_hint));
  const lastDate = parseYMD(details.last);
  let cursor = lastDate ? addDaysToDate(lastDate, interval) : addDaysToDate(monthStart, interval);
  const dueDates: string[] = [];
  while (cursor <= monthEnd) {
    if (cursor >= monthStart) {
      dueDates.push(formatYMD(cursor));
    }
    cursor = addDaysToDate(cursor, interval);
  }
  if (!dueDates.length) {
    const fallback = addDaysToDate(monthStart, interval);
    if (fallback <= monthEnd) dueDates.push(formatYMD(fallback));
  }

  return {
    action: kind,
    dueDates,
    note: `Every ~${interval} days`,
    intensity: "normal",
  };
}

function computeRepotTask(
  plant: Plant,
  monthStart: Date,
  monthNumber: number,
): MonthlyTaskSummary | null {
  const repot = plant.care?.repot;
  if (!repot) return null;

  const springMonths = new Set([3, 4, 5]);
  if (repot.guidance === "spring_preferred" && !springMonths.has(monthNumber)) {
    return null;
  }

  const lastRepot = parseYMD(repot.last);
  const referenceDate = lastRepot ?? parseYMD(plant.acquired);
  let intensity: TaskIntensity = "normal";
  if (referenceDate) {
    const monthsSince = differenceInMonths(startOfMonth(monthStart), startOfMonth(referenceDate));
    if (monthsSince < 12) {
      return null;
    }
    if (monthsSince >= 18) {
      intensity = "increased";
    }
  }

  const note = repot.guidance === "spring_preferred"
    ? intensity === "increased"
      ? "Spring repot window — overdue"
      : "Spring repot window"
    : intensity === "increased"
      ? "Repot if rootbound"
      : "Review pot size";

  return {
    action: "repot",
    dueDates: [formatYMD(monthStart)],
    intensity,
    note,
  };
}

function findOverride(plant: Plant, month: number): SeasonalOverride | null {
  const overrides = plant.seasonal_overrides as SeasonalOverride[] | undefined;
  if (!overrides) return null;
  for (const entry of overrides) {
    if (entry.months?.includes(month)) {
      return entry;
    }
  }
  return null;
}
