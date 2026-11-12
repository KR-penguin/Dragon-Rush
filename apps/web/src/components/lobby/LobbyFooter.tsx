import type { MyLobbyState, StartEligibility } from '../../types/onlineLobby';

interface LobbyFooterProps {
  isHost: boolean;
  hostName: string;
  me: MyLobbyState;
  start: StartEligibility;
  busy: boolean;
  onReady: (ready: boolean) => void;
  onStart: () => void;
}

/** Ready toggle for guests, start button (with the reason it is locked) for the host. */
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
      <footer className="lobby-footer">
        {start.reasons.length > 0 ? (
          <ul className="form-errors lobby-reasons" aria-live="polite">
            {start.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="lobby-ready-note">모두 준비되었습니다. 게임을 시작하세요!</p>
        )}
        <span className="lobby-start-wrap" title={reason || undefined}>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!start.canStart || busy}
            onClick={onStart}
          >
            ⚔️ 게임 시작
          </button>
        </span>
      </footer>
    );
  }

  return (
    <footer className="lobby-footer">
      <p className="lobby-ready-note muted">
        {me.ready
          ? `준비 완료! ${hostName}님이 게임을 시작하기를 기다리는 중…`
          : '직업을 고르고 준비 버튼을 누르세요.'}
      </p>
      {me.needsReady && (
        <span className="lobby-start-wrap" title={me.readyBlocker ?? undefined}>
          <button
            type="button"
            className={`btn btn-lg ${me.ready ? 'btn-ghost' : 'btn-primary'}`}
            aria-pressed={me.ready}
            disabled={busy || me.readyBlocker !== null}
            onClick={() => onReady(!me.ready)}
          >
            {me.ready ? '준비 취소' : '✋ 준비'}
          </button>
        </span>
      )}
    </footer>
  );
}
