// Out of Office templates: the Template bar at the top of the page (the Templates drop-down, the Changed pill with
// Update template and Save as new), the "Update [name] too?" question before Schedule or Turn on, Save as new template
// (a name and ticks for each part, a whole group at a time or one by one) and Manage templates (rename, duplicate,
// save current settings to it, choose parts, delete).
import { useState, type MouseEvent } from 'react';
import { Dialog, useMenu, type MenuItem } from './ui';
import { Icon } from './Icon';
import { useMail, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { TEMPLATES, htmlToText, type OooPlan } from '../lib/ooo';
import { PART_GROUPS, changedWords, copyTemplate, daysWords, findTemplate, partsWords, applyTemplate, templateChanges, templateFor, templateFromPlan, withTemplatePicked, templateSummary, updateTemplateFromPlan, type OooPart, type OooTemplate } from '../lib/oooTemplates';

const accName = (id: string) => { const a = useMail.getState().accounts.find((x) => x.id === id); return a ? a.label || a.email : 'an account'; };
const saveList = (list: OooTemplate[]) => useSettings.getState().set({ oooTemplates: list });
const BUILT_IN = 'builtin:';
/** Remembers the template last applied, in the plan, so it survives a reload. */
const setLast = (last: NonNullable<OooPlan['lastTemplate']>) => useSettings.getState().set({ ooo: withTemplatePicked(useSettings.getState().ooo, last.id, last.editing) });

/** Puts a saved template into the page, with Undo. `editing` is the account whose own message is showing, if any. */
export function applyToPage(t: OooTemplate, editing?: string) {
  const before = useSettings.getState().ooo;
  useSettings.getState().set({ ooo: withTemplatePicked(applyTemplate(before, t, { editing }), t.id, editing) });
  toast({ text: `Applied ${t.name}: ${partsWords(t)}.`, ttl: 8000, undo: () => useSettings.getState().set({ ooo: before }) });
}

/** The saved template last applied, and what's been changed on the page since, if anything. */
export function templateChange(plan: OooPlan, list: OooTemplate[], last = plan.lastTemplate): { t: OooTemplate; parts: OooPart[]; editing?: string } | undefined {
  const t = last ? list.find((x) => x.id === last.id) : undefined;
  if (!last || !t) return undefined;
  const parts = templateChanges(t, plan, last.editing);
  return parts.length ? { t, parts, editing: last.editing } : undefined;
}

/** The changes the person chose to leave out of the template, so the question isn't asked again for the same ones. */
let leftAlone = '';
const changeKey = (c: NonNullable<ReturnType<typeof templateChange>>, plan: OooPlan) => `${c.t.id}|${JSON.stringify(updateTemplateFromPlan(c.t, plan, c.editing))}`;

/** True when Schedule or Turn on should first ask "Update [name] too?". */
export function shouldAskAboutTemplate(plan: OooPlan, list: OooTemplate[]): boolean {
  const c = templateChange(plan, list);
  return Boolean(c && changeKey(c, plan) !== leftAlone);
}

/** Saves the page into the template, only the parts it keeps. */
function updateTemplate(t: OooTemplate, editing?: string) {
  const list = useSettings.getState().oooTemplates;
  saveList(list.map((x) => (x.id === t.id ? updateTemplateFromPlan(t, useSettings.getState().ooo, editing) : x)));
  toast({ text: `${t.name} updated.`, ttl: 3000 });
}

/**
 * The Template bar: the Templates drop-down (your templates, the built-in messages, Save as new and Manage), and once
 * something the applied template keeps has changed, a Changed pill with Update template and Save as new.
 */
export function TemplateBar({ editing, onBuiltIn }: { editing?: string; onBuiltIn: (t: (typeof TEMPLATES)[number]) => void }) {
  const mine = useSettings((s) => s.oooTemplates);
  const plan = useSettings((s) => s.ooo);
  const [dialog, setDialog] = useState<null | 'save' | 'saveFrom' | 'manage'>(null);
  const menu = useMenu();
  // The template for the message showing: each account tab keeps its own.
  const shown = templateFor(plan, editing);
  const lastId = shown?.id || '';
  const current = mine.find((t) => t.id === lastId);
  const builtIn = lastId.startsWith(BUILT_IN) ? TEMPLATES.find((t) => BUILT_IN + t.id === lastId) : undefined;
  const change = templateChange(plan, mine, shown);
  const open = (e: MouseEvent<HTMLButtonElement>) => {
    const items: MenuItem[] = [];
    if (mine.length) items.push({ heading: 'Your templates' }, ...mine.map((t) => ({ label: t.name, active: t.id === lastId, onClick: () => applyToPage(t, editing) })));
    items.push({ heading: 'Built in (message only)' }, ...TEMPLATES.map((t) => ({ label: t.name, active: BUILT_IN + t.id === lastId, onClick: () => { onBuiltIn(t); setLast({ id: BUILT_IN + t.id, editing }); } })));
    items.push({ divider: true }, { label: 'Save as new template…', onClick: () => setDialog('save') });
    if (mine.length) items.push({ label: 'Manage templates…', onClick: () => setDialog('manage') });
    menu.open(e.currentTarget.getBoundingClientRect(), items);
  };
  return (
    <div className="ooo-tplbar">
      <span className="ooo-tplbar-label">Template</span>
      <button className="ooo-dd" aria-haspopup="menu" aria-label="Templates" onClick={open}>
        <span>{current?.name || builtIn?.name || 'Choose a template'}</span><Icon name="chevronDown" size={13} />
      </button>
      {change && <span className="ooo-changed" title={`Changed since you picked it: ${changedWords(change.parts)}`}>Changed</span>}
      <span className="grow" />
      {change && (
        <span className="ooo-tplbar-actions">
          <button className="btn ghost" onClick={() => updateTemplate(change.t, change.editing)}>Update template</button>
          <button className="btn ghost" onClick={() => setDialog('saveFrom')}>Save as new…</button>
        </span>
      )}
      {menu.node}
      {dialog === 'save' && <SaveTemplateDialog editing={editing} onClose={() => setDialog(null)} onSaved={(t) => setLast({ id: t.id, editing })} />}
      {dialog === 'saveFrom' && change && <SaveTemplateDialog editing={change.editing} parts={change.t.parts} onClose={() => setDialog(null)} onSaved={(t) => setLast({ id: t.id, editing: change.editing })} />}
      {dialog === 'manage' && <ManageTemplatesDialog editing={editing} onClose={() => setDialog(null)} />}
    </div>
  );
}

/**
 * Asked once when Schedule or Turn on is pressed with a changed template: leave it, save as new, or update it.
 * Whichever is chosen, Out of Office then goes ahead (`onDone`). Closing the window goes back to the page instead.
 */
export function UpdateTemplateQuestion({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const plan = useSettings((s) => s.ooo);
  const mine = useSettings((s) => s.oooTemplates);
  const [saving, setSaving] = useState(false);
  const [change] = useState(() => templateChange(plan, mine));
  if (!change) return null;
  if (saving) return <SaveTemplateDialog editing={change.editing} parts={change.t.parts} onClose={onDone} onSaved={(t) => setLast({ id: t.id, editing: change.editing })} />;
  return (
    <Dialog title={`Update ${change.t.name} too?`} onClose={onClose} actions={<div className="ooo-q-actions">
      <button className="btn" onClick={() => { leftAlone = changeKey(change, plan); onDone(); }}>Leave the template as it was</button>
      <span className="grow" />
      <button className="btn" onClick={() => setSaving(true)}>Save as new…</button>
      <button className="btn primary" onClick={() => { updateTemplate(change.t, change.editing); onDone(); }}>Update template</button>
    </div>}>
      <p className="hint" style={{ margin: 0 }}>You changed {changedWords(change.parts)} since picking the template. Out of Office goes ahead whichever you choose.</p>
    </Dialog>
  );
}

/** What each part is set to now, in a few words, so it's clear what a tick keeps. */
function partNow(p: OooPart, plan: OooPlan, editing?: string): string {
  const msg = editing && plan.own[editing] ? plan.own[editing] : plan.message;
  const short = (s: string) => (s.length > 70 ? `${s.slice(0, 68).trimEnd()}…` : s);
  switch (p) {
    case 'subject': return msg.subject ? `"${short(msg.subject)}"` : 'No subject';
    case 'message': return `"${short(htmlToText(msg.html))}"`;
    case 'outside': return msg.outsideHtml ? `"${short(htmlToText(msg.outsideHtml))}"` : 'None written';
    case 'mode': return plan.mode === 'open' ? 'Until I turn it off' : 'Between dates';
    case 'days': return plan.mode === 'dates' && plan.firstDay && plan.backOn ? `${daysWords(templateFromPlan('', ['days'], plan).days!)}. Saved as days, never fixed dates.` : 'No dates set';
    case 'times': return plan.useTimes ? `${plan.startTime} to ${plan.backTime}` : 'Whole days';
    case 'audience': return plan.audience === 'contacts' ? 'My contacts only' : plan.audience === 'org' ? 'People in my organisation only' : 'Everyone';
    case 'outsideAudience': return `${plan.outsideAudience === 'none' ? 'Nobody' : plan.outsideAudience === 'contacts' ? 'Contacts only' : 'Everyone'}${plan.outsideDifferent ? ', with its own message' : ''}`;
    case 'accounts': return plan.accounts.length ? plan.accounts.map(accName).join(', ') : 'None ticked';
    case 'own': { const ids = Object.keys(plan.own); return ids.length ? ids.map(accName).join(', ') : 'None'; }
    default: return (plan[p as 'addEvent'] ? 'On' : 'Off');
  }
}

/** Parts ticked to start with: the message and when, and who gets it. */
const DEFAULT_PARTS: OooPart[] = ['subject', 'message', 'mode', 'days', 'times', 'audience'];

/** The ticks: each group can be ticked whole (or half-ticked), and each part on its own. */
function PartTicks({ parts, setParts, plan, editing }: { parts: OooPart[]; setParts: (p: OooPart[]) => void; plan: OooPlan; editing?: string }) {
  const has = (p: OooPart) => parts.includes(p);
  const flip = (p: OooPart) => setParts(has(p) ? parts.filter((x) => x !== p) : [...parts, p]);
  return (
    <div className="tpl-groups">
      {PART_GROUPS.map((g) => {
        const ids = g.parts.map((p) => p.id);
        const n = ids.filter(has).length;
        return (
          <div key={g.id} className="tpl-group">
            <label className="check tpl-group-head">
              <input type="checkbox" checked={n === ids.length} ref={(el) => { if (el) el.indeterminate = n > 0 && n < ids.length; }}
                onChange={() => setParts(n === ids.length ? parts.filter((p) => !ids.includes(p)) : [...new Set([...parts, ...ids])])} />
              <b>{g.label}</b>
            </label>
            {g.parts.map((p) => (
              <label key={p.id} className="check tpl-part">
                <input type="checkbox" checked={has(p.id)} onChange={() => flip(p.id)} />
                <span>{p.label}<small>{partNow(p.id, plan, editing)}</small></span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Save as new template, or (with `existing`) change what a template keeps. */
function SaveTemplateDialog({ editing, existing, parts: startParts, onClose, onSaved }: { editing?: string; existing?: OooTemplate; parts?: OooPart[]; onClose: () => void; onSaved?: (t: OooTemplate) => void }) {
  const plan = useSettings((s) => s.ooo);
  const list = useSettings((s) => s.oooTemplates);
  const [name, setName] = useState(existing?.name || '');
  const [parts, setParts] = useState<OooPart[]>(existing?.parts || startParts || DEFAULT_PARTS);
  const same = findTemplate(list, name);
  const replacing = Boolean(same && same.id !== existing?.id);
  const bad = !name.trim() ? 'Give the template a name.' : !parts.length ? 'Tick at least one thing to keep.' : '';
  const save = () => {
    if (bad) return;
    const fresh = templateFromPlan(name, parts, plan, { id: existing?.id || same?.id, editing });
    // Changing what a template keeps: parts it already had keep their saved values; new ones come from the page.
    const t: OooTemplate = existing ? { ...fresh, ...mergeKept(existing, fresh) } : fresh;
    const others = list.filter((x) => x.id !== t.id && x.id !== same?.id);
    saveList([...others, t].sort((a, b) => list.findIndex((x) => x.id === a.id) - list.findIndex((x) => x.id === b.id)));
    toast({ text: existing ? `${t.name} now keeps: ${partsWords(t)}.` : replacing ? `${t.name} replaced.` : `Saved ${t.name}. Pick it from Templates.`, ttl: 4000 });
    onSaved?.(t);
    onClose();
  };
  return (
    <Dialog title={existing ? `What ${existing.name} keeps` : 'Save as new template'} onClose={onClose} actions={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={Boolean(bad)} onClick={save}>{existing ? 'Save' : replacing ? 'Replace template' : 'Save template'}</button>
    </>}>
      {!existing && <input className="cg-name" aria-label="Template name" placeholder="Friday afternoons, Filming days..." value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />}
      <p className="hint tpl-include">{existing ? 'Parts it already keeps stay as saved. Newly ticked parts are taken from the page now.' : 'Include. Applying it later changes only the ticked parts.'}</p>
      <PartTicks parts={parts} setParts={setParts} plan={plan} editing={editing} />
      {replacing && <p className="hint ev-note">There's already a template called {same!.name}. Saving replaces it.</p>}
    </Dialog>
  );
}

/** The saved values for parts a template already had, so changing its ticks doesn't overwrite them. */
function mergeKept(old: OooTemplate, fresh: OooTemplate): Partial<OooTemplate> {
  const kept = fresh.parts.filter((p) => old.parts.includes(p));
  const message = { ...(fresh.message || {}) };
  if (kept.includes('subject') && old.message?.subject !== undefined) message.subject = old.message.subject;
  if (kept.includes('message') && old.message?.html !== undefined) message.html = old.message.html;
  if (kept.includes('outside') && old.message?.outsideHtml !== undefined) message.outsideHtml = old.message.outsideHtml;
  const values = { ...fresh.values };
  const copy = (keys: (keyof OooTemplate['values'])[]) => { for (const k of keys) if (old.values[k] !== undefined) (values as Record<string, unknown>)[k] = old.values[k]; };
  if (kept.includes('mode')) copy(['mode']);
  if (kept.includes('times')) copy(['useTimes', 'startTime', 'backTime']);
  if (kept.includes('audience')) copy(['audience']);
  if (kept.includes('outsideAudience')) copy(['outsideAudience', 'outsideDifferent']);
  for (const k of ['addEvent', 'remindBefore', 'decline', 'pauseAlerts', 'awaySummary'] as const) if (kept.includes(k)) copy([k]);
  if (kept.includes('accounts')) copy(['accounts']);
  if (kept.includes('own')) copy(['own']);
  return { message: Object.keys(message).length ? message : undefined, values, days: kept.includes('days') ? old.days : fresh.days, copiedFrom: old.copiedFrom };
}

/** Your templates: rename, duplicate (Friday afternoons into Wednesday away), save current settings to it, choose parts, delete. */
function ManageTemplatesDialog({ editing, onClose }: { editing?: string; onClose: () => void }) {
  const list = useSettings((s) => s.oooTemplates);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [changing, setChanging] = useState<OooTemplate | null>(null);
  const menu = useMenu();
  const finishRename = () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    const clash = list.some((t) => t.id !== renaming.id && t.name.toLowerCase() === name.toLowerCase());
    if (!name || clash) { toast({ text: clash ? 'There is already a template with that name.' : 'A template needs a name.', ttl: 4000 }); return; }
    saveList(list.map((t) => (t.id === renaming.id ? { ...t, name } : t)));
    setRenaming(null);
  };
  const copy = (t: OooTemplate) => {
    const c = copyTemplate(t, list.map((x) => x.name));
    saveList([...list, c]);
    setRenaming({ id: c.id, name: c.name });
  };
  const update = (t: OooTemplate) => {
    saveList(list.map((x) => (x.id === t.id ? updateTemplateFromPlan(t, useSettings.getState().ooo, editing) : x)));
    toast({ text: `${t.name} now has the current settings.`, ttl: 3000 });
  };
  const remove = (t: OooTemplate) => {
    const before = list;
    saveList(list.filter((x) => x.id !== t.id));
    toast({ text: `${t.name} deleted.`, ttl: 7000, undo: () => saveList(before) });
  };
  if (changing) return <SaveTemplateDialog editing={editing} existing={changing} onClose={() => setChanging(null)} />;
  return (
    <Dialog title="Your templates" onClose={onClose} actions={<button className="btn primary" onClick={onClose}>Done</button>}>
      {!list.length && <p className="hint">No templates yet. Set Out of Office up the way you want it, then choose Save as new template from the Templates drop-down.</p>}
      <div className="cg-list tpl-list">
        {list.map((t) => (
          <div key={t.id} className="cg-row">
            {renaming?.id === t.id ? (
              <input className="cg-name grow" aria-label="Template name" value={renaming.name} autoFocus onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} onBlur={finishRename} onKeyDown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }} />
            ) : (
              <span className="grow tpl-row-text" title={`${t.copiedFrom ? `Duplicated from ${t.copiedFrom}. ` : ''}${templateSummary(t, accName)}`}><b>{t.name}</b><small>{templateSummary(t, accName)}</small></span>
            )}
            <button className="btn small" onClick={() => copy(t)}>Duplicate</button>
            <button className="btn small" aria-label={`More for ${t.name}`} onClick={(e) => menu.open(e.currentTarget.getBoundingClientRect(), [
              { label: 'Rename', onClick: () => setRenaming({ id: t.id, name: t.name }) },
              { label: 'Save current settings to it', onClick: () => update(t) },
              { label: 'Choose parts…', onClick: () => setChanging(t) },
              { divider: true },
              { label: 'Delete', icon: 'trash', onClick: () => remove(t) },
            ])}><Icon name="more" size={14} /></button>
          </div>
        ))}
      </div>
      {menu.node}
    </Dialog>
  );
}
