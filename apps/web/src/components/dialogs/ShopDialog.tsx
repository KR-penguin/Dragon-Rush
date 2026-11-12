import type { ItemId } from '@dragon-rush/engine';
import type { ShopRow } from '../../types/decisionView';
import { ITEM_DESC, ITEM_LABEL } from '../../types/labels';
import { Modal } from '../common/Modal';
import { ItemArt } from '../icons/Art';
import { GameIcon } from '../icons/GameIcon';

interface ShopDialogProps {
  rows: readonly ShopRow[];
  coins: number;
  locked: boolean;
  onBuy: (item: ItemId) => void;
  onClose: () => void;
}

/** Merchant stall: item cards on a cloth with coin price tags; what you cannot buy is chained. */
export function ShopDialog({ rows, coins, locked, onBuy, onClose }: ShopDialogProps) {
  return (
    <Modal
      className="modal-stall"
      icon="tent"
      kicker="등불 아래 상인의 좌판"
      title="상점"
      onClose={onClose}
      footer={
        <>
          <span className="purse">
            <GameIcon name="coins" /> 보유 코인 <b className="impact">{coins}</b>
          </span>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            가게 나서기
          </button>
        </>
      }
    >
      <div className="stall-awning" aria-hidden="true" />
      <ul className="stall-cloth">
        {rows.map((r) => (
          <li key={r.item}>
            <button
              type="button"
              className={`ware-card parchment${r.buyable ? '' : ' is-chained'}`}
              disabled={locked || !r.buyable}
              onClick={() => onBuy(r.item)}
              aria-label={`${ITEM_LABEL[r.item]} 구매, 코인 ${r.price}`}
            >
              <ItemArt item={r.item} className="ware-art" />
              <strong className="ware-name">{ITEM_LABEL[r.item]}</strong>
              <span className="ware-desc">{ITEM_DESC[r.item]}</span>
              <span className="ware-owned">보유 {r.owned}개</span>
              <span className="price-tag">
                <GameIcon name="coins" /> <b className="impact">{r.price}</b>
              </span>
              {!r.buyable && <span className="ware-chain" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
