import type { SVGProps } from 'react';
import type { Verticale } from '@/lib/api';

export type PrimitiveKind = 'circle' | 'triangle' | 'square' | 'bar';

export interface PrimitiveProps extends Omit<SVGProps<SVGSVGElement>, 'fill'> {
  size?: number | string;
  fill?: string;
}

export function Circle({ size = 24, fill = 'currentColor', ...rest }: PrimitiveProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="presentation"
      aria-hidden="true"
      {...rest}
    >
      <circle cx="12" cy="12" r="11" fill={fill} />
    </svg>
  );
}

export function Triangle({ size = 24, fill = 'currentColor', ...rest }: PrimitiveProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="presentation"
      aria-hidden="true"
      {...rest}
    >
      {/* Equilateral, point-up. */}
      <polygon points="12,1 23,21 1,21" fill={fill} />
    </svg>
  );
}

export function Square({ size = 24, fill = 'currentColor', ...rest }: PrimitiveProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="presentation"
      aria-hidden="true"
      {...rest}
    >
      <rect x="1" y="1" width="22" height="22" fill={fill} />
    </svg>
  );
}

export function Bar({ size = 24, fill = 'currentColor', ...rest }: PrimitiveProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="presentation"
      aria-hidden="true"
      {...rest}
    >
      <rect x="1" y="9" width="22" height="6" fill={fill} />
    </svg>
  );
}

export function Primitive({
  kind,
  size = 24,
  fill = 'currentColor',
  ...rest
}: PrimitiveProps & { kind: PrimitiveKind }) {
  switch (kind) {
    case 'circle':
      return <Circle size={size} fill={fill} {...rest} />;
    case 'triangle':
      return <Triangle size={size} fill={fill} {...rest} />;
    case 'square':
      return <Square size={size} fill={fill} {...rest} />;
    case 'bar':
      return <Bar size={size} fill={fill} {...rest} />;
  }
}

export const VERTICALE_PRIMITIVE: Record<Verticale, PrimitiveKind> = {
  relocation: 'circle',
  life_on_campus: 'triangle',
  study_abroad: 'square',
  career_readiness: 'bar',
};
