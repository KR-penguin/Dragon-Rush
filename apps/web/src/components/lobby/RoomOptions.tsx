import { maxRoundsLabel } from '../../types/onlineLobby';
import { GameIcon } from '../icons/GameIcon';

interface RoomOptionsProps {
  isHost: boolean;
  editable: boolean;
  maxRounds: number | null;
  choices: readonly (number | null)[];
  activeCount: number;
  onMaxRounds: (maxRounds: number | null) => void;
}

/** Room options: max rounds (host only) and a short summary of online rules. */
export function RoomOptions({
  isHost,
  editable,
  maxRounds,
  choices,
  activeCount,
  onMaxRounds,
}: RoomOptionsProps) {
  return (
    <section className="panel lobby-options">
      <div className="field">
        <span>최대 라운드</span>
        {isHost ? (
          <div className="segmented" role="group" aria-label="최대 라운드">
            {choices.map((r) => (
              <button
                key={r ?? 'none'}
                type="button"
                className={maxRounds === r ? 'is-on' : undefined}
                aria-pressed={maxRounds === r}
                disabled={!editable}
                onClick={() => onMaxRounds(r)}
              >
                {r === null ? '없음' : r}
              </button>
            ))}
          </div>
        ) : (
          <strong className="lobby-option-value">{maxRoundsLabel(maxRounds)}</strong>
        )}
      </div>
      <div className="field">
        <span>참가 좌석</span>
        <strong className="lobby-option-value">
          <span className="impact">{activeCount}</span>
          <span className="lobby-option-of"> / 4</span>
        </strong>
      </div>
      <ul className="lobby-rules">
        <li>
          <GameIcon name="scroll" /> 직업은 좌석마다 하나씩, 겹칠 수 없습니다.
        </li>
        <li>
          <GameIcon name="cooldown" /> 사람 좌석의 결정에는 제한 시간이 있습니다. 시간이 지나면 기본
          행동이 적용됩니다.
        </li>
        <li>
          <GameIcon name="bot" /> 연결이 끊기면 봇이 대신 플레이하고, 같은 브라우저로 돌아오면
          이어서 할 수 있습니다.
        </li>
      </ul>
    </section>
  );
}
