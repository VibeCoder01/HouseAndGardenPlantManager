import { Notice } from "obsidian";
import type { TaskAction } from "../../types";

const DEFAULT_TIMEOUT = 8000;

export function showToast(message: string, timeout = DEFAULT_TIMEOUT) {
  new Notice(message, timeout);
}

export function showUpcomingTaskToast(plantName: string, action: TaskAction, dueDate: string) {
  const prettyAction = action.charAt(0).toUpperCase() + action.slice(1);
  showToast(`Upcoming ${prettyAction} • ${plantName} on ${dueDate}`);
}
