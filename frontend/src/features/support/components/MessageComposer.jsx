import { ArrowUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { t } from '@/features/support/bilingualContent.js';
import { VoiceControl } from '@/features/support/components/VoiceControl.jsx';

/**
 * Compact bottom message composer for small chatbot popup.
 */
export function MessageComposer({
  lang,
  value,
  onChange,
  onSubmit,
  placeholder,
  submitting,
  speechSupported,
  listening,
  onToggleMic,
  error,
  note,
  candidates,
  onPickCandidate,
  inputRef,
}) {
  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="assistant-composer shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
      {error && <p className="mb-1 text-[11px] text-danger-600">{error}</p>}
      {note && <p className="mb-1 text-[11px] text-brand-700">{note}</p>}
      {candidates?.length > 1 && (
        <div className="assistant-candidate-rail mb-1">
          {candidates.map((c) => (
            <button
              key={`${c.type}-${c.destination}`}
              type="button"
              onClick={() => onPickCandidate(c)}
              className="assistant-candidate-chip text-[11px] py-0.5 px-2"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="assistant-composer-box flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-page)] p-1 shadow-xs focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-500/20">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            e.currentTarget.style.height = 'auto';
            e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 60)}px`;
          }}
          onKeyDown={onKeyDown}
          maxLength={500}
          rows={1}
          placeholder={placeholder}
          aria-label="Message Gokaasa Booking Assistant"
          className="assistant-composer-input max-h-16 min-h-[28px] flex-1 resize-none border-0 bg-transparent px-2 py-1 text-xs leading-4 focus:outline-none"
        />
        {speechSupported && <VoiceControl lang={lang} listening={listening} processing={submitting} onToggle={onToggleMic} />}
        <Button type="button" size="sm" onClick={onSubmit} disabled={submitting || !value.trim()} aria-label="Send" className="assistant-send-button h-7.5 w-7.5 shrink-0 rounded-lg p-0">
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />}
        </Button>
      </div>
      {!speechSupported && <p className="mt-1 text-[10px] text-[var(--text-muted)]">{t('speechUnsupported', lang)}</p>}
    </div>
  );
}
