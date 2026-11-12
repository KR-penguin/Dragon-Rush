import type { RoomStatus } from '@dragon-rush/protocol';
import { GameIcon } from '../icons/GameIcon';

interface RoomStatusBannerProps {
  status: Exclude<RoomStatus, 'lobby'>;
  busy: boolean;
  isHost: boolean;
  onOpenGame: () => void;
  onRematch: () => void;
}

/** Shown on the room screen after leaving the Game page while the room is no longer in the lobby. */
export function RoomStatusBanner({
  status,
  busy,
  isHost,
  onOpenGame,
  onRematch,
}: RoomStatusBannerProps) {
  if (status === 'playing') {
    return (
      <section className="panel lobby-banner is-playing">
        <span className="lobby-banner-seal" aria-hidden="true">
          <GameIcon name="duel" />
        </span>
        <div className="lobby-banner-text">
          <strong>게임이 진행 중입니다</strong>
          <p className="muted">
            자리를 비운 동안 내 차례는 제한 시간이 지나면 자동으로 진행됩니다.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={busy}
          onClick={onOpenGame}
        >
          <GameIcon name="roulette" /> 게임으로 돌아가기
        </button>
      </section>
    );
  }
  return (
    <section className="panel lobby-banner is-finished">
      <span className="lobby-banner-seal" aria-hidden="true">
        <GameIcon name="trophy" />
      </span>
      <div className="lobby-banner-text">
        <strong>게임이 끝났습니다</strong>
        <p className="muted">
          {isHost
            ? '같은 방과 코드로 다시 시작할 수 있습니다.'
            : '방장이 다시 시작하면 같은 방에서 준비할 수 있습니다.'}
        </p>
      </div>
      <div className="lobby-banner-actions">
        <button type="button" className="btn btn-ghost" onClick={onOpenGame}>
          <GameIcon name="trophy" /> 결과 보기
        </button>
        {isHost && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onRematch}>
            <GameIcon name="restart" /> 같은 방에서 다시 하기
          </button>
        )}
      </div>
    </section>
  );
}
