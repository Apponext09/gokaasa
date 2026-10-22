import { Bot, User } from 'lucide-react';

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

/** A concierge message in the transcript -- entrance animation only, never a layout-affecting one. */
export function AssistantBubble({ text }) {
  return (
    <div className="flex items-start gap-2.5 motion-safe:animate-[cardReveal_0.3s_ease-out]">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-700/10 text-brand-700">
        <Bot className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[var(--surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--text-body)]">
        <Lines text={text} />
      </div>
    </div>
  );
}

/** What the user said/picked, shown as a right-aligned bubble so the transcript reads like a real chat. */
export function UserBubble({ text }) {
  return (
    <div className="flex items-start justify-end gap-2.5 motion-safe:animate-[cardReveal_0.3s_ease-out]">
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-3 text-sm leading-6 text-white">
        <Lines text={text} />
      </div>
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
        <User className="h-4 w-4" aria-hidden="true" />
      </span>
    </div>
  );
}

/** Shown only while a real operation (extraction or search) is actually pending -- never decorative. */
export function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5" role="status" aria-label="Gokaasa Booking Assistant is responding">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-700/10 text-brand-700">
        <Bot className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-[var(--surface-muted)] px-4 py-3.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] motion-safe:animate-bounce" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] motion-safe:animate-bounce [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] motion-safe:animate-bounce [animation-delay:240ms]" />
      </div>
    </div>
  );
}
