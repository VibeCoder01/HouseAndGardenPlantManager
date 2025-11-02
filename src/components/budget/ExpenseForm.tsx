import type {
  BudgetCategory,
  ExpenseCreateInput,
} from "../../features/budget";
import { todayYMD } from "../../utils/dates";

export interface ExpenseFormProps {
  categories: BudgetCategory[];
  onSubmit: (expense: ExpenseCreateInput) => void;
  onCancel?: () => void;
  submitLabel?: string;
  initialValues?: Partial<ExpenseCreateInput>;
  showNotesField?: boolean;
}

export function createExpenseForm(props: ExpenseFormProps): HTMLFormElement {
  const form = document.createElement("form");
  form.addClass("pgm-expense-form");

  const errorBlock = form.createDiv({ cls: "pgm-expense-form-error" });
  errorBlock.style.display = "none";

  const categoryField = form.createDiv({ cls: "pgm-field" });
  const categoryId = uniqueId("pgm-expense-category");
  categoryField.createEl("label", { text: "Category", attr: { for: categoryId } });
  const categorySelect = categoryField.createEl("select", { attr: { id: categoryId } });
  populateCategoryOptions(categorySelect, props.categories, props.initialValues?.categoryId);

  const amountField = form.createDiv({ cls: "pgm-field" });
  const amountId = uniqueId("pgm-expense-amount");
  amountField.createEl("label", { text: "Amount", attr: { for: amountId } });
  const amountInput = amountField.createEl("input", {
    attr: {
      id: amountId,
      type: "number",
      step: "0.01",
      min: "0",
      placeholder: "0.00",
      value: props.initialValues?.amount?.toString() ?? "",
    },
  }) as HTMLInputElement;

  const dateField = form.createDiv({ cls: "pgm-field" });
  const dateId = uniqueId("pgm-expense-date");
  dateField.createEl("label", { text: "Date", attr: { for: dateId } });
  const dateInput = dateField.createEl("input", {
    attr: {
      id: dateId,
      type: "date",
      value: props.initialValues?.date ?? todayYMD(),
    },
  }) as HTMLInputElement;

  const descriptionField = form.createDiv({ cls: "pgm-field" });
  const descriptionId = uniqueId("pgm-expense-description");
  descriptionField.createEl("label", { text: "Description", attr: { for: descriptionId } });
  const descriptionInput = descriptionField.createEl("input", {
    attr: {
      id: descriptionId,
      type: "text",
      placeholder: "Fertiliser, soil, etc.",
      value: props.initialValues?.description ?? "",
    },
  }) as HTMLInputElement;

  let notesInput: HTMLTextAreaElement | null = null;
  if (props.showNotesField || props.initialValues?.note) {
    const notesField = form.createDiv({ cls: "pgm-field" });
    const notesId = uniqueId("pgm-expense-note");
    notesField.createEl("label", { text: "Notes", attr: { for: notesId } });
    notesInput = notesField.createEl("textarea", {
      attr: {
        id: notesId,
        rows: "3",
        placeholder: "Optional details",
      },
    }) as HTMLTextAreaElement;
    notesInput.value = props.initialValues?.note ?? "";
  }

  const actions = form.createDiv({ cls: "pgm-expense-actions" });
  const submitButton = actions.createEl("button", {
    text: props.submitLabel ?? "Log expense",
    attr: { type: "submit", cls: "mod-cta" },
  });
  submitButton.addClass("pgm-expense-submit");

  if (props.onCancel) {
    const cancelButton = actions.createEl("button", {
      text: "Cancel",
      attr: { type: "button" },
    });
    cancelButton.addClass("pgm-expense-cancel");
    cancelButton.addEventListener("click", () => props.onCancel?.());
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const rawAmount = Number(amountInput.value);
    const categoryIdValue = categorySelect.value;
    const description = descriptionInput.value.trim();
    if (!categoryIdValue) {
      return showError(errorBlock, "Select a category to log the expense.");
    }
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return showError(errorBlock, "Enter a valid amount greater than zero.");
    }
    if (!description.length) {
      return showError(errorBlock, "Provide a description for the expense.");
    }
    const payload: ExpenseCreateInput = {
      categoryId: categoryIdValue,
      amount: round(rawAmount),
      description,
      date: dateInput.value || todayYMD(),
      note: notesInput?.value?.trim() || undefined,
      tags: props.initialValues?.tags ?? [],
      receiptUrl: props.initialValues?.receiptUrl,
    };
    errorBlock.style.display = "none";
    props.onSubmit(payload);
  });

  return form;
}

function populateCategoryOptions(
  select: HTMLSelectElement,
  categories: BudgetCategory[],
  selectedId?: string,
) {
  while (select.firstChild) {
    select.removeChild(select.firstChild);
  }
  const placeholder = select.createEl("option", { value: "", text: "Select a category" });
  placeholder.disabled = true;
  placeholder.selected = !selectedId;
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
  for (const category of sorted) {
    const option = select.createEl("option", {
      value: category.id,
      text: category.name,
    });
    if (category.id === selectedId) {
      option.selected = true;
    }
  }
}

function showError(block: HTMLElement, message: string) {
  block.setText(message);
  block.style.display = "";
}

let uniqueCounter = 0;
function uniqueId(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}-${uniqueCounter}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
