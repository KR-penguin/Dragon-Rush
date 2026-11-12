import { JOB_IDS } from '@dragon-rush/engine';
import { KEY_LAYOUTS } from '../../types/combatControls';
import { KIT_LABEL, PASSIVE_HINT } from '../../types/combatLabels';
import { JOB_ICON, JOB_LABEL } from '../../types/labels';
import { Modal } from '../common/Modal';
import { KeycapHints } from './KeycapHints';

interface ControlsPanelProps {
  /** Pressed codes while the keyboard test runs. */
  pressed: ReadonlySet<string>;
  testing: boolean;
  onToggleTest: () => void;
  onClose: () => void;
}

/** "조작법": the three key layouts, gamepad mapping, job kits and the keyboard test. */
export function ControlsPanel({ pressed, testing, onToggleTest, onClose }: ControlsPanelProps) {
  const lit = testing ? pressed : undefined;
  return (
    <Modal title="조작법" onClose={onClose} className="controls-modal">
      <section className="controls-section">
        <h3>핫시트 2인 (한 키보드)</h3>
        <div className="controls-grid">
          <div>
            <h4>P1 · 도착자 (왼쪽)</h4>
            <KeycapHints layout={KEY_LAYOUTS.p1} lit={lit} />
          </div>
          <div>
            <h4>P2 · 방어자 (오른쪽)</h4>
            <KeycapHints layout={KEY_LAYOUTS.p2} lit={lit} />
            <p className="controls-note">숫자패드가 없으면 , . / 를 쓰세요.</p>
          </div>
        </div>
      </section>
      <section className="controls-section">
        <h3>혼자 (봇·용과 전투)</h3>
        <KeycapHints layout={KEY_LAYOUTS.solo} lit={lit} />
      </section>
      <section className="controls-section">
        <h3>마우스·터치</h3>
        <p>
          전투 경기장 안에서 왼쪽 클릭하거나 터치하면 기본 공격합니다. 누르고 있으면 공격을
          유지하고, 경기장 밖으로 나가거나 손을 떼면 멈춥니다. 핫시트에서는 P1이 사용합니다.
        </p>
      </section>
      <section className="controls-section">
        <h3>게임패드</h3>
        <p>
          스틱 또는 십자키로 이동 · <kbd className="keycap">A</kbd> 공격 ·{' '}
          <kbd className="keycap">X</kbd> 스킬 · <kbd className="keycap">B</kbd>/
          <kbd className="keycap">RB</kbd> 대시. 핫시트에서는 첫 패드가 P1, 둘째 패드가 P2입니다.
        </p>
        <p className="controls-note">
          공격 버튼을 누르고 있으면 궁수는 활을 당깁니다. 전투 중 <kbd className="keycap">Esc</kbd>
          로 일시 정지합니다.
        </p>
      </section>
      <section className="controls-section">
        <h3>키보드 테스트</h3>
        <p className="controls-note">
          전투 키를 동시에 눌러 보세요. 눌린 키에 불이 들어옵니다. 함께 눌렀는데 불이 안 들어오는
          키가 있으면 (멤브레인 키보드 고스팅) P2는 , . / 배치나 게임패드를 쓰세요.
        </p>
        <div className="controls-test">
          <button
            type="button"
            className={`btn ${testing ? 'btn-primary' : 'btn-ghost'}`}
            onClick={onToggleTest}
          >
            {testing ? '테스트 끝내기' : '키보드 테스트 시작'}
          </button>
          {testing && <span className="controls-count">동시에 눌린 키: {pressed.size}개</span>}
        </div>
      </section>
      <section className="controls-section">
        <h3>직업별 기술</h3>
        <table className="controls-kits">
          <thead>
            <tr>
              <th>직업</th>
              <th>공격</th>
              <th>스킬</th>
              <th>대시</th>
              <th>패시브</th>
            </tr>
          </thead>
          <tbody>
            {JOB_IDS.map((job) => (
              <tr key={job}>
                <th>
                  {JOB_ICON[job]} {JOB_LABEL[job]}
                </th>
                <td>{KIT_LABEL[job].attack}</td>
                <td>{KIT_LABEL[job].skill}</td>
                <td>{KIT_LABEL[job].dash}</td>
                <td title={PASSIVE_HINT[job]}>{KIT_LABEL[job].passive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Modal>
  );
}
