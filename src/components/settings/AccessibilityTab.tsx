// Settings › Accessibility.
import { useMail } from '../../lib/mail';
import { useSettings } from '../../lib/settings';
import { openExternal } from '../../lib/platform';
import { Row, Radio, Check, TextSizeSlider } from './shared';

/** Opens a page of Windows Settings. */
export const winSettings = (page: string) => () => { void openExternal(`ms-settings:${page}`); };

export function AccessibilityTab() {
  const s = useSettings();
  const easy = s.interfaceFont === 'Atkinson Hyperlegible';
  return (
    <>
      <h1>Accessibility</h1>
      <section className="set-section">
        <h2>Seeing</h2>
        <Row label="Text size" htmlFor="scale-a11y">
          <TextSizeSlider id="scale-a11y" />
        </Row>
        <Row label="Row spacing" htmlFor="density-a11y">
          <select id="density-a11y" value={s.density} onChange={(e) => s.set({ density: e.target.value as 'compact' | 'comfortable' | 'roomy' })}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="roomy">Roomy, bigger targets</option>
          </select>
        </Row>
        <Row label="Keyboard focus" htmlFor="focusring">
          <select id="focusring" value={s.focusRing} onChange={(e) => s.set({ focusRing: e.target.value as 'standard' | 'bold' })}>
            <option value="standard">Standard ring</option>
            <option value="bold">Bold ring, easier to spot</option>
          </select>
        </Row>
        <Check checked={easy} onChange={(v) => s.set({ interfaceFont: v ? 'Atkinson Hyperlegible' : 'Inter' })} >Easy-read font<span className="check-sub">Atkinson Hyperlegible, made for people with low vision. Also in Appearance.</span></Check>
        <Check checked={s.underlineLinks} onChange={(v) => s.set({ underlineLinks: v })} >Underline links<span className="check-sub">In emails and the app, so links don't rely on colour alone.</span></Check>
        <Check checked={s.strongBorders} onChange={(v) => s.set({ strongBorders: v })} >Stronger borders<span className="check-sub">Clearer edges on buttons, boxes and cards.</span></Check>
      </section>
      <section className="set-section">
        <h2>Windows Settings</h2>
        <p className="hint" style={{ margin: '0 0 10px' }}>Well Good Mail follows these. Each button opens the page in Windows Settings.</p>
        <div className="win-settings">
          <button className="btn" onClick={winSettings('easeofaccess-highcontrast')}>Contrast themes</button>
          <button className="btn" onClick={winSettings('easeofaccess-visualeffects')}>Animation effects</button>
          <button className="btn" onClick={winSettings('easeofaccess-display')}>Text size</button>
          <button className="btn" onClick={winSettings('easeofaccess-mousepointer')}>Mouse pointer and caret</button>
        </div>
      </section>
      <section className="set-section">
        <h2>Motion</h2>
        <Radio name="motion" value={s.motion} onChange={(v) => s.set({ motion: v })} options={[
          { value: 'system', label: 'Follow Windows', sub: 'Uses "Animation effects" in Windows Settings › Accessibility › Visual effects.' },
          { value: 'reduce', label: 'Keep things still', sub: 'No sliding, fading or pulsing anywhere in the app.' },
        ]} />
      </section>
      <section className="set-section">
        <h2>Keyboard and Narrator</h2>
        <p className="hint" style={{ margin: 0 }}>Everything works from the keyboard: Tab and Shift+Tab move between controls, the arrow keys move through lists, Enter opens and Escape closes. Every button and box has a name that Windows Narrator reads out.</p>
        <div style={{ marginTop: 10 }}><button className="btn" onClick={() => useMail.setState({ settingsTab: 'shortcuts' })}>Keyboard Shortcuts</button></div>
      </section>
    </>
  );
}
