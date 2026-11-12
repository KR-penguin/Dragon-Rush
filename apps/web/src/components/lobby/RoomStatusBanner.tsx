import type { RoomStatus } from '@dragon-rush/protocol';

interface RoomStatusBannerProps {
  status: Exclude<RoomStatus, 'lobby'>;
  busy: boolean;
  onOpenGame: () => void;
  onNewRoom: () => void;
}

/** Shown on the room screen after leaving the Game page while the room is no longer in the lobby. */
export function RoomStatusBanner({ status, busy, onOpenGame, onNewRoom }: RoomStatusBannerProps) {
  if (status === 'playing') {
    return (
      <section className="panel lobby-banner is-playing">
        <div>
          <strong>게임이 진행 중입니다</strong>
          <p className="muted">
            자리를 비운 동안 내 차례는 제한 시간이 지나면 자동으로 진행됩니다.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={onOpenGame}>
          🎲 게임으로 돌아가기
        </button>
      </section>
    );
  }
  return (
    <section className="panel lobby-banner is-finished">
      <div>
        <strong>게임이 끝났습니다</strong>
        <p className="muted">다시 하려면 새 방을 만들어 친구에게 새 코드를 알려 주세요.</p>
      </div>
      <div className="lobby-banner-actions">
        <button type="button" className="btn btn-ghost" onClick={onOpenGame}>
          🏆 결과 보기
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onNewRoom}>
          🏰 새 방 만들기
        </button>
      </div>
    </section>
  );
}
