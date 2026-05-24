import { motion, useReducedMotion } from 'motion/react';

interface ResourcesTriggerProps {
  onClick: () => void;
}

export function ResourcesTrigger({ onClick }: ResourcesTriggerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="Open resources panel — curated links and Bocconi-area map"
      className="hairline-input fixed bottom-4 left-4 z-30 inline-flex items-center gap-2 px-3 py-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] shadow-none"
      style={{
        background: 'var(--off-black)',
        color: 'var(--cream)',
        borderColor: 'var(--off-black)',
      }}
      initial={reduceMotion ? false : { y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      whileHover={reduceMotion ? undefined : { scale: 1.04 }}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      transition={{
        type: 'spring',
        stiffness: 280,
        damping: 22,
        delay: reduceMotion ? 0 : 1.4,
      }}
    >
      {/* Single attention-pulse ring after entrance. CSS-only, no layout cost. */}
      {!reduceMotion && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ border: '2px solid var(--bauhaus-red)' }}
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0, 0.9, 0], scale: [1, 1.55, 1.55] }}
          transition={{ duration: 1.1, delay: 1.9, ease: 'easeOut' }}
        />
      )}
      {/* Stacked primitives — one per verticale, miniature swatch. */}
      <span
        aria-hidden="true"
        className="inline-flex items-center gap-[3px]"
      >
        <svg width="9" height="9" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="var(--bauhaus-red)" /></svg>
        <svg width="9" height="9" viewBox="0 0 24 24"><polygon points="12,1 23,21 1,21" fill="var(--bauhaus-yellow)" /></svg>
        <svg width="9" height="9" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" fill="var(--bauhaus-blue)" /></svg>
        <svg width="9" height="9" viewBox="0 0 24 24"><rect x="1" y="9" width="22" height="6" fill="var(--cream)" /></svg>
      </span>
      <span>RESOURCES</span>
    </motion.button>
  );
}
