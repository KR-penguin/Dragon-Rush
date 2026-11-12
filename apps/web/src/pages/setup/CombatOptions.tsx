import { useState } from 'react';
import { useStore } from 'zustand';
import { CombatOptionsField } from '../../components/combat/CombatOptionsField';
import { ControlsPanel } from '../../components/combat/ControlsPanel';
import { useKeyboardTest } from '../../hooks/useKeyboardTest';
import { combatSettings } from '../../store/combatSettingsStore';
import '../../styles/combat.css';

/** Local setup: fight mode (real-time / 빠른 전투), combat bot level, controls help + keyboard test. */
export function CombatOptions() {
  const settings = useStore(combatSettings);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const pressed = useKeyboardTest(open && testing);
  return (
    <>
      <CombatOptionsField
        fastCombat={settings.fastCombat}
        botLevel={settings.botLevel}
        onFastCombat={(fastCombat) => settings.update({ fastCombat })}
        onBotLevel={(botLevel) => settings.update({ botLevel })}
        onOpenControls={() => setOpen(true)}
      />
      {open && (
        <ControlsPanel
          pressed={pressed}
          testing={testing}
          onToggleTest={() => setTesting((t) => !t)}
          onClose={() => {
            setOpen(false);
            setTesting(false);
          }}
        />
      )}
    </>
  );
}
