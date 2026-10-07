import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves Tailwind conflicts (later classes win). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
