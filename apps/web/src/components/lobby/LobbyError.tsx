interface LobbyErrorProps {
  message: string;
  onDismiss: () => void;
}

export function LobbyError({ message, onDismiss }: LobbyErrorProps) {
  return (
    <div className="lobby-error" role="alert">
      <span aria-hidden="true">⚠️</span>
      <p>{message}</p>
      <button type="button" className="icon-btn" onClick={onDismiss} aria-label="오류 닫기">
        ✕
      </button>
    </div>
  );
}
