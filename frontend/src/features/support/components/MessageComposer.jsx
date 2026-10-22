import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { t } from '@/features/support/bilingualContent.js';
import { VoiceControl } from '@/features/support/components/VoiceControl.jsx';

/**
 * The bottom-pinned message composer -- text input, mic, and send, always reachable regardless of how
 * long the transcript above it grows. Enter submits; Shift+Enter inserts a newline (the textarea can hold
 * a full natural-language sentence, so a literal newline is occasionally useful, e.g. pasted itineraries).
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
    <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {error && <p className="mb-1.5 text-xs text-danger-600">{error}</p>}
      {note && <p className="mb-1.5 text-xs text-brand-700">{note}</p>}
      {candidates?.length > 1 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {candidates.map((c) => (
            <button
              key={`${c.type}-${c.destination}`}
              type="button"
              onClick={() => onPickCandidate(c)}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3 py-1 text-xs font-medium text-[var(--text-body)] transition-colors hover:border-brand-400 hover:text-brand-700"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={500}
          rows={1}
          placeholder={placeholder}
          aria-label="Message Gokaasa Booking Assistant"
          className="max-h-24 min-h-10 flex-1 resize-none rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3 py-2.5 text-sm leading-5 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
        />
        {speechSupported && <VoiceControl lang={lang} listening={listening} processing={submitting} onToggle={onToggleMic} />}
        <Button type="button" size="sm" onClick={onSubmit} disabled={submitting || !value.trim()} aria-label="Send" className="h-10 w-10 shrink-0 rounded-full p-0">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
      {!speechSupported && <p className="mt-1.5 text-xs text-[var(--text-muted)]">{t('speechUnsupported', lang)}</p>}
    </div>
  );
}
