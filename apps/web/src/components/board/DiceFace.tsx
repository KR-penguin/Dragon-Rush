const PIPS: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface DiceFaceProps {
  value: number | null;
  rolling: boolean;
}

export function DiceFace({ value, rolling }: DiceFaceProps) {
  const pips = value !== null ? PIPS[value] : undefined;
  return (
    <div
      className={`dice${rolling ? ' dice-rolling' : ''}`}
      aria-label={value === null ? '주사위' : `주사위 ${value}`}
    >
      {pips ? (
        Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={pips.includes(i) ? 'pip' : 'pip pip-off'} />
        ))
      ) : (
        <span className="dice-empty">{value ?? '?'}</span>
      )}
    </div>
  );
}
