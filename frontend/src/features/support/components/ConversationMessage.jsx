import { Sparkles, User } from 'lucide-react';

/** Renders a fixed template string's literal "\n" line breaks as real line breaks. */
function Lines({ text }) {
  const lines = String(text ?? '').split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

/** A concierge message in the transcript */
export function AssistantBubble({ text }) {
  return (
    <div className="assistant-message flex items-start gap-1.5 motion-safe:animate-[cardReveal_0.2s_ease-out]">
      <span className="assistant-message-avatar mt-0.5 grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full bg-brand-700/10 text-brand-700">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
      </span>
      <div className="assistant-message-bubble max-w-[88%] rounded-xl rounded-tl-xs bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs leading-4.5 text-[var(--text-body)]">
        <Lines text={text} />
      </div>
    </div>
  );
}

/** What the user said/picked, shown as a right-aligned bubble */
export function UserBubble({ text }) {
  return (
    <div className="assistant-message flex items-start justify-end gap-1.5 motion-safe:animate-[cardReveal_0.2s_ease-out]">
      <div className="assistant-message-bubble max-w-[88%] rounded-xl rounded-tr-xs bg-brand-600 px-2.5 py-1.5 text-xs leading-4.5 text-white">
        <Lines text={text} />
      </div>
      <span className="assistant-message-avatar mt-0.5 grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
        <User className="h-3 w-3" aria-hidden="true" />
      </span>
    </div>
  );
}

/** Shown only while a real operation (extraction or search) is actually pending */
export function TypingIndicator() {
  return (
    <div className="flex items-start gap-1.5" role="status" aria-label="Gokaasa Booking Assistant is responding">
      <span className="mt-0.5 grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full bg-brand-700/10 text-brand-700">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
      </span>
      <div className="flex items-center gap-1 rounded-xl rounded-tl-xs bg-[var(--surface-muted)] px-2.5 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] motion-safe:animate-bounce" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] motion-safe:animate-bounce [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] motion-safe:animate-bounce [animation-delay:240ms]" />
      </div>
    </div>
  );
}
