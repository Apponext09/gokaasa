import { useEffect, useRef, useState } from 'react';

/** Scroll-triggered fade/slide-in, skipped entirely under prefers-reduced-motion. Shared by every homepage section. */
export function Reveal({
  children,
  className = '',
  delay = 0,
  direction = 'up',
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) return undefined;

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(element);
        }
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -35px 0px',
      },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const hiddenTransform = {
    up: 'translate-y-8',
    down: '-translate-y-8',
    left: 'translate-x-8',
    right: '-translate-x-8',
    zoom: 'scale-[0.96]',
  };

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transform-gpu transition-[opacity,transform] duration-700 ease-out ${visible
          ? 'translate-x-0 translate-y-0 scale-100 opacity-100'
          : `${hiddenTransform[direction] || hiddenTransform.up} opacity-0`
        } ${className}`}
    >
      {children}
    </div>
  );
}
