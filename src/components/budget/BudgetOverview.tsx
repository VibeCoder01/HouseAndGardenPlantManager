import type {
  BudgetSummary,
  CategorySummary,
  RecurringCostDue,
} from "../../features/budget";

export interface BudgetOverviewOptions {
  onCategorySelect?: (categoryId: string) => void;
  showRecurringBreakdown?: boolean;
  currencyFormatter?: Intl.NumberFormat;
}

export function createBudgetOverview(
  summary: BudgetSummary,
  options: BudgetOverviewOptions = {},
): HTMLElement {
  const root = document.createElement("div");
  root.addClass("pgm-budget-overview");

  const heading = root.createEl("div", { cls: "pgm-budget-overview-header" });
  heading.createEl("h4", { text: summary.name });
  const totals = heading.createDiv({ cls: "pgm-budget-overview-total" });
  totals.setText(
    `${formatCurrency(summary.totalSpent, summary.currency, options.currencyFormatter)} spent of ${formatCurrency(summary.totalLimit, summary.currency, options.currencyFormatter)} • ${formatCurrency(summary.remaining, summary.currency, options.currencyFormatter)} remaining`,
  );

  const table = root.createEl("table", { cls: "pgm-budget-overview-table" });
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  headerRow.createEl("th", { text: "Category" });
  headerRow.createEl("th", { text: "Limit" });
  headerRow.createEl("th", { text: "Spent" });
  headerRow.createEl("th", { text: "Remaining" });
  headerRow.createEl("th", { text: "Usage" });
  if (options.showRecurringBreakdown) {
    headerRow.createEl("th", { text: "Recurring / month" });
  }

  const tbody = table.createEl("tbody");
  for (const category of summary.categories) {
    tbody.appendChild(renderCategoryRow(category, summary.currency, options));
  }

  const recurringMeta = root.createDiv({ cls: "pgm-budget-overview-meta" });
  recurringMeta.setText(
    `Recurring commitments per month: ${formatCurrency(
      summary.recurringMonthlyTotal,
      summary.currency,
      options.currencyFormatter,
    )}`,
  );

  renderRecurringSection(root, summary.upcomingRecurring, summary.currency, options);

  return root;
}

function renderCategoryRow(
  categorySummary: CategorySummary,
  currency: string,
  options: BudgetOverviewOptions,
): HTMLTableRowElement {
  const row = document.createElement("tr");
  row.addClass("pgm-budget-overview-row");
  row.createEl("td", { text: categorySummary.category.name });
  row.createEl("td", {
    text: formatCurrency(categorySummary.category.limit, currency, options.currencyFormatter),
  });
  row.createEl("td", { text: formatCurrency(categorySummary.spent, currency, options.currencyFormatter) });
  row.createEl("td", {
    text: formatCurrency(categorySummary.remaining, currency, options.currencyFormatter),
  });
  const usageCell = row.createEl("td", { cls: "pgm-budget-overview-usage" });
  usageCell.setText(`${categorySummary.percentUsed}%`);

  if (options.showRecurringBreakdown) {
    row.createEl("td", {
      text: formatCurrency(categorySummary.recurringMonthly, currency, options.currencyFormatter),
    });
  }

  if (options.onCategorySelect) {
    row.addClass("is-clickable");
    row.addEventListener("click", () => options.onCategorySelect?.(categorySummary.category.id));
  }

  return row;
}

function renderRecurringSection(
  container: HTMLElement,
  upcoming: RecurringCostDue[],
  currency: string,
  options: BudgetOverviewOptions,
) {
  const section = container.createDiv({ cls: "pgm-budget-overview-recurring" });
  const title = section.createEl("h5", { text: "Upcoming recurring costs" });
  title.addClass("pgm-section-heading");

  if (!upcoming.length) {
    section.createSpan({ text: "No recurring costs due soon." }).addClass("pgm-empty");
    return;
  }

  const list = section.createEl("ul", { cls: "pgm-recurring-list" });
  for (const entry of upcoming) {
    const item = list.createEl("li", { cls: "pgm-recurring-item" });
    const amount = formatCurrency(entry.cost.amount, currency, options.currencyFormatter);
    const dueText = entry.daysUntilDue === 0
      ? "Due today"
      : entry.daysUntilDue === 1
        ? "Due tomorrow"
        : `Due in ${entry.daysUntilDue} days`;
    item.setText(`${entry.cost.name} • ${amount} • ${dueText}`);
  }
}

function formatCurrency(
  value: number,
  currency: string,
  formatter?: Intl.NumberFormat,
): string {
  const format =
    formatter ??
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
    });
  return format.format(value);
}
