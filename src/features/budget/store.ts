import {
  Budget,
  BudgetCategory,
  BudgetCreateInput,
  BudgetExpense,
  BudgetSnapshot,
  BudgetSummary,
  BudgetSummaryOptions,
  BudgetUpdateInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  ExpenseCreateInput,
  ExpenseUpdateInput,
  RecurringCost,
  RecurringCostCreateInput,
  RecurringCostDue,
  RecurringCostUpdateInput,
  createDefaultBudget,
  createEmptyBudgetSnapshot,
} from "./models";
import { calculateBudgetSummary } from "./summary";
import { applyRecurringUpdate, computeNextRecurringDue } from "./recurring";
import { todayYMD } from "../../utils/dates";

export interface BudgetStorage {
  load(): Promise<BudgetSnapshot | null>;
  save(snapshot: BudgetSnapshot): Promise<void>;
}

export class InMemoryBudgetStorage implements BudgetStorage {
  private snapshot: BudgetSnapshot = createEmptyBudgetSnapshot();

  async load(): Promise<BudgetSnapshot> {
    return structuredCloneIfAvailable(this.snapshot);
  }

  async save(snapshot: BudgetSnapshot): Promise<void> {
    this.snapshot = structuredCloneIfAvailable(snapshot);
  }
}

export class BudgetStore {
  private readonly budgets = new Map<string, Budget>();
  private loaded = false;

