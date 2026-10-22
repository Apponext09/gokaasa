import { Building2, Compass, HelpCircle, Palmtree, Wallet } from 'lucide-react';
import { t } from '@/features/support/bilingualContent.js';

/**
 * The first-time welcome experience: a short lead line plus a grid of quick actions that each trigger
 * REAL application behaviour (set a real propertyType and advance the real step machine, or navigate to
 * the real My Trips page) -- never a canned response with nothing behind it.
 */
export function AssistantWelcome({ lang, onFindHotels, onExploreDestinations, onFindResorts, onSearchByBudget, onHelpWithBooking, onUseExample }) {
  const actions = [
    { icon: Building2, title: t('quickFindHotelsTitle', lang), desc: t('quickFindHotelsDesc', lang), onClick: onFindHotels },
    { icon: Compass, title: t('quickExploreTitle', lang), desc: t('quickExploreDesc', lang), onClick: onExploreDestinations },
    { icon: Palmtree, title: t('quickFindResortsTitle', lang), desc: t('quickFindResortsDesc', lang), onClick: onFindResorts },
    { icon: Wallet, title: t('quickBudgetTitle', lang), desc: t('quickBudgetDesc', lang), onClick: onSearchByBudget },
    { icon: HelpCircle, title: t('quickHelpTitle', lang), desc: t('quickHelpDesc', lang), onClick: onHelpWithBooking },
  ];

  const examples = [t('examplePrompt1', lang), t('examplePrompt2', lang), t('examplePrompt3', lang)];

  return (
    <div className="space-y-3 pl-9">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map(({ icon: Icon, title, desc, onClick }) => (
          <button
            key={title}
            type="button"
            onClick={onClick}
            className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700">
              <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--text-strong)]">{title}</span>
              <span className="block text-xs text-[var(--text-muted)]">{desc}</span>
            </span>
          </button>
        ))}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t('examplePromptsLabel', lang)}</p>
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onUseExample(example)}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-body)] transition-colors hover:border-brand-400 hover:text-brand-700"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
