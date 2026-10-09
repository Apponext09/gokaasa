import { motion, useReducedMotion } from 'motion/react';

const STEP_MS = 80;
const MAX_STEPS = 6; // beyond this, every further card reveals at the same (already-visible) delay

/**
 * Fades + slides a card in once, the moment it enters the viewport, with a short per-index stagger.
 * Used by every hotel-card grid/carousel so cards don't all animate at once on first load. Re-renders
 * (filtering, sorting, pagination) never replay this -- `viewport.once` means each mounted instance
 * animates in exactly one time. `prefers-reduced-motion` gets an instant, static appearance instead.
 */
export function StaggeredReveal({ index = 0, className, children }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;

  const delay = Math.min(index, MAX_STEPS) * (STEP_MS / 1000);
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
