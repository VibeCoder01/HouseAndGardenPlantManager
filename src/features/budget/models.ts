import { todayYMD } from "../../utils/dates";

export type BudgetPeriod = "monthly" | "quarterly" | "annual" | "custom";
export type RecurringCadence = "weekly" | "monthly" | "quarterly" | "annual" | "custom";

export interface BudgetCategory {
  id: string;
  name: string;
  limit: number;
  color?: string;
  note?: string;
}

export interface BudgetExpense {
  id: string;
  categoryId: string;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  note?: string;
  tags?: string[];
  receiptUrl?: string;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface RecurringCost {
  id: string;
  name: string;
  amount: number;
  cadence: RecurringCadence;
  /** Required when cadence is "custom" */
  intervalDays?: number;
  categoryId?: string;
  nextDue: string; // YYYY-MM-DD
  lastPaid?: string; // YYYY-MM-DD
  remindDaysBefore: number;
  note?: string;
  active: boolean;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface Budget {
  id: string;
  name: string;
  currency: string;
  period: BudgetPeriod;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  notes?: string;
  categories: BudgetCategory[];
  expenses: BudgetExpense[];
  recurringCosts: RecurringCost[];
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface BudgetSnapshot {
  budgets: Budget[];
}

export interface ExpenseDraft {
  categoryId: string;
  amount: number;
  description: string;
  date: string;
  note?: string;
  tags?: string[];
  receiptUrl?: string;
}

export interface BudgetCreateInput {
  name: string;
  currency: string;
  period: BudgetPeriod;
  startDate?: string;
  endDate?: string;
  notes?: string;
  categories?: Array<Partial<Omit<BudgetCategory, "id">> & { id?: string }>;
}

export interface BudgetUpdateInput {
  name?: string;
  currency?: string;
  period?: BudgetPeriod;
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
}

export interface CategoryCreateInput {
  name: string;
  limit: number;
  color?: string;
  note?: string;
}

export interface CategoryUpdateInput {
  name?: string;
  limit?: number;
  color?: string | null;
  note?: string | null;
}

export interface ExpenseCreateInput extends ExpenseDraft {}

export interface ExpenseUpdateInput {
  categoryId?: string;
  amount?: number;
  description?: string;
  date?: string;
  note?: string | null;
  tags?: string[];
  receiptUrl?: string | null;
}

export interface RecurringCostCreateInput {
  name: string;
  amount: number;
  cadence: RecurringCadence;
  intervalDays?: number;
  categoryId?: string;
  nextDue: string;
  lastPaid?: string;
  remindDaysBefore?: number;
  note?: string;
  active?: boolean;
}

export interface RecurringCostUpdateInput {
  name?: string;
  amount?: number;
  cadence?: RecurringCadence;
  intervalDays?: number | null;
  categoryId?: string | null;
  nextDue?: string;
  lastPaid?: string | null;
  remindDaysBefore?: number;
  note?: string | null;
  active?: boolean;
}

export interface BudgetSummaryOptions {
  startDate?: string;
  endDate?: string;
  today?: Date;
  upcomingWithinDays?: number;
}

export interface CategorySummary {
  category: BudgetCategory;
  spent: number;
  remaining: number;
  percentUsed: number;
  recurringMonthly: number;
}

export interface BudgetSummary {
  budgetId: string;
  name: string;
  currency: string;
  period: BudgetPeriod;
  startDate: string;
  endDate?: string;
  totalLimit: number;
  totalSpent: number;
  remaining: number;
  categories: CategorySummary[];
  recurringMonthlyTotal: number;
  upcomingRecurring: RecurringCostDue[];
}

export interface RecurringCostDue {
  budgetId: string;
  budgetName: string;
  cost: RecurringCost;
  daysUntilDue: number;
}

export function createEmptyBudgetSnapshot(): BudgetSnapshot {
  return { budgets: [] };
}

export function createDefaultBudget(input: BudgetCreateInput & { id: string }): Budget {
  const nowIso = new Date().toISOString();
  return {
    id: input.id,
    name: input.name.trim(),
    currency: input.currency,
    period: input.period,
    startDate: input.startDate ?? todayYMD(),
    endDate: input.endDate,
    notes: input.notes,
    categories: (input.categories ?? []).map((category, index) => ({
      id: category.id ?? `${input.id}-cat-${index + 1}`,
      name: category.name?.trim() ?? `Category ${index + 1}`,
      limit: Number.isFinite(category.limit) ? Number(category.limit) : 0,
      color: category.color,
      note: category.note,
    })),
    expenses: [],
    recurringCosts: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
