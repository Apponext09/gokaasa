import { ArrowUpRight, Building2, Compass, HelpCircle, Palmtree, Wallet } from 'lucide-react';
import { t } from '@/features/support/bilingualContent.js';

/**
 * Compact welcome experience for small concierge card.
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
    <div className="assistant-welcome space-y-2">
      <div className="assistant-welcome-grid grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {actions.map(({ icon: Icon, title, desc, onClick }) => (
          <button
            key={title}
            type="button"
            onClick={onClick}
            className="assistant-welcome-action group flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2 text-left transition-all hover:border-brand-300 hover:shadow-xs"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent-100 text-accent-700">
              <Icon className="h-3 w-3" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[var(--text-strong)] leading-tight">{title}</span>
              <span className="block text-[10px] text-[var(--text-muted)] line-clamp-1">{desc}</span>
            </span>
            <ArrowUpRight className="ml-auto h-3 w-3 shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-brand-600" aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="assistant-prompt-section pt-1">
        <p className="assistant-prompt-label text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] mb-1">{t('examplePromptsLabel', lang)}</p>
        <div className="assistant-prompt-rail flex flex-wrap gap-1">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onUseExample(example)}
              className="assistant-prompt-chip rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-0.5 text-[10px] text-[var(--text-body)] hover:border-brand-300"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
