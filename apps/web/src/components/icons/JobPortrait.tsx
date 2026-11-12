import type { JobId } from '@dragon-rush/engine';

interface JobPortraitProps {
  readonly job: JobId;
  readonly className?: string;
  readonly label?: string;
}

/** Every fallback uses the same face and shoulder crop; only costume and features change. */
export function JobPortrait({ job, className = '', label }: JobPortraitProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      data-job-portrait={job}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path
        data-part="bust"
        d="M7 64v-6c0-9 6-15 17-17l4 5h8l4-5c11 2 17 8 17 17v6Z"
        fill="currentColor"
        opacity=".78"
      />
      <path d="M25 42v5l7 6 7-6v-5" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path
        data-part="face"
        d="M20 27c0-10 5-16 12-16s12 6 12 16v5c0 9-5 15-12 15s-12-6-12-15Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      {job === 'swordsman' && (
        <>
          <path
            d="M17 29v-7c0-10 6-17 15-17s15 7 15 17v7l-5-3-3-10H25l-3 10Z"
            fill="currentColor"
          />
          <path d="M30 5h4v22h-4zM18 28h28v4H18z" fill="currentColor" />
          <path d="m17 55 9-7 6 7 6-7 9 7" fill="none" stroke="currentColor" strokeWidth="2.5" />
        </>
      )}
      {job === 'archer' && (
        <>
          <path d="M15 28C15 12 22 5 32 5s17 7 17 23l-7-6-4-10H26l-4 10Z" fill="currentColor" />
          <path
            d="M23 26c2-4 6-6 9-6s7 2 9 6M24 52l8 6 8-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path
            d="M50 36c5 6 5 15 0 21M48 36l6 21"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      )}
      {job === 'mage' && (
        <>
          <path d="M18 22 32 2l15 20 8 5H9Z" fill="currentColor" />
          <path
            d="M10 27h44M29 14l3-4 3 4-3 4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path d="M18 55 26 48l6 9 6-9 8 7" fill="none" stroke="currentColor" strokeWidth="2.5" />
        </>
      )}
      {job === 'ninja' && (
        <>
          <path
            d="M17 31V23c0-11 6-18 15-18s15 7 15 18v8l-5-5-3-12H25l-3 12Z"
            fill="currentColor"
          />
          <path d="M19 32h26v10c-3 5-7 7-13 7s-10-2-13-7Z" fill="currentColor" />
          <path d="M19 27h26M20 36h24" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M45 29c7 0 10 3 11 8" fill="none" stroke="currentColor" strokeWidth="3" />
        </>
      )}
      {job === 'berserker' && (
        <>
          <path
            d="M17 23c-6-4-8-10-7-16 4 6 9 8 15 8M47 23c6-4 8-10 7-16-4 6-9 8-15 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path d="M18 27c0-12 6-19 14-19s14 7 14 19l-6-7H24Z" fill="currentColor" />
          <path d="M22 37c2 10 5 15 10 17 5-2 8-7 10-17l-10 6Z" fill="currentColor" />
          <path d="M17 56 25 49m22 7-8-7" fill="none" stroke="currentColor" strokeWidth="3" />
        </>
      )}
      <path d="M25 31h4m6 0h4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
