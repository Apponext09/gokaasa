import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { t } from '@/features/support/bilingualContent.js';

/**
 * The mic button plus its current state label. Visual states are idle / listening / processing -- error
 * text is rendered by the caller alongside the composer's other inline messages, so it reads consistently
 * with typed-input errors rather than living in two different places.
 */
export function VoiceControl({ lang, listening, processing, onToggle }) {
  const label = listening ? t('listening', lang) : processing ? t('searching', lang) : t('micIdleLabel', lang);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={listening ? 'primary' : 'secondary'}
        onClick={onToggle}
        disabled={processing}
        aria-label={listening ? 'Stop listening' : 'Start voice input'}
        aria-pressed={listening}
        className="relative h-9 w-9 shrink-0 rounded-full p-0"
      >
        {listening && <span className="absolute inset-0 -z-10 rounded-full bg-brand-500/40 motion-safe:animate-ping" aria-hidden="true" />}
        {listening ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
      </Button>
      {(listening || processing) && (
        <p className="flex items-center gap-1.5 text-xs text-brand-700" aria-live="polite">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-600 motion-safe:animate-pulse" aria-hidden="true" /> {label}
        </p>
      )}
    </div>
  );
}