  constructor(private readonly storage: BudgetStorage) {}

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const snapshot = (await this.storage.load()) ?? createEmptyBudgetSnapshot();
    this.budgets.clear();
    for (const budget of snapshot.budgets ?? []) {
      this.budgets.set(budget.id, normalizeBudget(budget));
    }
    this.loaded = true;
  }

  async listBudgets(): Promise<Budget[]> {
    await this.ensureLoaded();
    return [...this.budgets.values()].map(cloneBudget).sort(byName);
  }

  async getBudget(id: string): Promise<Budget | null> {
    await this.ensureLoaded();
    const found = this.budgets.get(id);
    return found ? cloneBudget(found) : null;
  }

  async createBudget(input: BudgetCreateInput): Promise<Budget> {
    await this.ensureLoaded();
    const id = generateId();
    const budget = createDefaultBudget({ ...input, id });
    this.budgets.set(id, budget);
    await this.persist();
    return cloneBudget(budget);
  }

  async updateBudget(id: string, patch: BudgetUpdateInput): Promise<Budget> {
    await this.ensureLoaded();
    const budget = this.requireBudget(id);
    const updated: Budget = {
      ...budget,
      name: patch.name?.trim() ?? budget.name,
      currency: patch.currency ?? budget.currency,
      period: patch.period ?? budget.period,
      startDate: patch.startDate ?? budget.startDate,
      endDate: patch.endDate === null ? undefined : patch.endDate ?? budget.endDate,
      notes: patch.notes === null ? undefined : patch.notes ?? budget.notes,
      updatedAt: new Date().toISOString(),
    };
    this.budgets.set(id, updated);
    await this.persist();
    return cloneBudget(updated);
  }

  async deleteBudget(id: string): Promise<void> {
    await this.ensureLoaded();
    this.budgets.delete(id);
    await this.persist();
  }

  async createCategory(budgetId: string, input: CategoryCreateInput): Promise<BudgetCategory> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    const category: BudgetCategory = {
      id: generateId(),
      name: input.name.trim(),
      limit: Math.max(0, Number(input.limit) || 0),
      color: input.color,
      note: input.note,
    };
    budget.categories.push(category);
    budget.updatedAt = new Date().toISOString();
    this.budgets.set(budgetId, budget);
    await this.persist();
    return { ...category };
  }

  async updateCategory(
    budgetId: string,
    categoryId: string,
    patch: CategoryUpdateInput,
  ): Promise<BudgetCategory> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    const category = budget.categories.find((cat) => cat.id === categoryId);
    if (!category) {
      throw new Error(`Category ${categoryId} not found in budget ${budgetId}`);
    }
    category.name = patch.name?.trim() ?? category.name;
    if (patch.limit !== undefined) {
      category.limit = Math.max(0, Number(patch.limit) || 0);
    }
    category.color = patch.color === undefined ? category.color : patch.color ?? undefined;
    category.note = patch.note === undefined ? category.note : patch.note ?? undefined;
    budget.updatedAt = new Date().toISOString();
    await this.persist();
    return { ...category };
  }

  async deleteCategory(budgetId: string, categoryId: string): Promise<void> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    budget.categories = budget.categories.filter((cat) => cat.id !== categoryId);
    budget.expenses = budget.expenses.filter((expense) => expense.categoryId !== categoryId);
    budget.recurringCosts = budget.recurringCosts.map((cost) =>
      cost.categoryId === categoryId ? { ...cost, categoryId: undefined } : cost,
    );
    budget.updatedAt = new Date().toISOString();
    this.budgets.set(budgetId, budget);
    await this.persist();
  }

  async logExpense(budgetId: string, input: ExpenseCreateInput): Promise<BudgetExpense> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    this.ensureCategoryExists(budget, input.categoryId);
    const nowIso = new Date().toISOString();
    const expense: BudgetExpense = {
      id: generateId(),
      categoryId: input.categoryId,
      amount: Number(input.amount) || 0,
      description: input.description.trim(),
      date: input.date || todayYMD(),
      note: input.note,
      tags: input.tags ?? [],
      receiptUrl: input.receiptUrl,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    budget.expenses.push(expense);
    budget.updatedAt = nowIso;
    await this.persist();
    return cloneExpense(expense);
  }

  async updateExpense(
    budgetId: string,
    expenseId: string,
    patch: ExpenseUpdateInput,
  ): Promise<BudgetExpense> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    const expense = budget.expenses.find((item) => item.id === expenseId);
    if (!expense) {
      throw new Error(`Expense ${expenseId} not found in budget ${budgetId}`);
    }
    if (patch.categoryId !== undefined) {
      if (patch.categoryId !== null) {
        this.ensureCategoryExists(budget, patch.categoryId);
        expense.categoryId = patch.categoryId;
      }
    }
    if (patch.amount !== undefined) {
      expense.amount = Number(patch.amount) || 0;
    }
    expense.description = patch.description?.trim() ?? expense.description;
    expense.date = patch.date ?? expense.date;
    expense.note = patch.note === undefined ? expense.note : patch.note ?? undefined;
    expense.tags = patch.tags ?? expense.tags;
    expense.receiptUrl =
      patch.receiptUrl === undefined ? expense.receiptUrl : patch.receiptUrl ?? undefined;
    expense.updatedAt = new Date().toISOString();
    budget.updatedAt = expense.updatedAt;
    await this.persist();
    return cloneExpense(expense);
  }

  async deleteExpense(budgetId: string, expenseId: string): Promise<void> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    budget.expenses = budget.expenses.filter((expense) => expense.id !== expenseId);
    budget.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async addRecurringCost(
    budgetId: string,
    input: RecurringCostCreateInput,
  ): Promise<RecurringCost> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    if (input.categoryId) {
      this.ensureCategoryExists(budget, input.categoryId);
    }
    const nowIso = new Date().toISOString();
    const cost: RecurringCost = {
      id: generateId(),
      name: input.name.trim(),
      amount: Number(input.amount) || 0,
      cadence: input.cadence,
      intervalDays: input.intervalDays,
      categoryId: input.categoryId,
      nextDue: input.nextDue,
      lastPaid: input.lastPaid,
      remindDaysBefore: input.remindDaysBefore ?? 2,
      note: input.note,
      active: input.active ?? true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    budget.recurringCosts.push(cost);
    budget.updatedAt = nowIso;
    await this.persist();
    return { ...cost };
  }

  async updateRecurringCost(
    budgetId: string,
    recurringId: string,
    patch: RecurringCostUpdateInput,
  ): Promise<RecurringCost> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    const index = budget.recurringCosts.findIndex((cost) => cost.id === recurringId);
    if (index === -1) {
      throw new Error(`Recurring cost ${recurringId} not found in budget ${budgetId}`);
    }
    if (patch.categoryId !== undefined && patch.categoryId !== null) {
      this.ensureCategoryExists(budget, patch.categoryId);
    }
    const updated = applyRecurringUpdate(budget.recurringCosts[index], patch);
    budget.recurringCosts[index] = updated;
    budget.updatedAt = updated.updatedAt;
    await this.persist();
    return { ...updated };
  }

  async removeRecurringCost(budgetId: string, recurringId: string): Promise<void> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    budget.recurringCosts = budget.recurringCosts.filter((cost) => cost.id !== recurringId);
    budget.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async markRecurringCostPaid(
    budgetId: string,
    recurringId: string,
    paidDate = todayYMD(),
  ): Promise<RecurringCost> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    const cost = budget.recurringCosts.find((item) => item.id === recurringId);
    if (!cost) {
      throw new Error(`Recurring cost ${recurringId} not found in budget ${budgetId}`);
    }
    cost.lastPaid = paidDate;
    cost.nextDue = computeNextRecurringDue(cost, paidDate);
    cost.updatedAt = new Date().toISOString();
    budget.updatedAt = cost.updatedAt;
    await this.persist();
    return { ...cost };
  }

  async getBudgetSummary(
    budgetId: string,
    options: BudgetSummaryOptions = {},
  ): Promise<BudgetSummary> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    return calculateBudgetSummary(budget, options);
  }

  async listBudgetSummaries(options: BudgetSummaryOptions = {}): Promise<BudgetSummary[]> {
    await this.ensureLoaded();
    return [...this.budgets.values()].map((budget) => calculateBudgetSummary(budget, options));
  }

  async findUpcomingRecurring(
    budgetId: string,
    options: { withinDays?: number; now?: Date } = {},
  ): Promise<RecurringCostDue[]> {
    await this.ensureLoaded();
    const budget = this.requireBudget(budgetId);
    const withinDays = Math.max(1, options.withinDays ?? 7);
    const now = options.now ?? new Date();
    return calculateBudgetSummary(budget, {
      today: now,
      upcomingWithinDays: withinDays,
    }).upcomingRecurring;
  }

  private requireBudget(id: string): Budget {
    const budget = this.budgets.get(id);
    if (!budget) {
      throw new Error(`Budget ${id} not found`);
    }
    return budget;
  }

  private ensureCategoryExists(budget: Budget, categoryId: string) {
    const exists = budget.categories.some((category) => category.id === categoryId);
    if (!exists) {
      throw new Error(`Category ${categoryId} not found in budget ${budget.id}`);
    }
  }

  private async persist(): Promise<void> {
    const snapshot: BudgetSnapshot = {
      budgets: [...this.budgets.values()].map(cloneBudget),
    };
    await this.storage.save(snapshot);
  }
}

function structuredCloneIfAvailable<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function cloneBudget(budget: Budget): Budget {
  return {
    ...budget,
    categories: budget.categories.map((category) => ({ ...category })),
    expenses: budget.expenses.map(cloneExpense),
    recurringCosts: budget.recurringCosts.map((cost) => ({ ...cost })),
  };
}

function cloneExpense(expense: BudgetExpense): BudgetExpense {
  return { ...expense, tags: expense.tags ? [...expense.tags] : [] };
}

function normalizeBudget(budget: Budget): Budget {
  return {
    ...budget,
    categories: budget.categories?.map((category) => ({ ...category })) ?? [],
    expenses: budget.expenses?.map(cloneExpense) ?? [],
    recurringCosts: budget.recurringCosts?.map((cost) => ({ ...cost })) ?? [],
  };
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `budget-${Math.random().toString(36).slice(2, 10)}`;
}

function byName(a: Budget, b: Budget): number {
  return a.name.localeCompare(b.name);
}
