import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShieldNotice } from '../src/components/hud/ShieldNotice';
import { shieldNoticeFor } from '../src/hooks/useShieldNotice';

describe('shield use notice', () => {
  it('shows another player using a shield and cancelling the duel', () => {
    const notice = shieldNoticeFor({ type: 'ShieldUsed', seat: 1, against: 0 }, [
      { seat: 0, name: '나' },
      { seat: 1, name: '상대' },
    ]);
    expect(notice).toEqual({ seat: 1, name: '상대' });
    const html = renderToStaticMarkup(<ShieldNotice notice={{ ...notice!, key: 1 }} />);
    expect(html).toContain('상대님이 방어막을 사용했습니다');
    expect(html).toContain('결투 취소');
    expect(html).toContain('role="status"');
  });

  it('ignores unrelated events', () => {
    expect(shieldNoticeFor({ type: 'TurnEnded', seat: 0 }, [{ seat: 0, name: '나' }])).toBeNull();
  });
});
