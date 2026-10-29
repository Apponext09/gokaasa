import { useEffect, useState } from 'react';

const MESSAGES = [
  'Great stays. Better journeys. One Gokaasa.',
  'Your next memorable stay is just a few clicks away.',
  'Less planning, more exploring.',
  'Discover Mumbai and Navi Mumbai, your way.',
  'Every journey deserves a great place to stay.',
];

/**
 * Rotates a short inspirational line every 5s using the hero's own `heroQuote` keyframe (index.css) --
 * plain CSS, like the rest of the hero, no second animation system. The global
 * `prefers-reduced-motion` rule (index.css) already collapses this keyframe's duration to ~0, so no
 * per-component motion check is needed. A fixed-height wrapper keeps the swap from shifting layout.
 */
export function HeroMessageRotator({ className = '' }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % MESSAGES.length);
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <p key={index} className={`customer-hero-quote ${className}`} aria-live="off">
      {MESSAGES[index]}
    </p>
  );
}
