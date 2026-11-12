import type { JobId } from '@dragon-rush/engine';
import type { CSSProperties } from 'react';
import type { TurnRibbonView } from '../../hooks/useTurnRibbon';
import { seatInk } from '../../types/labels';
import { JobArt } from '../icons/Art';

interface TurnRibbonProps {
  ribbon: TurnRibbonView;
  name: string;
  job: JobId;
  color: string;
}

/** "OO의 차례" banner that sweeps across the top of the board (600 ms in, 400 ms hold). */
export function TurnRibbon({ ribbon, name, job, color }: TurnRibbonProps) {
  const style = {
    '--seat-color': color,
    '--seat-ink': seatInk(ribbon.seat),
    '--ribbon-ms': `${ribbon.ms}ms`,
  } as CSSProperties;
  return (
    <div key={ribbon.key} className="turn-ribbon" style={style} role="status">
      <span className="turn-ribbon-medal">
        <JobArt job={job} />
      </span>
      <strong>{name}의 차례</strong>
      {ribbon.resting && <small>쉬는 턴: 이동할 수 없습니다</small>}
    </div>
  );
}
