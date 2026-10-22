import { Bot, RotateCcw, RotateCw, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { LANGUAGES, t } from '@/features/support/bilingualContent.js';

/**
 * Premium concierge header: branding, language selector, voice controls, and the single close action.
 * No separate "minimize" control -- this architecture has one real closed/open state (SupportLauncher's
 * `panel`), so a minimize button that behaved identically to close would just be a second label for the
 * same action.
 */
export function AssistantHeader({ lang, onChangeLanguage, synthesisSupported, speechEnabled, onToggleSpeech, canReplay, onReplay, showRestart, onRestart, onClose }) {
  return (
    <header className="flex shrink-0 flex-col gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-700 text-white shadow-sm">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{t('conciergeTitle', lang)}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">{t('conciergeSubtitle', lang)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {synthesisSupported && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleSpeech}
              aria-label={speechEnabled ? t('speakToggleOn', lang) : t('speakToggleOff', lang)}
              aria-pressed={speechEnabled}
              className="h-8 w-8 rounded-full p-0"
            >
              {speechEnabled ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
            </Button>
          )}
          {synthesisSupported && speechEnabled && canReplay && (
            <Button type="button" variant="ghost" size="sm" onClick={onReplay} aria-label={t('replayResponse', lang)} className="h-8 w-8 rounded-full p-0">
              <RotateCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {showRestart && (
            <Button type="button" variant="ghost" size="sm" onClick={onRestart} aria-label={t('restartLabel', lang)} className="h-8 w-8 rounded-full p-0">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={t('closeChat', lang)} className="h-8 w-8 rounded-full p-0">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-1.5" role="group" aria-label="Choose language">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => onChangeLanguage(l.code)}
            aria-pressed={lang === l.code}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
              lang === l.code
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)] hover:border-brand-400'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </header>
  );
}
