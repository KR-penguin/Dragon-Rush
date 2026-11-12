import { CONNECTION_LABEL, type ConnectionStatus } from '../../types/onlineLobby';
import { GameIcon } from '../icons/GameIcon';

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  onRetry?: () => void;
}

/** Server link as a gem on a dark status pill (same skin as the dock status line). */
export function ConnectionBadge({ status, onRetry }: ConnectionBadgeProps) {
  return (
    <div className={`lobby-conn is-${status}`} role="status">
      <span className="lobby-conn-gem" aria-hidden="true" />
      <span>{CONNECTION_LABEL[status]}</span>
      {onRetry && (status === 'offline' || status === 'idle') && (
        <button type="button" className="btn btn-ghost lobby-conn-retry" onClick={onRetry}>
          <GameIcon name="restart" /> 다시 연결
        </button>
      )}
    </div>
  );
}
