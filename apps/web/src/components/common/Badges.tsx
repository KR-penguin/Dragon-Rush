import type { PlayerBadge } from '../../types/playerView';

export function Badges({ badges }: { badges: readonly PlayerBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="badges">
      {badges.map((b) => (
        <span key={b.kind} className={`badge badge-${b.kind}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
}
