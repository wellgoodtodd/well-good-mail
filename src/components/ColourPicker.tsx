// Small pop up for picking an account colour: the current palette first,
// then every palette, then any colour you like.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PALETTES, paletteById } from '../lib/palettes';
import { useSettings } from '../lib/settings';

export function ColourPicker({ anchor, value, onPick, onClose }: { anchor: { x: number; y: number }; value: string; onPick: (c: string) => void; onClose: () => void }) {
  const palette = useSettings((s) => s.palette);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({ left: Math.max(6, Math.min(anchor.x, innerWidth - el.offsetWidth - 6)), top: Math.max(6, Math.min(anchor.y, innerHeight - el.offsetHeight - 6)) });
  }, [anchor, showAll]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  const lists = showAll ? PALETTES : [paletteById(palette)];
  return createPortal(
    <>
      <div className="overlay" onMouseDown={onClose} />
      <div className="colour-pop" ref={ref} style={pos} role="dialog" aria-label="Choose a colour">
        {lists.map((p) => (
          <div key={p.id}>
            <div className="pal-name">{p.name}</div>
            <div className="swatch-grid">
              {p.colours.map((c) => (
                <button key={c} className={`swatch ${c.toLowerCase() === value.toLowerCase() ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => { onPick(c); onClose(); }} />
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 8px 6px' }}>
          {!showAll && <button className="btn ghost" onClick={() => setShowAll(true)}>More palettes</button>}
          <label className="btn ghost" style={{ position: 'relative' }}>
            Custom
            <input type="color" value={value} onChange={(e) => onPick(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          </label>
        </div>
      </div>
    </>,
    document.body,
  );
}
