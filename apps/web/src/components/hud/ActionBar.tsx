import type { UpgradeStat } from '@dragon-rush/engine';
import type { ActionGroups } from '../../types/actionGroups';
import type { StatOption } from '../../types/decisionView';
import { DRAGON_ICON, ITEM_ICON } from '../../types/labels';
import { UpgradePanel } from './UpgradePanel';

interface ActionBarProps {
  status: string;
  /** Main-phase buttons (PRE_ROLL / POST_MOVE) for a seat this screen controls. */
  showActions: boolean;
  locked: boolean;
  groups: ActionGroups;
  shopAvailable: boolean;
  upgrades: readonly StatOption[] | null;
  error: string | null;
  onRoll: () => void;
  onEndTurn: () => void;
  onDragon: () => void;
  onTeleport: () => void;
  onThief: () => void;
  onShop: () => void;
  onUpgrade: (stat: UpgradeStat) => void;
}

export function ActionBar(props: ActionBarProps) {
  const { groups, locked, showActions } = props;
  return (
    <section className="action-bar" aria-label="행동">
      <div className="action-status">
        <span>{props.status}</span>
        {props.error && <span className="action-error">요청이 거부되었습니다 ({props.error})</span>}
      </div>
      {showActions && (
        <div className="action-main">
          <div className="action-buttons">
            {groups.roll && (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={locked}
                onClick={props.onRoll}
              >
                🎲 주사위 굴리기
              </button>
            )}
            {groups.teleportTiles.length > 0 && (
              <button type="button" className="btn" disabled={locked} onClick={props.onTeleport}>
                {ITEM_ICON.teleport} 텔레포트
              </button>
            )}
            {groups.thiefTargets.length > 0 && (
              <button type="button" className="btn" disabled={locked} onClick={props.onThief}>
                {ITEM_ICON.thief} 도둑
              </button>
            )}
            {props.shopAvailable && (
              <button type="button" className="btn" disabled={locked} onClick={props.onShop}>
                🛒 상점
              </button>
            )}
            {groups.challengeDragon && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={locked}
                onClick={props.onDragon}
              >
                {DRAGON_ICON} 용에게 도전
              </button>
            )}
            {groups.endTurn && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={locked}
                onClick={props.onEndTurn}
              >
                ⏭ 턴 종료
              </button>
            )}
          </div>
          {props.upgrades && (
            <UpgradePanel options={props.upgrades} disabled={locked} onUpgrade={props.onUpgrade} />
          )}
        </div>
      )}
    </section>
  );
}
