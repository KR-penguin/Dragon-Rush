import { useCountUp } from '../../hooks/useCountUp';

interface CountUpProps {
  value: number;
  reduced: boolean;
  className?: string;
}

/** Number that counts up or down to its value; the text is written by the hook, not by React. */
export function CountUp({ value, reduced, className }: CountUpProps) {
  const ref = useCountUp<HTMLSpanElement>(value, reduced);
  return <span ref={ref} className={className} aria-label={String(value)} />;
}
