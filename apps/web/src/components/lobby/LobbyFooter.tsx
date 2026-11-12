import type { MyLobbyState, StartEligibility } from '../../types/onlineLobby';
import { GameIcon } from '../icons/GameIcon';

interface LobbyFooterProps {
  isHost: boolean;
  hostName: string;
  me: MyLobbyState;
  start: StartEligibility;
  busy: boolean;
  onReady: (ready: boolean) => void;
  onStart: () => void;
}

/** Wooden dock: ready toggle for guests, start button (with the reason it is locked) for the host. */
export function LobbyFooter({
  isHost,
  hostName,
  me,
  start,
  busy,
  onReady,
  onStart,
}: LobbyFooterProps) {
  if (isHost) {
    const reason = start.reasons.join('\n');
    return (
      <footer className="dock-row lobby-footer">
        {start.reasons.length > 0 ? (
          <ul className="form-errors lobby-reasons" aria-live="polite">
            {start.reasons.map((r) => (
              <li key={r}>
                <GameIcon name="cooldown" /> {r}
              </li>
            ))}
          </ul>
        ) : (
          <p className="dock-status lobby-ready-note" aria-live="polite">
            <GameIcon name="ready" /> 모두 준비되었습니다. 게임을 시작하세요!
          </p>
        )}
        <span className="lobby-start-wrap" title={reason || undefined}>
          <button
            type="button"
            className="btn btn-primary btn-lg dock-primary"
            disabled={!start.canStart || busy}
            onClick={onStart}
          >
            <GameIcon name="duel" /> 게임 시작
          </button>
        </span>
      </footer>
    );
  }

  return (
    <footer className="dock-row lobby-footer">
      <p className="dock-status lobby-ready-note" aria-live="polite">
        <GameIcon name={me.ready ? 'ready' : 'scroll'} />
        {me.ready
          ? `준비 완료! ${hostName}님이 게임을 시작하기를 기다리는 중…`
          : '직업을 고르거나 무작위로 두고 준비하세요.'}
      </p>
      {me.needsReady && (
        <span className="lobby-start-wrap" title={me.readyBlocker ?? undefined}>
          <button
            type="button"
            className={`btn btn-lg dock-primary ${me.ready ? 'btn-ghost' : 'btn-primary'}`}
            aria-pressed={me.ready}
            disabled={busy || me.readyBlocker !== null}
            onClick={() => onReady(!me.ready)}
          >
            <GameIcon name={me.ready ? 'close' : 'ready'} /> {me.ready ? '준비 취소' : '준비'}
          </button>
        </span>
      )}
    </footer>
  );
}
