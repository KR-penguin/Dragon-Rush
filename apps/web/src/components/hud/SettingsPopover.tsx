import { FxSettingsPanel, useAudioSettings, useFxSettings } from '../../fx';
import { setMuted, setVolume } from '../../services/audio';
import { GameIcon } from '../icons/GameIcon';

/** Effects, accessibility and volume settings (the FX toolkit's panel) on a parchment note. */
export function SettingsPopover({ onClose }: { onClose: () => void }) {
  const settings = useFxSettings();
  const audio = useAudioSettings();
  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="settings-popover" role="dialog" aria-label="연출 · 사운드 설정">
        <header>
          <GameIcon name="settings" />
          <strong>연출 · 사운드</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="설정 닫기">
            <GameIcon name="close" />
          </button>
        </header>
        <FxSettingsPanel
          fx={settings}
          audio={audio}
          onFx={settings.update}
          onChannel={settings.setChannel}
          onReset={settings.reset}
          onMute={setMuted}
          onVolume={setVolume}
        />
      </aside>
    </div>
  );
}
