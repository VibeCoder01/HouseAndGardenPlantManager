import { addDaysToDate, parseYMD } from "../../utils/dates";
import {
  Budget,
  BudgetSummary,
  BudgetSummaryOptions,
  CategorySummary,
  RecurringCost,
  RecurringCostDue,
} from "./models";

export function calculateBudgetSummary(
  budget: Budget,
  options: BudgetSummaryOptions = {},
): BudgetSummary {
  const startDate = options.startDate ? parseYMD(options.startDate) : null;
  const endDate = options.endDate ? parseYMD(options.endDate) : null;
  const today = options.today ?? new Date();
  const upcomingWindow = Math.max(1, options.upcomingWithinDays ?? 7);

  const categorySpend = new Map<string, number>();
  let totalSpent = 0;

  for (const expense of budget.expenses) {
    const expenseDate = parseYMD(expense.date);
    if (!expenseDate) continue;
    if (startDate && expenseDate < startDate) continue;
    if (endDate && expenseDate > endDate) continue;
    const current = categorySpend.get(expense.categoryId) ?? 0;
    const amount = normaliseCurrency(expense.amount);
    categorySpend.set(expense.categoryId, current + amount);
    totalSpent += amount;
  }

  const categories: CategorySummary[] = budget.categories.map((category) => {
    const spent = categorySpend.get(category.id) ?? 0;
    const limit = normaliseCurrency(category.limit);
    const remaining = limit - spent;
    const percentUsed = limit > 0 ? clampPercent((spent / limit) * 100) : spent > 0 ? 100 : 0;
    const recurringMonthly = budget.recurringCosts
      .filter((cost) => cost.active && cost.categoryId === category.id)
      .reduce((total, cost) => total + estimateMonthlyCost(cost), 0);

    return {
      category,
      spent: roundCurrency(spent),
      remaining: roundCurrency(remaining),
      percentUsed,
      recurringMonthly: roundCurrency(recurringMonthly),
    };
  });

  const totalLimit = budget.categories
    .map((category) => normaliseCurrency(category.limit))
    .reduce((sum, value) => sum + value, 0);

  const recurringMonthlyTotal = budget.recurringCosts
    .filter((cost) => cost.active)
    .reduce((sum, cost) => sum + estimateMonthlyCost(cost), 0);

  const upcomingRecurring = collectUpcomingRecurring(
    budget,
    today,
    upcomingWindow,
  );

  return {
    budgetId: budget.id,
    name: budget.name,
    currency: budget.currency,
    period: budget.period,
    startDate: budget.startDate,
    endDate: budget.endDate,
    totalLimit: roundCurrency(totalLimit),
    totalSpent: roundCurrency(totalSpent),
    remaining: roundCurrency(totalLimit - totalSpent),
    categories,
    recurringMonthlyTotal: roundCurrency(recurringMonthlyTotal),
    upcomingRecurring,
  };
}

function collectUpcomingRecurring(
  budget: Budget,
  today: Date,
  upcomingWindow: number,
): RecurringCostDue[] {
  const end = addDaysToDate(today, upcomingWindow);
  const upcoming: RecurringCostDue[] = [];
  for (const cost of budget.recurringCosts) {
    if (!cost.active) continue;
    const due = parseYMD(cost.nextDue);
    if (!due) continue;
    if (due < today) continue;
    if (due > end) continue;
    const daysUntilDue = Math.max(0, Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    upcoming.push({
      budgetId: budget.id,
      budgetName: budget.name,
      cost,
      daysUntilDue,
    });
  }
  upcoming.sort((a, b) => {
    const dateA = a.cost.nextDue.localeCompare(b.cost.nextDue);
    if (dateA !== 0) return dateA;
    return a.cost.name.localeCompare(b.cost.name);
  });
  return upcoming;
}

function estimateMonthlyCost(cost: RecurringCost): number {
  const base = normaliseCurrency(cost.amount);
  switch (cost.cadence) {
    case "weekly":
      return (base * 52) / 12;
    case "monthly":
      return base;
    case "quarterly":
      return base / 3;
    case "annual":
      return base / 12;
    case "custom": {
      const interval = cost.intervalDays && cost.intervalDays > 0 ? cost.intervalDays : 30;
      return (base * 30) / interval;
    }
    default:
      return base;
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 999) return 999;
  return Math.round(value * 10) / 10;
}

function normaliseCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
