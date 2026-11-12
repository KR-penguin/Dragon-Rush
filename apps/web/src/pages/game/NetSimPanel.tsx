import { useState } from 'react';
import { getNetDebug, setNetDebug, type NetDebugSettings } from '../../services/fight/netDebug';

const PRESETS: Record<string, NetDebugSettings> = {
  LAN: { enabled: true, upMs: 5, downMs: 5, jitterMs: 0, lossPct: 0 },
  Good: { enabled: true, upMs: 15, downMs: 15, jitterMs: 5, lossPct: 0 },
  Typical: { enabled: true, upMs: 40, downMs: 40, jitterMs: 15, lossPct: 0.5 },
  Bad: { enabled: true, upMs: 75, downMs: 75, jitterMs: 20, lossPct: 1 },
  Awful: { enabled: true, upMs: 125, downMs: 125, jitterMs: 40, lossPct: 2 },
};

/** Development-only connection emulator. The sliders take effect on the next packet. */
export function NetSimPanel() {
  const [value, setValue] = useState(getNetDebug);
  const change = (next: NetDebugSettings) => {
    setNetDebug(next);
    setValue(getNetDebug());
  };
  return (
    <details
      style={{
        position: 'absolute',
        right: 16,
        bottom: 70,
        zIndex: 20,
        padding: 8,
        background: '#1b1722',
        color: '#fff',
        borderRadius: 8,
      }}
    >
      <summary>
        가상 네트워크 · {value.enabled ? `${Math.round(value.upMs + value.downMs)}ms` : '꺼짐'}
      </summary>
      <div role="group" aria-label="네트워크 프리셋">
        <button type="button" onClick={() => change({ ...value, enabled: false })}>
          Off
        </button>
        {Object.entries(PRESETS).map(([name, preset]) => (
          <button key={name} type="button" onClick={() => change(preset)}>
            {name}
          </button>
        ))}
      </div>
      {(
        [
          ['upMs', '상향 지연', 500, 1],
          ['downMs', '하향 지연', 500, 1],
          ['jitterMs', '지터', 100, 1],
          ['lossPct', '손실 %', 10, 0.5],
        ] as const
      ).map(([key, label, max, step]) => (
        <label key={key} style={{ display: 'block' }}>
          {label}: {value[key]}
          <input
            type="range"
            min={0}
            max={max}
            step={step}
            value={value[key]}
            onChange={(event) =>
              change({ ...value, enabled: true, [key]: Number(event.target.value) })
            }
          />
        </label>
      ))}
    </details>
  );
}
