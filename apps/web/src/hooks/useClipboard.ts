import { useEffect, useRef, useState } from 'react';

const COPIED_MS = 1800;

/** Copies text and reports which key was copied last, for a short "복사됨" confirmation. */
export function useClipboard(): {
  copied: string | null;
  copy: (key: string, text: string) => void;
} {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = (key: string, text: string) => {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard) return;
    clipboard.writeText(text).then(
      () => {
        setCopied(key);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), COPIED_MS);
      },
      () => setCopied(null),
    );
  };

  return { copied, copy };
}
