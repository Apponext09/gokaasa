import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils.js';

/**
 * A premium, editorial tile for a destination/category/inspiration link. These are marketing content
 * (title + a real navigation target), not hotel records, so there is no backend-sourced photo to show --
 * one consistent brand gradient (the same one the hero already uses) stands in for photography rather
 * than a guessed/placeholder image URL.
 */
export function ShowcaseCard({ title, subtitle, href, className }) {
  return (
    <Link
      to={href}
      className={cn(
        'group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-5 text-white shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
        className,
      )}
    >
      <div className="space-y-1">
        <p className="font-[var(--font-display)] text-lg font-semibold tracking-tight">{title}</p>
        {subtitle && <p className="text-xs text-white/75">{subtitle}</p>}
        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-300 opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:opacity-100">
          Explore <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
