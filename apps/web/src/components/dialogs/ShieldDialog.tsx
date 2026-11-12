import type { OpponentSummary } from '../../types/decisionView';
import { Modal } from '../common/Modal';
import { SeatChip } from '../common/SeatChip';
import { GameIcon } from '../icons/GameIcon';

interface ShieldDialogProps {
  deciderName: string;
  role: 'arriver' | 'defender';
  me: OpponentSummary;
  opponentName: string;
  opponent: OpponentSummary;
  canShield: boolean;
  locked: boolean;
  onDecide: (use: boolean) => void;
}

/** Challenge scroll with a choice: raise the shield or take the duel. */
export function ShieldDialog(props: ShieldDialogProps) {
  const { me, opponent, canShield, locked, onDecide } = props;
  return (
    <Modal
      className="modal-scroll"
      icon="shield"
      kicker="결투가 성립했습니다"
      title={canShield ? '방어막을 사용할까요?' : '결투 확인'}
    >
      <p>
        <strong>{props.deciderName}</strong>님({props.role === 'arriver' ? '도착자' : '방어자'})과{' '}
        <strong>{props.opponentName}</strong>님의 결투가 성립했습니다.{' '}
        {canShield
          ? `방어막 1개를 쓰면 전투가 취소되고 두 사람이 같은 칸에 머뭅니다. (보유 ${me.shields}개)`
          : '방어막이 없어 전투를 피할 수 없습니다. 준비되면 결투를 시작하세요.'}
      </p>
      <div className="versus">
        <SeatChip name={props.deciderName} summary={me} />
        <span className="versus-mark">VS</span>
        <SeatChip name={props.opponentName} summary={opponent} />
      </div>
      <div className="choice-row">
        <button
          type="button"
          className="btn btn-danger btn-lg"
          disabled={locked}
          onClick={() => onDecide(false)}
        >
          <GameIcon name="duel" /> {canShield ? '사용 안 함 (결투)' : '결투 시작'}
        </button>
        {canShield && (
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={locked}
            onClick={() => onDecide(true)}
          >
            <GameIcon name="shield" /> 방어막 사용
          </button>
        )}
      </div>
    </Modal>
  );
}
