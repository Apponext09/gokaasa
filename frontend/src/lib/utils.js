import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and resolves Tailwind conflicts (later classes win). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Saves a Blob the server returned (a CSV export, an invoice PDF) as a file, entirely client-side. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
