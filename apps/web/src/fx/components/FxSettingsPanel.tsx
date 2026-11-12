import type { AudioBus } from '../audio/soundCatalog';
import type { AudioSettings } from '../../services/audio';
import { FX_CHANNELS, type FxChannel, type FxSettings } from '../settings/fxSettings';

const BUS_LABEL: Record<AudioBus, string> = {
  master: '전체',
  music: '음악',
  sfx: '효과음',
  ui: '인터페이스',
  ambience: '환경음',
};

const CHANNEL_LABEL: Record<FxChannel, string> = {
  shake: '화면 흔들림',
  hitStop: '히트스톱',
  slowMo: '슬로모션',
  particles: '파티클',
  text: '데미지 숫자',
  flash: '화면 번쩍임',
  vignette: '비네트',
  punch: 'UI 튕김',
  sound: '효과음',
};

interface FxSettingsPanelProps {
  readonly fx: FxSettings;
  readonly audio: AudioSettings;
  readonly onFx: (patch: Partial<FxSettings>) => void;
  readonly onChannel: (channel: FxChannel, on: boolean) => void;
  readonly onReset: () => void;
  readonly onMute: (muted: boolean) => void;
  readonly onVolume: (bus: AudioBus, value: number) => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Effect, accessibility and volume settings plus the juice debug panel. Props only. */
export function FxSettingsPanel({
  fx,
  audio,
  onFx,
  onChannel,
  onReset,
  onMute,
  onVolume,
}: FxSettingsPanelProps) {
  const motion = fx.reduceMotion === null ? 'system' : fx.reduceMotion ? 'on' : 'off';
  return (
    <div className="fx-settings-panel">
      <fieldset>
        <legend>연출</legend>
        <label className="fx-row">
          <span>화면 흔들림 {pct(fx.shakeIntensity)}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(fx.shakeIntensity * 100)}
            onChange={(e) => onFx({ shakeIntensity: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="fx-row">
          <span>움직임 줄이기</span>
          <select
            value={motion}
            onChange={(e) =>
              onFx({ reduceMotion: e.target.value === 'system' ? null : e.target.value === 'on' })
            }
          >
            <option value="system">시스템 설정</option>
            <option value="on">켜기</option>
            <option value="off">끄기</option>
          </select>
        </label>
        <label className="fx-check">
          <input
            type="checkbox"
            checked={fx.photosensitive}
            onChange={(e) => onFx({ photosensitive: e.target.checked })}
          />
          광과민 보호 (화면 번쩍임 끄기)
        </label>
        <label className="fx-check">
          <input
            type="checkbox"
            checked={fx.captions}
            onChange={(e) => onFx({ captions: e.target.checked })}
          />
          중요한 소리 자막
        </label>
        <label className="fx-check">
          <input
            type="checkbox"
            checked={fx.animateBackground}
            onChange={(e) => onFx({ animateBackground: e.target.checked })}
          />
          배경 애니메이션
        </label>
      </fieldset>

      <fieldset>
        <legend>사운드</legend>
        <label className="fx-check">
          <input type="checkbox" checked={audio.muted} onChange={(e) => onMute(e.target.checked)} />
          음소거
        </label>
        {(Object.keys(BUS_LABEL) as AudioBus[]).map((bus) => (
          <label key={bus} className="fx-row">
            <span>
              {BUS_LABEL[bus]} {pct(audio.volumes[bus])}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(audio.volumes[bus] * 100)}
              onChange={(e) => onVolume(bus, Number(e.target.value) / 100)}
            />
          </label>
        ))}
        {!audio.unlocked && <p className="fx-hint">화면을 한 번 누르면 소리가 켜집니다.</p>}
      </fieldset>

      <details className="fx-debug">
        <summary>연출 디버그</summary>
        <label className="fx-check">
          <input
            type="checkbox"
            checked={fx.juice}
            onChange={(e) => onFx({ juice: e.target.checked })}
          />
          주스 켜기 (A/B 비교)
        </label>
        <div className="fx-channels">
          {FX_CHANNELS.map((ch) => (
            <label key={ch} className="fx-check">
              <input
                type="checkbox"
                checked={fx.channels[ch]}
                onChange={(e) => onChannel(ch, e.target.checked)}
              />
              {CHANNEL_LABEL[ch]}
            </label>
          ))}
        </div>
        <label className="fx-row">
          <span>파티클 양 {pct(fx.particleAmount)}</span>
          <input
            type="range"
            min={0}
            max={200}
            step={10}
            value={Math.round(fx.particleAmount * 100)}
            onChange={(e) => onFx({ particleAmount: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="fx-row">
          <span>히트스톱 배율 {pct(fx.hitStopScale)}</span>
          <input
            type="range"
            min={0}
            max={200}
            step={10}
            value={Math.round(fx.hitStopScale * 100)}
            onChange={(e) => onFx({ hitStopScale: Number(e.target.value) / 100 })}
          />
        </label>
        <button type="button" className="btn btn-ghost" onClick={onReset}>
          기본값으로
        </button>
      </details>
    </div>
  );
}
