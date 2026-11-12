import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DragonConfirmDialog } from '../src/components/dialogs/DragonConfirmDialog';
import { PvpTargetDialog } from '../src/components/dialogs/PvpTargetDialog';
import { ShieldDialog } from '../src/components/dialogs/ShieldDialog';
import type { OpponentSummary } from '../src/types/decisionView';

vi.mock('../src/hooks/useAssetUrl', () => ({ useAssetUrl: () => null }));

const me: OpponentSummary = {
  seat: 0,
  job: 'swordsman',
  hp: 40,
  maxHp: 50,
  atk: 5,
  def: 4,
  coins: 10,
  shields: 1,
};

const opponent: OpponentSummary = { ...me, seat: 1, job: 'archer' };
const noop = () => undefined;

describe('combat decision dialogs', () => {
  it('shows the choices and stats without exposing a win prediction', () => {
    const dialogs = [
      <DragonConfirmDialog
        name="검사"
        me={me}
        dragon={{ hp: 88, atk: 10, def: 10 }}
        locked={false}
        onConfirm={noop}
        onCancel={noop}
      />,
      <PvpTargetDialog
        targets={[{ name: '궁수', summary: opponent }]}
        locked={false}
        onChoose={noop}
      />,
      <ShieldDialog
        deciderName="검사"
        role="arriver"
        me={me}
        opponentName="궁수"
        opponent={opponent}
        locked={false}
        onDecide={noop}
      />,
    ];

    for (const dialog of dialogs) {
      const html = renderToStaticMarkup(dialog);
      expect(html).toMatch(/검사|궁수/);
      const visibleText = html.replace(/<[^>]*>/g, '');
      expect(visibleText).not.toMatch(/승률|확률|예측|몬테카를로|\d+%/);
    }
  });
});
