import type { Verticale } from './api';

export interface ResourceLink {
  label: string;
  url: string;
  verticale: Verticale;
}

/** Curated external resources, grouped by verticale (preserved insertion order).
 *  Only links that have been verified to resolve to a usable Bocconi page are
 *  kept here — broken / dead links were removed per human feedback. */
export const RESOURCE_LINKS: readonly ResourceLink[] = [
  // Life on campus — library, dining, full associations directory.
  {
    label: 'Bocconi Library — Hours & Booking',
    url: 'https://www.unibocconi.it/en/current-students/library-archives',
    verticale: 'life_on_campus',
  },
  {
    label: 'Mensa Bocconi — Dining Areas',
    url: 'https://www.unibocconi.it/en/current-students/funding/dining-areas',
    verticale: 'life_on_campus',
  },
  {
    label: 'Bocconi Student Associations Directory',
    url: 'https://www.unibocconi.it/it/studenti-iscritti/campus-life/attivita-studentesche/elenco-delle-associazioni',
    verticale: 'life_on_campus',
  },
  {
    label: 'Blackboard · Bocconi LMS',
    url: 'https://blackboard.unibocconi.it/ultra/institution-page',
    verticale: 'life_on_campus',
  },
  // Career — job portal, alumni network, student-run associations students actually visit.
  {
    label: 'JobGate — Bocconi Career Portal',
    url: 'https://jobgate.unibocconi.it/',
    verticale: 'career_readiness',
  },
  {
    label: 'Bocconi Alumni Network',
    url: 'https://www.bocconialumni.it/',
    verticale: 'career_readiness',
  },
  {
    label: 'BLAB Bocconi · Student startup lab',
    url: 'https://www.blabbocconi.it/',
    verticale: 'career_readiness',
  },
  {
    label: 'Astra Bocconi',
    url: 'https://www.astrabocconi.com/',
    verticale: 'career_readiness',
  },
  {
    label: 'BAINSA · Bocconi AI Students Association',
    url: 'https://www.bainsa.xyz/',
    verticale: 'career_readiness',
  },
];

export type SocialPlatform = 'instagram' | 'linkedin' | 'youtube' | 'web';
export type ChannelCategory = 'official' | 'community' | 'association';

export interface SocialChannel {
  /** Display name (full title). */
  name: string;
  /** Optional @handle for IG-style accounts. Omit for institutional pages. */
  handle?: string;
  url: string;
  platform: SocialPlatform;
  category: ChannelCategory;
}

/** Verified social/community channels. URLs curl-checked before commit. */
export const SOCIAL_CHANNELS: readonly SocialChannel[] = [
  // Official Bocconi
  { name: 'Bocconi University',  handle: '@unibocconi', url: 'https://www.instagram.com/unibocconi/',                                          platform: 'instagram', category: 'official' },
  { name: 'Università Bocconi',                         url: 'https://www.linkedin.com/school/universita-bocconi/posts/?feedView=all',          platform: 'linkedin',  category: 'official' },
  { name: 'Università Bocconi',                         url: 'https://www.youtube.com/user/Unibocconi',                                         platform: 'youtube',   category: 'official' },

  // Student-run associations students actually visit + the directory.
  { name: 'BLAB Bocconi Students Lab', handle: '@blabbocconi',     url: 'https://www.instagram.com/blabbocconi/',     platform: 'instagram', category: 'association' },
  { name: 'Astra Bocconi',             handle: '@astrabocconi',    url: 'https://www.instagram.com/astrabocconi/',    platform: 'instagram', category: 'association' },
  { name: 'BAINSA',                    handle: '@bainsa_bocconi',  url: 'https://www.instagram.com/bainsa_bocconi/',  platform: 'instagram', category: 'association' },
  {
    name: 'Browse all 100+ associations · Bocconi directory',
    url: 'https://www.unibocconi.it/it/studenti-iscritti/campus-life/attivita-studentesche/elenco-delle-associazioni',
    platform: 'web',
    category: 'association',
  },
];
