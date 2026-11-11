import { CONNECTION_LABEL, type ConnectionStatus } from '../../types/onlineLobby';

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  onRetry?: () => void;
}

export function ConnectionBadge({ status, onRetry }: ConnectionBadgeProps) {
  return (
    <div className={`lobby-conn is-${status}`} role="status">
      <span className="lobby-conn-dot" aria-hidden="true" />
      <span>{CONNECTION_LABEL[status]}</span>
      {onRetry && (status === 'offline' || status === 'idle') && (
        <button type="button" className="btn btn-ghost lobby-conn-retry" onClick={onRetry}>
          다시 연결
        </button>
      )}
    </div>
  );
}
