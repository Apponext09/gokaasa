import { RotateCcw, RotateCw, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { LANGUAGES, t } from '@/features/support/bilingualContent.js';

/**
 * Ultra-compact concierge header designed for small chatbot popup cards.
 */
export function AssistantHeader({ lang, onChangeLanguage, synthesisSupported, speechEnabled, onToggleSpeech, canReplay, onReplay, showRestart, onRestart, onClose }) {
  return (
    <header className="assistant-header flex shrink-0 flex-col gap-1.5 px-3 py-2 text-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="assistant-header-avatar grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white shadow-sm">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-white">{t('conciergeTitle', lang)}</p>
            <p className="flex items-center gap-1 truncate text-[10px] text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {t('conciergeSubtitle', lang)}
            </p>
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
              className="assistant-header-control h-6.5 w-6.5 rounded-md p-0 text-white"
            >
              {speechEnabled ? <Volume2 className="h-3 w-3" aria-hidden="true" /> : <VolumeX className="h-3 w-3" aria-hidden="true" />}
            </Button>
          )}
          {synthesisSupported && speechEnabled && canReplay && (
            <Button type="button" variant="ghost" size="sm" onClick={onReplay} aria-label={t('replayResponse', lang)} className="assistant-header-control h-6.5 w-6.5 rounded-md p-0 text-white">
              <RotateCw className="h-3 w-3" aria-hidden="true" />
            </Button>
          )}
          {showRestart && (
            <Button type="button" variant="ghost" size="sm" onClick={onRestart} aria-label={t('restartLabel', lang)} className="assistant-header-control h-6.5 w-6.5 rounded-md p-0 text-white">
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={t('closeChat', lang)} className="assistant-header-control h-6.5 w-6.5 rounded-md p-0 text-white">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="assistant-languages flex items-center gap-1" role="group" aria-label="Choose language">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => onChangeLanguage(l.code)}
            aria-pressed={lang === l.code}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors focus-visible:outline-1 focus-visible:outline-brand-500 ${
              lang === l.code
                ? 'border-white bg-white text-brand-800 shadow-sm'
                : 'border-white/20 bg-white/10 text-white/80 hover:bg-white/20'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </header>
  );
}
