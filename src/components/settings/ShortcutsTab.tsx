// Settings › Shortcuts.
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { useSettings } from '../../lib/settings';
import { SHORTCUTS, bindingsFor, comboFromEvent, isSingleKey, type ShortcutAction } from '../../lib/shortcuts';
import { Check } from '../ui';

export function ShortcutsTab() {
  const s = useSettings();
  const [capturing, setCapturing] = useState<{ id: string; index: number } | null>(null);
  const bindings = bindingsFor(s.keybindings);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setCapturing(null); return; }
      const combo = comboFromEvent(e);
      if (!combo) return;
      const current = [...bindingsFor(useSettings.getState().keybindings)[capturing.id as ShortcutAction]];
      current[capturing.index] = combo;
      // A combo can only belong to one action.
      const next: Record<string, string[]> = { ...useSettings.getState().keybindings, [capturing.id]: [...new Set(current)] };
      for (const def of SHORTCUTS) {
        if (def.id === capturing.id) continue;
        const theirs = bindingsFor(next)[def.id];
        if (theirs.includes(combo)) next[def.id] = theirs.filter((k) => k !== combo);
      }
      s.set({ keybindings: next });
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = (id: ShortcutAction, k: string) => s.set({ keybindings: { ...s.keybindings, [id]: bindings[id].filter((x) => x !== k) } });
  const reset = (id: ShortcutAction) => { const next = { ...s.keybindings }; delete next[id]; s.set({ keybindings: next }); };

  return (
    <>
      <h1>Keyboard Shortcuts</h1>
      <section className="set-section">
        <p className="hint">Based on Apple Mail, with Ctrl in place of Cmd. Click a shortcut to change it, or Add to give an action another one. Press Escape to cancel.</p>
        <Check checked={s.shortcuts === 'gmail'} onChange={(v) => s.set({ shortcuts: v ? 'gmail' : 'none' })}>Single key shortcuts (like E to archive, J and K to move), when you're not typing</Check>
        <table className="shortcut-table">
          <tbody>
            {SHORTCUTS.map((def) => (
              <tr key={def.id}>
                <td className="sc-label">{def.label}</td>
                <td>
                  <div className="sc-keys">
                    {bindings[def.id].map((k, i) => (
                      <span key={k} className={`kbd-chip ${isSingleKey(k) && s.shortcuts !== 'gmail' ? 'off' : ''}`}>
                        <button className="kbd-key" onClick={() => setCapturing({ id: def.id, index: i })}>
                          {capturing?.id === def.id && capturing.index === i ? 'Press keys...' : k}
                        </button>
                        <button className="kbd-x" aria-label={`Remove ${k}`} onClick={() => remove(def.id, k)}><Icon name="close" size={11} /></button>
                      </span>
                    ))}
                    {capturing?.id === def.id && capturing.index === bindings[def.id].length && <span className="kbd-chip"><span className="kbd-key">Press keys...</span></span>}
                    <button className="btn ghost" onClick={() => setCapturing({ id: def.id, index: bindings[def.id].length })}>Add</button>
                    {def.id in s.keybindings && <button className="btn ghost" onClick={() => reset(def.id)}>Reset</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => s.set({ keybindings: {} })}>Reset all to defaults</button>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>While writing: Ctrl+B, I and U for bold, italic and underline, Ctrl+K for a link, Tab and Shift+Tab to indent, Ctrl+Shift+V to paste as plain text.</p>
      </section>
    </>
  );
}

// ---------- diagnostics ----------
