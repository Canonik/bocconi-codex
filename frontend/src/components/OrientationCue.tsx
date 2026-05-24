import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const VISITED_KEY = 'buddy.visited';

export function OrientationCue() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(VISITED_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    setVisible(true);

    function onScroll() {
      if (window.scrollY > 80) hide();
    }
    function onInputFocus(e: Event) {
      const t = e.target as HTMLElement | null;
      if (t?.id === 'composer-input') hide();
    }
    function onInputType(e: Event) {
      const t = e.target as HTMLTextAreaElement | null;
      if (t?.id === 'composer-input' && t.value.length > 0) hide();
    }
    function hide() {
      try {
        window.localStorage.setItem(VISITED_KEY, '1');
      } catch {
        /* ignore */
      }
      setVisible(false);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('focusin', onInputFocus);
    window.addEventListener('input', onInputType);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('focusin', onInputFocus);
      window.removeEventListener('input', onInputType);
    };
  }, []);

  if (!visible) return null;

  return (
    <motion.div
      aria-hidden="true"
      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, delay: reduceMotion ? 0 : 1.2 }}
      className="mx-auto max-w-6xl px-5 md:px-10 py-3 flex items-center gap-3"
    >
      <motion.span
        animate={
          reduceMotion ? undefined : { y: [0, 4, 0] }
        }
        transition={
          reduceMotion ? undefined : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
        }
        className="font-mono text-[1rem] leading-none"
        style={{ color: 'var(--bauhaus-red)' }}
      >
        ▼
      </motion.span>
      <span className="eyebrow" style={{ color: 'var(--off-black)' }}>
        OR PICK AN ARTICLE BELOW
      </span>
    </motion.div>
  );
}
