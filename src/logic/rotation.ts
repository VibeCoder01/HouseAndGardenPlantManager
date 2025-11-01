import type { Bed } from "../types";

/** Return true if rotation conflict exists: same family in <gapYears>. */
export function hasRotationConflict(bed: Bed, historyFamilies: string[], gapYears = 3): boolean {
  // MVP placeholder: if history shows same family within window, conflict.
  if (!bed.rotation_group) return false;
  return historyFamilies.slice(0, gapYears).includes(bed.rotation_group);
}
