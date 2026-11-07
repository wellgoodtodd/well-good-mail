// Undo and redo beside New email. Each has a small arrow (or press and hold) that lists the last 10 steps, like a
// browser's back button.
import { useRef } from 'react';
import { Icon, type IconName } from './Icon';
import { useMenu } from './ui';
import { ago, redoSteps, undoSteps, useHistory } from '../lib/history';

function Step({ kind }: { kind: 'undo' | 'redo' }) {
  const list = useHistory((s) => (kind === 'undo' ? s.past : s.future));
  const menu = useMenu();
  const group = useRef<HTMLDivElement>(null);
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; fired?: boolean }>({});
  // Newest first: for undo that is the step just taken, for redo the one that would come back next.
  const items = [...list].reverse().slice(0, 10);
  const word = kind === 'undo' ? 'Undo' : 'Redo';
  const run = (n: number) => (kind === 'undo' ? undoSteps(n) : redoSteps(n));
  const has = items.length > 0;
  const openList = () => {
    if (!has || !group.current) return;
    menu.open(
      group.current.getBoundingClientRect(),
      [
        { heading: kind === 'undo' ? 'Undo back to here' : 'Redo up to here' },
        ...items.map((e, i) => ({ label: e.label, kbd: ago(e.at), onClick: () => { run(i + 1); } })),
      ],
    );
  };
  const icon: IconName = kind === 'undo' ? 'undo' : 'redo';
  return (
    <div ref={group} className={`ur-group ${has ? 'has' : ''}`}>
      <button
        className="ur-main"
        disabled={!has}
        aria-label={has ? `${word} ${items[0].label}` : `Nothing to ${word.toLowerCase()}`}
        title={has ? `${word}: ${items[0].label} (${kind === 'undo' ? 'Ctrl+Z' : 'Ctrl+Y'}). Hold for the list.` : `Nothing to ${word.toLowerCase()}`}
        onPointerDown={() => {
          hold.current.fired = false;
          hold.current.timer = setTimeout(() => { hold.current.fired = true; openList(); }, 450);
        }}
        onPointerUp={() => clearTimeout(hold.current.timer)}
        onPointerLeave={() => clearTimeout(hold.current.timer)}
        onClick={() => { if (!hold.current.fired) run(1); hold.current.fired = false; }}
      >
        <Icon name={icon} size={16} />
      </button>
      <button className="ur-arrow" disabled={!has} aria-label={`${word} history`} title={`${word} history`} onClick={openList}>
        <Icon name="chevronDown" size={12} />
      </button>
      {menu.node}
    </div>
  );
}

export function UndoRedo() {
  return (
    <span className="ur-pair">
      <Step kind="undo" />
      <Step kind="redo" />
    </span>
  );
}
