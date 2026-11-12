// Settings › Appearance.
import { useState } from 'react';
import { Icon } from '../Icon';
import { PALETTES } from '../../lib/palettes';
import { useMail, refreshAccountPhotos, applyPalette, toast } from '../../lib/mail';
import { useSettings, defaultSettings, type Settings as S } from '../../lib/settings';
import { undoSteps } from '../../lib/history';
import { SKINS, type Skin } from '../../lib/skins';
import { TextSizeSlider } from './shared';
import { Row, Radio, Check } from '../ui';

export function AppearanceTab() {
  const s = useSettings();
  const accounts = useMail((st) => st.accounts);
  const palette = useSettings((st) => st.palette);
  const stripe = useSettings((st) => st.showAccountStripe);
  const systemDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = s.theme === 'system' ? (systemDark ? 'dark' : 'light') : s.theme;
  const activeId = mode === 'dark' ? s.darkSkin : s.lightSkin;
  const [showLooks, setShowLooks] = useState(false);
  const choose = (k: Skin) => {
    s.set({ ...(k.mode === 'dark' ? { darkSkin: k.id } : { lightSkin: k.id }), ...(s.theme !== 'system' ? { theme: k.mode } : {}), accent: k.accent });
    applyPalette(s.colourBlindAccounts ? 'accessible' : `skin-${k.id}`);
  };
  // One section back to how it started (one Undo step).
  const resetPart = (what: string, patch: Partial<S>) => {
    s.set(patch);
    toast({ text: `${what} set back to the default.`, undo: () => void undoSteps(1) });
  };
  const d0 = defaultSettings;
  const partReset = (what: string, patch: Partial<S>) => <button className="link-btn set-reset" onClick={() => resetPart(what, patch)} title={`Set ${what.toLowerCase()} back to the default`}>Reset</button>;
  // Back to how the app first looked. One step in Undo; account colours are left as you set them.
  const resetLook = () => {
    const d = defaultSettings;
    s.set({ theme: d.theme, accent: d.accent, density: d.density, textScale: d.textScale, darkSkin: d.darkSkin, lightSkin: d.lightSkin, colourBlindAccounts: d.colourBlindAccounts, panePosition: d.panePosition, previewLines: d.previewLines, threaded: d.threaded, newestFirstInThread: d.newestFirstInThread, badges: d.badges, unreadColour: d.unreadColour, showAccountStripe: d.showAccountStripe, accountIcons: d.accountIcons, senderPhotos: d.senderPhotos, toolbarOrder: d.toolbarOrder });
    toast({ text: 'Appearance set back to the default. Account colours are unchanged.', undo: () => void undoSteps(1) });
  };
  return (
    <>
      <div className="set-title-row">
        <h1>Appearance</h1>
        <button className="btn small" onClick={resetLook} title="Theme, colours, text size, layout and counts back to how they started">Reset to defaults</button>
      </div>
      <section className="set-section">
        <div className="set-h2-row"><h2>Colour theme</h2>{partReset('Colour theme', { theme: d0.theme, accent: d0.accent, darkSkin: d0.darkSkin, lightSkin: d0.lightSkin, colourBlindAccounts: d0.colourBlindAccounts })}</div>
        <p className="hint">Each look changes the whole app and brings its own account colours. Pick one, then change any colour you like.</p>
        <button className="btn look-toggle" aria-expanded={showLooks} onClick={() => setShowLooks(!showLooks)}>{SKINS.find((k) => k.id === activeId)?.name || 'Choose a look'} <Icon name={showLooks ? 'chevronDown' : 'chevronRight'} size={13} /></button>
        {showLooks && <div className="skin-grid">
          {SKINS.map((k) => (
            <button key={k.id} className={`skin-tile ${k.id === activeId ? 'on' : ''}`} aria-pressed={k.id === activeId} onClick={() => choose(k)}>
              {/* Three bars: the background, the panels, and the accent. */}
              <span className="skin-sw bars" aria-hidden>
                <i style={{ background: k.vars['--bg'] || (k.mode === 'dark' ? '#1c1c1e' : '#ffffff') }} />
                <i style={{ background: k.vars['--bg-elev'] || k.vars['--bg-sidebar'] || (k.mode === 'dark' ? '#2a2a2e' : '#f2f2f4') }} />
                <i className="acc" style={{ background: k.accent }} />
              </span>
              <b>{k.name}</b>
              <small>{k.blurb}</small>
            </button>
          ))}
        </div>}
      </section>
      {/* Every colour choice in one calm card, one row each, instead of separate rows of dots across the page. */}
      <section className="set-section">
        <div className="set-h2-row"><h2>Colours</h2>{partReset('Colours', { accent: d0.accent, unreadColour: d0.unreadColour, colourBlindAccounts: d0.colourBlindAccounts, showAccountStripe: d0.showAccountStripe })}</div>
        <div className="colour-rows">
          <div className="colour-row">
            <span className="k">Accent</span>
            <span className="swatches">
              {['#3B82F6', '#0A84FF', '#EEC32A', '#1EAB8F', '#A855F7', '#EF4444'].map((c) => (
                <button key={c} className={`swatch ${s.accent.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ background: c }} aria-label={`Accent ${c}`} onClick={() => s.set({ accent: c })} />
              ))}
              <input type="color" aria-label="Your own accent colour" title="Your own colour" value={s.accent} onChange={(e) => s.set({ accent: e.target.value })} />
            </span>
          </div>
          <div className="colour-row">
            <span className="k">Account colours</span>
            <span className="swatches">
              <select aria-label="Account colour palette" value={palette} onChange={(e) => applyPalette(e.target.value)}>
                {!PALETTES.some((p) => p.id === palette) && <option value={palette}>Your own colours</option>}
                {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <span className="chips-preview">{[...accounts].sort((a, b) => a.order - b.order).slice(0, 8).map((a) => <span key={a.id} title={a.label} style={{ background: a.colour }} />)}</span>
            </span>
          </div>
          <div className="colour-row">
            <span className="k">Unread dot</span>
            <span className="swatches">
              {['', '#3B82F6', '#E5484D', '#1EAB8F', '#EEC32A'].map((c) => (
                <button key={c || 'accent'} className={`swatch ${s.unreadColour === c ? 'on' : ''}`} style={{ background: c || s.accent }} aria-label={c ? `Unread colour ${c}` : 'Same as accent'} title={c ? c : 'Same as accent colour'} onClick={() => s.set({ unreadColour: c })} />
              ))}
            </span>
          </div>
        </div>
        <p className="hint">Click any account's dot in the sidebar, or its square in Settings › Accounts, to give it its own colour.</p>
        <Check checked={s.colourBlindAccounts} onChange={(v) => { s.set({ colourBlindAccounts: v }); applyPalette(v ? 'accessible' : `skin-${activeId}`); }}>Colour blind friendly account colours (works with any theme)</Check>
        <Check checked={stripe} onChange={(v) => useSettings.getState().set({ showAccountStripe: v })}>Show the account colour stripe on each email</Check>
      </section>
      <section className="set-section">
        <div className="set-h2-row"><h2>Display</h2>{partReset('Display', { theme: d0.theme, textScale: d0.textScale, density: d0.density })}</div>
        <Row label="Theme">
          <Radio name="theme" value={s.theme} onChange={(v) => s.set({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Follow Windows' }]} />
        </Row>
        <Row label="Text size" htmlFor="scale">
          <TextSizeSlider id="scale" />
        </Row>
        <Row label="List spacing">
          <Radio name="density" value={s.density} onChange={(v) => s.set({ density: v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }, { value: 'roomy', label: 'Roomy' }]} />
        </Row>
      </section>
      <section className="set-section">
        <div className="set-h2-row"><h2>Unread counts</h2>{partReset('Unread counts', { badges: d0.badges })}</div>
        <p className="hint">The numbers next to mailboxes in the sidebar. A collapsed account shows the total of everything underneath it. Right click any mailbox to hide just its count.</p>
        <Check checked={s.badges.enabled} onChange={(v) => s.set({ badges: { ...s.badges, enabled: v } })}>Show unread counts</Check>
        {s.badges.enabled && (
          <>
            <div className="set-row">
              <span className="label">Count</span>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <Check checked={s.badges.inbox} onChange={(v) => s.set({ badges: { ...s.badges, inbox: v } })}>Unread in Inbox</Check>
                <Check checked={s.badges.drafts} onChange={(v) => s.set({ badges: { ...s.badges, drafts: v } })}>Drafts</Check>
                <Check checked={s.badges.labels} onChange={(v) => s.set({ badges: { ...s.badges, labels: v } })}>Unread in labels</Check>
                <Check checked={s.badges.junk} onChange={(v) => s.set({ badges: { ...s.badges, junk: v } })}>Unread in Junk</Check>
                <Check checked={s.badges.flagged} onChange={(v) => s.set({ badges: { ...s.badges, flagged: v } })}>Flagged</Check>
              </div>
            </div>
            <Row label="Style">
              <Radio name="badgestyle" value={s.badges.style} onChange={(v) => s.set({ badges: { ...s.badges, style: v } })} options={[{ value: 'pill', label: 'Coloured badge' }, { value: 'plain', label: 'Plain number' }, { value: 'dot', label: 'Just a dot (no numbers)' }]} />
            </Row>
            {s.badges.style !== 'plain' && (
              <Row label="Badge colour">
                {['#F28C76', '#F5B971', '#8FB8F2', '#7DCFB6', '#B9A7E8', '#A9A9B0', '#E5484D'].map((c) => (
                  <button key={c} className={`swatch ${s.badges.colour === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Badge colour ${c}`} onClick={() => s.set({ badges: { ...s.badges, colour: c } })} />
                ))}
                <input type="color" aria-label="Custom badge colour" value={s.badges.colour} onChange={(e) => s.set({ badges: { ...s.badges, colour: e.target.value } })} />
              </Row>
            )}
          </>
        )}
      </section>
      <section className="set-section">
        <div className="set-h2-row"><h2>Pictures</h2>{partReset('Pictures', { accountIcons: d0.accountIcons, senderPhotos: d0.senderPhotos })}</div>
        <Check checked={s.accountIcons} onChange={(v) => { s.set({ accountIcons: v }); if (v) refreshAccountPhotos(); }}>Use each Google account's profile picture in the sidebar instead of its coloured dot</Check>
        <Check checked={s.senderPhotos} onChange={(v) => s.set({ senderPhotos: v })}>Show a small photo or initials beside each message in the list</Check>
      </section>
      <section className="set-section">
        <div className="set-h2-row"><h2>Layout</h2>{partReset('Layout', { panePosition: d0.panePosition, previewLines: d0.previewLines, threaded: d0.threaded, newestFirstInThread: d0.newestFirstInThread, sidebarVisible: d0.sidebarVisible, toolbarOrder: d0.toolbarOrder })}</div>
        <Row label="Reading pane">
          <Radio name="pane" value={s.panePosition} onChange={(v) => s.set({ panePosition: v })} options={[{ value: 'right', label: 'On the right' }, { value: 'bottom', label: 'Below the list' }, { value: 'off', label: 'Off (open emails in their own window)' }]} />
        </Row>
        <Row label="Preview lines" htmlFor="plines">
          <select id="plines" value={s.previewLines} onChange={(e) => s.set({ previewLines: Number(e.target.value) as S['previewLines'] })}>
            <option value={0}>None</option><option value={1}>1 line</option><option value={2}>2 lines</option><option value={3}>3 lines</option>
          </select>
        </Row>
        <Check checked={s.threaded} onChange={(v) => s.set({ threaded: v })}>Group replies into conversations</Check>
        <Check checked={s.newestFirstInThread} onChange={(v) => s.set({ newestFirstInThread: v })}>Show the newest message first in an open conversation</Check>
        <Check checked={s.sidebarVisible} onChange={(v) => s.set({ sidebarVisible: v })}>Show the mailbox sidebar (Ctrl+Shift+S)</Check>
        <button className="btn ghost" onClick={() => s.set({ sidebarWidth: 240, listWidth: 380, listHeight: 320 })}>Reset column sizes</button>
        <button className="btn ghost" onClick={() => s.set({ toolbarOrder: ['archive', 'bin', 'junk', 'read', 'flag', 'snooze', 'popout', 'more'] })}>Reset toolbar order</button>
      </section>
    </>
  );
}

// ---------- writing ----------
