import { addDaysToDate, formatYMD, parseYMD } from "../../utils/dates";
import { showToast } from "../../components/alerts/toast";
import {
  Budget,
  RecurringCost,
  RecurringCostDue,
  RecurringCostUpdateInput,
} from "./models";

export interface RecurringReminderOptions {
  withinDays?: number;
  now?: Date;
  notified?: Set<string>;
}

export function computeNextRecurringDue(cost: RecurringCost, fromDate?: string): string {
  const reference = fromDate ? parseYMD(fromDate) : parseYMD(cost.nextDue);
  const effective = reference ?? new Date();
  switch (cost.cadence) {
    case "weekly":
      return formatYMD(addDaysToDate(effective, 7));
    case "monthly":
      return formatYMD(addMonthsPreserveDay(effective, 1));
    case "quarterly":
      return formatYMD(addMonthsPreserveDay(effective, 3));
    case "annual":
      return formatYMD(addMonthsPreserveDay(effective, 12));
    case "custom": {
      const interval = cost.intervalDays && cost.intervalDays > 0 ? cost.intervalDays : 30;
      return formatYMD(addDaysToDate(effective, interval));
    }
    default:
      return formatYMD(addMonthsPreserveDay(effective, 1));
  }
}

export function getRecurringCostsDueSoon(
  budget: Budget,
  options: RecurringReminderOptions = {},
): RecurringCostDue[] {
  const withinDays = Math.max(1, options.withinDays ?? 3);
  const now = options.now ?? new Date();
  const end = addDaysToDate(now, withinDays);
  const results: RecurringCostDue[] = [];
  for (const cost of budget.recurringCosts) {
    if (!cost.active) continue;
    const due = parseYMD(cost.nextDue);
    if (!due) continue;
    if (due < now || due > end) continue;
    const daysUntilDue = Math.max(0, Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    results.push({
      budgetId: budget.id,
      budgetName: budget.name,
      cost,
      daysUntilDue,
    });
  }
  results.sort((a, b) => {
    const byDate = a.cost.nextDue.localeCompare(b.cost.nextDue);
    if (byDate !== 0) return byDate;
    return a.cost.name.localeCompare(b.cost.name);
  });
  return results;
}

const defaultNotified = new Set<string>();

export function notifyRecurringCostsDueSoon(
  budgets: Budget[],
  options: RecurringReminderOptions = {},
): RecurringCostDue[] {
  const notified = options.notified ?? defaultNotified;
  const due: RecurringCostDue[] = [];
  for (const budget of budgets) {
    const matches = getRecurringCostsDueSoon(budget, options);
    for (const match of matches) {
      const key = `${match.budgetId}:${match.cost.id}:${match.cost.nextDue}`;
      if (notified.has(key)) {
        continue;
      }
      const message = buildReminderMessage(match);
      showToast(message);
      notified.add(key);
      due.push(match);
    }
  }
  return due;
}

export function applyRecurringUpdate(
  cost: RecurringCost,
  patch: RecurringCostUpdateInput,
): RecurringCost {
  const next: RecurringCost = {
    ...cost,
    name: patch.name?.trim() ?? cost.name,
    amount: patch.amount ?? cost.amount,
    cadence: patch.cadence ?? cost.cadence,
    intervalDays:
      patch.intervalDays === undefined ? cost.intervalDays : patch.intervalDays ?? undefined,
    categoryId: patch.categoryId === undefined ? cost.categoryId : patch.categoryId ?? undefined,
    nextDue: patch.nextDue ?? cost.nextDue,
    lastPaid: patch.lastPaid ?? cost.lastPaid,
    remindDaysBefore: patch.remindDaysBefore ?? cost.remindDaysBefore,
    note: patch.note === undefined ? cost.note : patch.note ?? undefined,
    active: patch.active ?? cost.active,
    updatedAt: new Date().toISOString(),
  };
  return next;
}

function addMonthsPreserveDay(date: Date, months: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
  // If the date overflowed (e.g., Jan 31 -> Feb 31 -> Mar 3), adjust to last day of month
  if (next.getDate() !== date.getDate()) {
    next.setDate(0);
  }
  return next;
}

function buildReminderMessage(match: RecurringCostDue): string {
  const amount = match.cost.amount.toFixed(2);
  const suffix = match.budgetName ? ` — ${match.budgetName}` : "";
  if (match.daysUntilDue === 0) {
    return `Recurring cost due today • ${match.cost.name} (${amount})${suffix}`;
  }
  if (match.daysUntilDue === 1) {
    return `Recurring cost due tomorrow • ${match.cost.name} (${amount})${suffix}`;
  }
  return `Recurring cost due in ${match.daysUntilDue} days • ${match.cost.name} (${amount})${suffix}`;
}
