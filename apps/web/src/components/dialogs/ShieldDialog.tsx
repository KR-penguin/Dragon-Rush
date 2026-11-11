import type { OpponentSummary } from '../../types/decisionView';
import { ITEM_ICON } from '../../types/labels';
import { Modal } from '../common/Modal';
import { SeatChip } from '../common/SeatChip';
import { WinChance } from '../common/WinChance';

interface ShieldDialogProps {
  deciderName: string;
  role: 'arriver' | 'defender';
  me: OpponentSummary;
  opponentName: string;
  opponent: OpponentSummary;
  chance: number | null;
  locked: boolean;
  onDecide: (use: boolean) => void;
}

export function ShieldDialog(props: ShieldDialogProps) {
  const { me, opponent, chance, locked, onDecide } = props;
  return (
    <Modal className="shield" title={`${ITEM_ICON.shield} 방어막을 사용할까요?`}>
      <p>
        <strong>{props.deciderName}</strong>님({props.role === 'arriver' ? '도착자' : '방어자'})과{' '}
        <strong>{props.opponentName}</strong>님의 결투가 성립했습니다. 방어막 1개를 쓰면 전투가
        취소되고 두 사람이 같은 칸에 머뭅니다. (보유 {me.shields}개)
      </p>
      <div className="versus">
        <SeatChip name={props.deciderName} summary={me} />
        <span className="versus-mark">VS</span>
        <SeatChip name={props.opponentName} summary={opponent} />
      </div>
      {chance !== null && <WinChance label="결투 예상 승리 확률" chance={chance} />}
      <div className="choice-row">
        <button
          type="button"
          className="btn btn-ghost btn-lg"
          disabled={locked}
          onClick={() => onDecide(false)}
        >
          ⚔️ 사용 안 함 (결투)
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={locked}
          onClick={() => onDecide(true)}
        >
          {ITEM_ICON.shield} 방어막 사용
        </button>
      </div>
    </Modal>
  );
}
