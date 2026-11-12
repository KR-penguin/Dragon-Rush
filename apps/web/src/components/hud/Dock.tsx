import { ITEM_IDS, type ItemId, type UpgradeStat } from '@dragon-rush/engine';
import { useState } from 'react';
import type { ActionGroups } from '../../types/actionGroups';
import type { StatOption } from '../../types/decisionView';
import { ITEM_DESC, ITEM_LABEL } from '../../types/labels';
import { DiceTray, type DiceRoll } from '../board/DiceTray';
import { ItemArt } from '../icons/Art';
import { GameIcon } from '../icons/GameIcon';
import { AnvilTray } from './AnvilTray';

interface DockProps {
  status: string;
  countdown: number | null;
  error: string | null;
  dice: { value: number | null; roll: DiceRoll | null; speed: number; reduced: boolean };
  /** Main-phase buttons (PRE_ROLL / POST_MOVE) for a seat this screen controls. */
  showActions: boolean;
  locked: boolean;
  groups: ActionGroups;
  shopAvailable: boolean;
  upgrades: readonly StatOption[] | null;
  upgradeUsed: number;
  upgradeLimit: number;
  /** Items of the seat deciding here, or null. */
  items: Readonly<Record<ItemId, number>> | null;
  coins: number;
  onRoll: () => void;
  onEndTurn: () => void;
  onDragon: () => void;
  onTeleport: () => void;
  onThief: () => void;
  onShop: () => void;
  onUpgrade: (stat: UpgradeStat) => void;
}

/** Bottom dock: movement roulette, one primary verb, the crimson challenge, item cards and the anvil. */
export function Dock(props: DockProps) {
  const { groups, locked, showActions } = props;
  const [anvilOpen, setAnvilOpen] = useState(false);
  const itemUsable: Record<ItemId, (() => void) | null> = {
    teleport: groups.teleportTiles.length > 0 ? props.onTeleport : null,
    thief: groups.thiefTargets.length > 0 ? props.onThief : null,
    shield: null,
  };
  const anyUpgrade = props.upgrades?.some((o) => o.legal) ?? false;

  return (
    <section className="dock" aria-label="행동">
      <div className="dock-status" role="status">
        <span>{props.status}</span>
        {props.countdown !== null && <span className="dock-timer num">{props.countdown}초</span>}
        {props.error && <span className="dock-error">요청이 거부되었습니다 ({props.error})</span>}
      </div>
      <div className="dock-row">
        <DiceTray {...props.dice} />

        {showActions ? (
          <div className="dock-actions">
            {groups.roll && (
              <button
                type="button"
                className="btn btn-primary dock-primary"
                disabled={locked}
                onClick={props.onRoll}
              >
                <GameIcon name="roulette" /> 룰렛 돌리기
              </button>
            )}
            {groups.endTurn && (
              <button
                type="button"
                className={`btn dock-primary${groups.roll ? ' btn-ghost dock-secondary' : ' btn-primary'}`}
                disabled={locked}
                onClick={props.onEndTurn}
              >
                <GameIcon name="endTurn" /> 턴 종료
              </button>
            )}
            {groups.challengeDragon && (
              <button
                type="button"
                className="btn btn-danger dock-dragon"
                disabled={locked}
                onClick={props.onDragon}
              >
                <GameIcon name="dragon" /> 드래곤 러쉬
              </button>
            )}
            {props.shopAvailable && (
              <button
                type="button"
                className="btn dock-shop"
                disabled={locked}
                onClick={props.onShop}
              >
                <GameIcon name="tent" /> 상점
              </button>
            )}
          </div>
        ) : (
          <div className="dock-waiting">
            <GameIcon name="cooldown" />
            <span>{props.status}</span>
          </div>
        )}

        {showActions && props.items && (
          <div className="dock-items" role="group" aria-label="아이템">
            {ITEM_IDS.map((item) => {
              const n = props.items![item];
              const use = itemUsable[item];
              return (
                <button
                  key={item}
                  type="button"
                  className={`item-card${n > 0 ? '' : ' is-empty'}${use ? ' is-usable' : ''}`}
                  disabled={!use || locked}
                  onClick={use ?? undefined}
                  title={`${ITEM_LABEL[item]}: ${ITEM_DESC[item]}`}
                >
                  <ItemArt item={item} className="item-card-art" />
                  <span className="item-card-name">{ITEM_LABEL[item]}</span>
                  <b className="item-card-count impact">{n}</b>
                </button>
              );
            })}
          </div>
        )}

        {showActions && props.upgrades && (
          <div className="anvil-anchor">
            <button
              type="button"
              className={`anvil-btn${anvilOpen ? ' is-open' : ''}${anyUpgrade ? ' is-ready' : ''}`}
              onClick={() => setAnvilOpen((o) => !o)}
              aria-expanded={anvilOpen}
              aria-controls="dock-anvil-tray"
              title={`코인으로 스탯 강화 · 이번 턴 ${props.upgradeUsed}/${props.upgradeLimit}`}
            >
              <GameIcon name="anvil" />
              <span>강화</span>
            </button>
            {anvilOpen && (
              <div className="dock-above" id="dock-anvil-tray">
                <AnvilTray
                  options={props.upgrades}
                  coins={props.coins}
                  used={props.upgradeUsed}
                  limit={props.upgradeLimit}
                  disabled={locked}
                  onUpgrade={props.onUpgrade}
                  onClose={() => setAnvilOpen(false)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
