import type { ItemId } from '@hero-dice/engine';
import { itemImagePath } from '../../types/assetPaths';
import type { ShopRow } from '../../types/decisionView';
import { COIN_ICON, ITEM_DESC, ITEM_ICON, ITEM_LABEL } from '../../types/labels';
import { AssetImage } from '../common/AssetImage';
import { Modal } from '../common/Modal';

interface ShopDialogProps {
  rows: readonly ShopRow[];
  coins: number;
  locked: boolean;
  onBuy: (item: ItemId) => void;
  onClose: () => void;
}

export function ShopDialog({ rows, coins, locked, onBuy, onClose }: ShopDialogProps) {
  return (
    <Modal
      className="shop"
      title="🛒 상점"
      onClose={onClose}
      footer={
        <>
          <span className="shop-coins">
            보유 코인 {COIN_ICON} <strong>{coins}</strong>
          </span>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            닫기
          </button>
        </>
      }
    >
      <ul className="shop-list">
        {rows.map((r) => (
          <li key={r.item} className="shop-row">
            <AssetImage
              className="shop-icon"
              path={itemImagePath(r.item)}
              fallback={ITEM_ICON[r.item]}
              alt={ITEM_LABEL[r.item]}
            />
            <div className="shop-info">
              <strong>{ITEM_LABEL[r.item]}</strong>
              <span className="muted">{ITEM_DESC[r.item]}</span>
              <span className="shop-owned">보유 {r.owned}개</span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={locked || !r.buyable}
              onClick={() => onBuy(r.item)}
            >
              {COIN_ICON} {r.price} 구매
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
