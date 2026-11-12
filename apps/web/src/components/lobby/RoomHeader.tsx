import type { IconName } from '../../types/icons';
import { GameIcon } from '../icons/GameIcon';

interface RoomHeaderProps {
  code: string;
  statusLabel: string;
  statusIcon: IconName;
  hostName: string;
  codeCopied: boolean;
  inviteCopied: boolean;
  busy: boolean;
  onCopyCode: () => void;
  onCopyInvite: () => void;
  onLeave: () => void;
}

/** Room code carved into a wooden plaque with copy buttons, plus leaving the room. */
export function RoomHeader({
  code,
  statusLabel,
  statusIcon,
  hostName,
  codeCopied,
  inviteCopied,
  busy,
  onCopyCode,
  onCopyInvite,
  onLeave,
}: RoomHeaderProps) {
  return (
    <section className="panel lobby-room-head">
      <div className="lobby-code-block">
        <div className="lobby-plaque">
          <span className="lobby-plaque-label">방 코드</span>
          <div className="lobby-plaque-row">
            {/* Letters are read one by one; the carved tiles stay selectable for manual copy. */}
            <span className="sr-only">{code.split('').join(' ')}</span>
            <div className="lobby-code" aria-hidden="true">
              {code.split('').map((ch, i) => (
                <span key={i}>{ch}</span>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary lobby-plaque-copy"
              onClick={onCopyCode}
            >
              <GameIcon name={codeCopied ? 'ready' : 'copy'} />{' '}
              {codeCopied ? '복사됨' : '코드 복사'}
            </button>
          </div>
        </div>
        <div className="lobby-code-actions">
          <button type="button" className="btn btn-ghost" onClick={onCopyInvite}>
            <GameIcon name={inviteCopied ? 'ready' : 'invite'} />{' '}
            {inviteCopied ? '복사됨' : '초대 문구 복사'}
          </button>
          <span className="sr-only" aria-live="polite">
            {codeCopied || inviteCopied ? '클립보드에 복사했습니다.' : ''}
          </span>
        </div>
        <p className="lobby-hint">
          친구에게 코드를 알려 주세요. <strong>온라인 게임 › 방 참가</strong>에서 입력하면 빈 사람
          좌석에 들어옵니다.
        </p>
      </div>
      <div className="lobby-room-meta">
        <span className="lobby-status-chip">
          <GameIcon name={statusIcon} /> {statusLabel}
        </span>
        <span className="lobby-host">
          <GameIcon name="crown" className="lobby-host-crown" /> 방장 <strong>{hostName}</strong>
        </span>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onLeave}>
          <GameIcon name="exit" /> 방 나가기
        </button>
      </div>
    </section>
  );
}
