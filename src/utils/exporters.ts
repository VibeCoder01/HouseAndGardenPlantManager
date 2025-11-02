import type { BudgetExpense, BudgetSummary, CategorySummary } from "../features/budget";

export function exportBudgetSummaryToCSV(summary: BudgetSummary): string {
  const rows: string[][] = [];
  rows.push(["Budget", summary.name]);
  rows.push(["Currency", summary.currency]);
  rows.push(["Total limit", formatNumber(summary.totalLimit)]);
  rows.push(["Total spent", formatNumber(summary.totalSpent)]);
  rows.push(["Remaining", formatNumber(summary.remaining)]);
  rows.push(["Recurring monthly", formatNumber(summary.recurringMonthlyTotal)]);
  rows.push([]);
  const header = [
    "Category",
    "Limit",
    "Spent",
    "Remaining",
    "Usage %",
    "Recurring / month",
  ];
  rows.push(header);
  for (const category of summary.categories) {
    rows.push(formatCategoryRow(category));
  }
  if (summary.upcomingRecurring.length) {
    rows.push([]);
    rows.push(["Upcoming recurring costs"]);
    rows.push(["Name", "Amount", "Due in days", "Next due"]);
    for (const item of summary.upcomingRecurring) {
      rows.push([
        item.cost.name,
        formatNumber(item.cost.amount),
        String(item.daysUntilDue),
        item.cost.nextDue,
      ]);
    }
  }
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function exportBudgetExpensesToCSV(
  summary: BudgetSummary,
  expenses: BudgetExpense[],
): string {
  const rows: string[][] = [];
  rows.push(["Date", "Category", "Description", "Amount", "Notes", "Tags", "Receipt"]);
  const categoryMap = new Map(summary.categories.map((item) => [item.category.id, item.category.name]));
  const sortedExpenses = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  for (const expense of sortedExpenses) {
    rows.push([
      expense.date,
      categoryMap.get(expense.categoryId) ?? "Uncategorised",
      expense.description,
      formatNumber(expense.amount),
      expense.note ?? "",
      expense.tags?.join("|") ?? "",
      expense.receiptUrl ?? "",
    ]);
  }
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function generateBudgetReportPDF(
  summary: BudgetSummary,
  expenses: BudgetExpense[] = [],
): Uint8Array {
  const lines: string[] = [];
  lines.push(`Budget report: ${summary.name}`);
  lines.push(`Period: ${summary.period}`);
  lines.push(`Currency: ${summary.currency}`);
  lines.push(`Total limit: ${formatNumber(summary.totalLimit)}`);
  lines.push(`Total spent: ${formatNumber(summary.totalSpent)}`);
  lines.push(`Remaining: ${formatNumber(summary.remaining)}`);
  lines.push(
    `Recurring monthly commitments: ${formatNumber(summary.recurringMonthlyTotal)}`,
  );
  lines.push("");
  lines.push("Category breakdown:");
  for (const category of summary.categories) {
    lines.push(
      `• ${category.category.name}: ${formatNumber(category.spent)} spent of ${formatNumber(category.category.limit)} (${category.percentUsed}% used)`,
    );
  }
  if (summary.upcomingRecurring.length) {
    lines.push("");
    lines.push("Upcoming recurring costs:");
    for (const item of summary.upcomingRecurring) {
      lines.push(
        `• ${item.cost.name} — ${formatNumber(item.cost.amount)} due in ${item.daysUntilDue} days (next: ${item.cost.nextDue})`,
      );
    }
  }
  if (expenses.length) {
    lines.push("");
    lines.push("Logged expenses:");
    const categoryMap = new Map(summary.categories.map((item) => [item.category.id, item.category.name]));
    const sortedExpenses = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
    for (const expense of sortedExpenses) {
      const categoryName = categoryMap.get(expense.categoryId) ?? "Uncategorised";
      const parts = [
        `${expense.date} — ${categoryName} — ${expense.description} (${formatNumber(expense.amount)})`,
      ];
      if (expense.note) {
        parts.push(`Note: ${expense.note}`);
      }
      if (expense.tags?.length) {
        parts.push(`Tags: ${expense.tags.join(", ")}`);
      }
      lines.push(parts.join(" | "));
    }
  }

  return buildPdfFromLines(lines);
}

function formatCategoryRow(category: CategorySummary): string[] {
  return [
    category.category.name,
    formatNumber(category.category.limit),
    formatNumber(category.spent),
    formatNumber(category.remaining),
    `${category.percentUsed}`,
    formatNumber(category.recurringMonthly),
  ];
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return value.toFixed(2);
}

function buildPdfFromLines(lines: string[]): Uint8Array {
  const textLines = lines.length ? lines : ["Budget report"];
  const textOps = textLines
    .map((line, index) =>
      index === 0
        ? `(${escapePdfText(line)}) Tj`
        : `T* (${escapePdfText(line)}) Tj`,
    )
    .join("\n");
  const stream = `BT\n/F1 12 Tf\n1 14 TL\n72 780 Td\n${textOps}\nET`;
  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(stream);
  const objects: string[] = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${streamBytes.length} >> stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  const header = "%PDF-1.4\n";
  const offsets: number[] = [];
  let position = header.length;
  for (const object of objects) {
    offsets.push(position);
    position += object.length;
  }
  const body = objects.join("");
  const xrefEntries = ["0000000000 65535 f \n", ...offsets.map((offset) => `${pad(offset, 10)} 00000 n \n`)];
  const xref = `xref\n0 ${objects.length + 1}\n${xrefEntries.join("")}`;
  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${header.length + body.length}\n%%EOF`;
  const pdfString = `${header}${body}${xref}${trailer}`;
  return encoder.encode(pdfString);
}

function pad(value: number, width: number): string {
  const text = Math.max(0, value).toString();
  if (text.length >= width) {
    return text.slice(-width);
  }
  return text.padStart(width, "0");
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
