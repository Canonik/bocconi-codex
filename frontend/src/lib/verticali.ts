import type { Verticale } from './api';

export interface VerticaleMeta {
  id: Verticale;
  numeral: string;
  label: string;
  eyebrow: string;
  lead: string;
  /** CSS custom-property name (without `var()`). */
  colorVar: string;
  sampleQuestions: string[];
}

export const VERTICALI: readonly Verticale[] = [
  'relocation',
  'life_on_campus',
  'study_abroad',
  'career_readiness',
] as const;

export const VERTICALE_META: Record<Verticale, VerticaleMeta> = {
  relocation: {
    id: 'relocation',
    numeral: 'I',
    label: 'Relocation',
    eyebrow: 'I · RELOCATION',
    lead: 'Moving to Milan, finding a flat, learning the city.',
    colorVar: '--relocation',
    sampleQuestions: [
      'I have €700/month — which neighborhoods near Bocconi can I realistically rent in?',
      'Steps to register with the Italian National Health Service as an international student.',
      'Cheapest annual ATM transit pass for students under 27?',
    ],
  },
  life_on_campus: {
    id: 'life_on_campus',
    numeral: 'II',
    label: 'Life on campus',
    eyebrow: 'II · LIFE ON CAMPUS',
    lead: 'Dining, sport, associations, well-being on campus.',
    colorVar: '--life-on-campus',
    sampleQuestions: [
      'Show all Bocconi dining areas and their meal patterns as a table.',
      'How many tiers of Bocconi Sport Membership exist for the 2025/26 season?',
      'Quale documento devo portare per accedere alla Biblioteca Bocconi?',
    ],
  },
  study_abroad: {
    id: 'study_abroad',
    numeral: 'III',
    label: 'Study abroad',
    eyebrow: 'III · STUDY ABROAD',
    lead: 'Exchange, double degrees, partner universities.',
    colorVar: '--study-abroad',
    sampleQuestions: [
      'Which partner universities offer a Double Degree in Finance?',
      'How are GPA, credits, and Bachelor grade weighted in MSc Exchange selection?',
      'What is the application deadline for the Double Degree with MIT?',
    ],
  },
  career_readiness: {
    id: 'career_readiness',
    numeral: 'IV',
    label: 'Career',
    eyebrow: 'IV · CAREER',
    lead: 'CV, internships, placement, alumni network.',
    colorVar: '--career-readiness',
    sampleQuestions: [
      'When does the curricular internship application close, and how do I submit it?',
      'Maximum Bocconi Merit Award for graduate students — amount and format?',
      'Placement results from the 2026 BESS graduate survey?',
    ],
  },
};

export function verticaleColor(v: Verticale): string {
  return `var(${VERTICALE_META[v].colorVar})`;
}
