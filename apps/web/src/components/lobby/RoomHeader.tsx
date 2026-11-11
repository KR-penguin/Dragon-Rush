interface RoomHeaderProps {
  code: string;
  statusLabel: string;
  hostName: string;
  codeCopied: boolean;
  inviteCopied: boolean;
  busy: boolean;
  onCopyCode: () => void;
  onCopyInvite: () => void;
  onLeave: () => void;
}

/** Big room code with copy buttons, plus leaving the room. */
export function RoomHeader({
  code,
  statusLabel,
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
        <span className="lobby-code-label">방 코드</span>
        <div className="lobby-code" aria-label={`방 코드 ${code.split('').join(' ')}`}>
          {code.split('').map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </div>
        <div className="lobby-code-actions">
          <button type="button" className="btn" onClick={onCopyCode}>
            {codeCopied ? '✅ 복사됨' : '📋 코드 복사'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCopyInvite}>
            {inviteCopied ? '✅ 복사됨' : '✉️ 초대 문구 복사'}
          </button>
        </div>
        <p className="lobby-hint">
          친구에게 코드를 알려 주세요. <strong>온라인 게임 › 방 참가</strong>에서 입력하면 빈 사람
          좌석에 들어옵니다.
        </p>
      </div>
      <div className="lobby-room-meta">
        <span className="lobby-status-chip">{statusLabel}</span>
        <span className="muted">👑 방장 {hostName}</span>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onLeave}>
          🚪 방 나가기
        </button>
      </div>
    </section>
  );
}
