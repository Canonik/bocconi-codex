import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RESOURCE_LINKS, SOCIAL_CHANNELS } from '@/lib/resources';
import type {
  ChannelCategory,
  ResourceLink,
  SocialChannel,
  SocialPlatform,
} from '@/lib/resources';
import type { Verticale } from '@/lib/api';
import { VERTICALE_META, VERTICALI } from '@/lib/verticali';
import { Primitive, VERTICALE_PRIMITIVE } from '@/components/primitives';
import type { PrimitiveKind } from '@/components/primitives';

interface ResourcesPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ResourcesPanel({ open, onClose }: ResourcesPanelProps) {
  const reduceMotion = useReducedMotion();

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="resources-panel"
          className="fixed inset-0 flex items-stretch justify-end overflow-hidden"
          style={{ zIndex: 100 }}
          aria-modal="true"
          role="dialog"
          aria-labelledby="resources-title"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{ background: 'var(--off-black)', opacity: 0.85 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer (right on desktop, full-screen on mobile). */}
          <motion.aside
            className="relative ml-auto w-full md:w-[640px] max-w-full h-full overflow-y-auto overflow-x-hidden border-l-[3px]"
            style={{ background: 'var(--cream)', borderColor: 'var(--off-black)' }}
            initial={reduceMotion ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={reduceMotion ? undefined : { x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <header
              className="sticky top-0 z-10 px-5 md:px-7 py-4 border-b-[3px] flex items-center gap-3"
              style={{ background: 'var(--cream)', borderColor: 'var(--off-black)' }}
            >
              <span
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5"
                style={{ background: 'var(--bauhaus-red)' }}
              />
              <h2
                id="resources-title"
                className="font-display tracking-[-0.01em] text-[1.4rem] md:text-[1.7rem] leading-none mr-auto"
                style={{ color: 'var(--off-black)' }}
              >
                RESOURCES
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close resources"
                className="hairline-input w-9 h-9 flex items-center justify-center"
                style={{ background: 'var(--cream)', color: 'var(--off-black)' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="2" />
                  <line x1="12" y1="2" x2="2" y2="12" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            </header>

            <div className="px-5 md:px-7 py-6 space-y-9">
              <LinksSection />
              <SocialSection />
            </div>

            <footer
              className="px-5 md:px-7 py-3 border-t-[2px] mt-2"
              style={{ borderColor: 'var(--off-black)' }}
            >
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>
                OPENS IN NEW TAB
              </p>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LinksSection() {
  const reduceMotion = useReducedMotion();
  const grouped = groupByVerticale(RESOURCE_LINKS);
  // Single running counter so links across verticali stagger in one cascade.
  let staggerIdx = 0;
  return (
    <section aria-labelledby="links-title" className="space-y-6">
      <header className="flex items-center gap-3">
        <h3
          id="links-title"
          className="eyebrow"
          style={{ color: 'var(--off-black)' }}
        >
          CURATED LINKS
        </h3>
        <div className="flex-1 h-[2px]" style={{ background: 'var(--off-black)' }} />
      </header>

      {VERTICALI.map((v) => {
        const items = grouped[v];
        if (!items || items.length === 0) return null;
        const meta = VERTICALE_META[v];
        const tint = `var(${meta.colorVar})`;
        const kind = VERTICALE_PRIMITIVE[v];
        return (
          <div key={v}>
            <p className="eyebrow inline-flex items-center gap-2 mb-2" style={{ color: 'var(--off-black)' }}>
              <Primitive kind={kind} size={11} fill={tint} />
              {meta.eyebrow}
            </p>
            <ul className="space-y-1">
              {items.map((link) => {
                const idx = staggerIdx++;
                return (
                  <motion.li
                    key={link.url}
                    initial={reduceMotion ? false : { opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.08 + idx * 0.04,
                      type: 'spring',
                      stiffness: 260,
                      damping: 22,
                    }}
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="resource-link group/link flex items-center gap-3 py-2 px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bauhaus-red)]"
                    >
                      <Primitive
                        kind={kind}
                        size={9}
                        fill={tint}
                        className="shrink-0"
                      />
                      <span
                        className="resource-link-label font-sans text-[0.95rem] leading-snug"
                        style={{ color: 'var(--off-black)' }}
                      >
                        {link.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="ml-auto font-mono text-[0.7rem] tracking-[0.18em] shrink-0"
                        style={{ color: 'var(--muted-foreground)' }}
                      >
                        ↗
                      </span>
                    </a>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function groupByVerticale(
  links: readonly ResourceLink[],
): Record<Verticale, ResourceLink[]> {
  const out: Record<Verticale, ResourceLink[]> = {
    relocation: [],
    life_on_campus: [],
    study_abroad: [],
    career_readiness: [],
  };
  for (const link of links) out[link.verticale].push(link);
  return out;
}

// === Follow & Connect ======================================================

const PLATFORM_TAG: Record<SocialPlatform, string> = {
  instagram: 'IG',
  linkedin: 'LI',
  youtube: 'YT',
  web: 'WEB',
};

interface CategoryStyle {
  eyebrow: string;
  primitive: PrimitiveKind;
  tint: string;
}

const CATEGORY_STYLE: Record<ChannelCategory, CategoryStyle> = {
  official:    { eyebrow: 'OFFICIAL · BOCCONI',           primitive: 'bar',      tint: 'var(--off-black)' },
  community:   { eyebrow: 'COMMUNITY · INTERNATIONAL',     primitive: 'circle',   tint: 'var(--bauhaus-red)' },
  association: { eyebrow: 'STUDENT ASSOCIATIONS',          primitive: 'triangle', tint: 'var(--bauhaus-yellow)' },
};

const CATEGORY_ORDER: readonly ChannelCategory[] = ['official', 'community', 'association'];

function SocialSection() {
  const reduceMotion = useReducedMotion();
  const grouped = groupByCategory(SOCIAL_CHANNELS);
  let staggerIdx = 0;

  return (
    <section aria-labelledby="social-title" className="space-y-6">
      <header className="flex items-center gap-3">
        <h3
          id="social-title"
          className="eyebrow"
          style={{ color: 'var(--off-black)' }}
        >
          FOLLOW & CONNECT
        </h3>
        <div className="flex-1 h-[2px]" style={{ background: 'var(--off-black)' }} />
      </header>

      {CATEGORY_ORDER.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        const style = CATEGORY_STYLE[cat];
        return (
          <div key={cat}>
            <p
              className="eyebrow inline-flex items-center gap-2 mb-2"
              style={{ color: 'var(--off-black)' }}
            >
              <Primitive kind={style.primitive} size={11} fill={style.tint} />
              {style.eyebrow}
            </p>
            <ul className="space-y-1">
              {items.map((channel) => {
                const idx = staggerIdx++;
                return (
                  <motion.li
                    key={channel.url}
                    initial={reduceMotion ? false : { opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.3 + idx * 0.035,
                      type: 'spring',
                      stiffness: 260,
                      damping: 22,
                    }}
                  >
                    <a
                      href={channel.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="social-link resource-link group/link flex items-center gap-3 py-2 px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bauhaus-red)]"
                    >
                      <Primitive
                        kind={style.primitive}
                        size={9}
                        fill={style.tint}
                        className="shrink-0 social-link-sigil"
                      />
                      <span
                        aria-hidden="true"
                        className="social-monogram font-mono text-[0.66rem] tabular-nums tracking-[0.18em] uppercase shrink-0 inline-flex items-center justify-center w-7 py-[1px] border-2"
                        style={{
                          borderColor: 'var(--off-black)',
                          color: 'var(--off-black)',
                          background: 'var(--cream)',
                        }}
                      >
                        {PLATFORM_TAG[channel.platform]}
                      </span>
                      <span className="resource-link-label font-sans text-[0.95rem] leading-snug min-w-0 flex-1" style={{ color: 'var(--off-black)' }}>
                        {channel.handle && (
                          <span className="font-mono text-[0.86rem] mr-2" style={{ color: 'var(--off-black)' }}>
                            {channel.handle}
                          </span>
                        )}
                        <span style={{ color: 'var(--muted-foreground)' }}>
                          {channel.name}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="ml-auto font-mono text-[0.7rem] tracking-[0.18em] shrink-0"
                        style={{ color: 'var(--muted-foreground)' }}
                      >
                        ↗
                      </span>
                    </a>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function groupByCategory(
  channels: readonly SocialChannel[],
): Record<ChannelCategory, SocialChannel[]> {
  const out: Record<ChannelCategory, SocialChannel[]> = {
    official: [],
    community: [],
    association: [],
  };
  for (const c of channels) out[c.category].push(c);
  return out;
}
