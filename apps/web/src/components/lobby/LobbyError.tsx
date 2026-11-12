import { GameIcon } from '../icons/GameIcon';

interface LobbyErrorProps {
  message: string;
  onDismiss: () => void;
}

/** Error slip: a parchment toast with an ember edge. */
export function LobbyError({ message, onDismiss }: LobbyErrorProps) {
  return (
    <div className="lobby-error parchment" role="alert">
      <GameIcon name="warning" className="lobby-error-icon" />
      <p>{message}</p>
      <button
        type="button"
        className="icon-btn lobby-error-close"
        onClick={onDismiss}
        aria-label="오류 닫기"
      >
        <GameIcon name="close" />
      </button>
    </div>
  );
}
