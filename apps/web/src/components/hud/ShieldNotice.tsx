import type { CSSProperties } from 'react';
import { SHIELD_NOTICE_MS, type ShieldNoticeView } from '../../hooks/useShieldNotice';
import { seatColor } from '../../types/labels';
import { GameIcon } from '../icons/GameIcon';

export function ShieldNotice({ notice }: { notice: ShieldNoticeView }) {
  return (
    <div
      key={notice.key}
      className="shield-notice parchment"
      style={
        {
          '--seat-color': seatColor(notice.seat),
          '--shield-ms': `${SHIELD_NOTICE_MS}ms`,
        } as CSSProperties
      }
      role="status"
    >
      <GameIcon name="shield" />
      <strong>{notice.name}님이 방어막을 사용했습니다</strong>
      <span>결투 취소</span>
    </div>
  );
}
