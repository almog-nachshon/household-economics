import { REVIEW_DAY } from "@/lib/portfolio";

// The deposit the plan is for: this month's 10th until (and including) the 10th, then next month's.
export function depositMonth(today = new Date()) {
  return new Date(today.getFullYear(), today.getMonth() + (today.getDate() <= REVIEW_DAY ? 0 : 1), 1);
}
export const depositDate = (month) => new Date(month.getFullYear(), month.getMonth(), REVIEW_DAY);
