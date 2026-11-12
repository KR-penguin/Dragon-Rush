import { setMuted, setVolume } from '../../services/audio';
import { useAudioSettings, useFxSettings } from '../hooks/useFxRuntime';
import { FxSettingsPanel } from './FxSettingsPanel';

/** Collapsible settings entry point; the redesign can restyle or move it. */
export function FxSettingsDock({ className }: { className?: string }) {
  const settings = useFxSettings();
  const audio = useAudioSettings();
  return (
    <details className={className ? `fx-settings ${className}` : 'fx-settings'}>
      <summary>⚙ 연출 · 사운드</summary>
      <FxSettingsPanel
        fx={settings}
        audio={audio}
        onFx={settings.update}
        onChannel={settings.setChannel}
        onReset={settings.reset}
        onMute={setMuted}
        onVolume={setVolume}
      />
    </details>
  );
}
