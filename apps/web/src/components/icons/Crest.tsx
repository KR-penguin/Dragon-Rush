import type { CrestShape } from '../../types/labels';

const PATHS: Record<CrestShape, string> = {
  shield: 'M12 1.8 20.4 5v6.2c0 5.4-3.6 9.5-8.4 11-4.8-1.5-8.4-5.6-8.4-11V5Z',
  diamond: 'M12 1.5 21.5 12 12 22.5 2.5 12Z',
  leaf: 'M20.8 3.2C11.3 3 3.4 8.3 3.4 16c0 2 .7 3.6 1.7 4.8.9-5.6 4.6-9.6 9.6-11.9-4.1 3.1-6.8 7.1-7.6 12 8.6.6 13.9-6.1 13.7-17.7Z',
  star: 'm12 1.6 3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 17.8l-6.4 3.5L7 14.1 1.7 9.1l7.2-.9Z',
};

interface CrestProps {
  shape: CrestShape;
  className?: string;
}

/** Seat crest: a shape cue that pairs with the seat colour (colour-blind redundancy). */
export function Crest({ shape, className = '' }: CrestProps) {
  return (
    <svg className={`crest crest-${shape} ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[shape]} fill="currentColor" stroke="#1a1210" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
