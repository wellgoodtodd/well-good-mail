// Out of Office templates: the Templates menu on the Message card, Save as new template (a name and ticks for each
// part, a whole group at a time or one by one) and Manage templates (rename, copy, update, change what's kept, delete).
import { useState } from 'react';
import { Dialog, useMenu } from './ui';
import { Icon } from './Icon';
import { useMail, toast } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { TEMPLATES, htmlToText, type OooPlan } from '../lib/ooo';
import { PART_GROUPS, applyTemplate, copyTemplate, daysWords, findTemplate, partsWords, templateFromPlan, templateSummary, type OooPart, type OooTemplate } from '../lib/oooTemplates';

const accName = (id: string) => { const a = useMail.getState().accounts.find((x) => x.id === id); return a ? a.label || a.email : 'an account'; };
const saveList = (list: OooTemplate[]) => useSettings.getState().set({ oooTemplates: list });

/** Puts a saved template into the page, with Undo. `editing` is the account whose own message is showing, if any. */
export function applyToPage(t: OooTemplate, editing?: string) {
  const before = useSettings.getState().ooo;
  useSettings.getState().set({ ooo: applyTemplate(before, t, { editing }) });
  toast({ text: `Applied ${t.name}: ${partsWords(t)}.`, ttl: 8000, undo: () => useSettings.getState().set({ ooo: before }) });
}

/** The Templates menu: your templates, the built-in messages, then Save as new template and Manage templates. */
export function TemplatesMenu({ editing, onBuiltIn }: { editing?: string; onBuiltIn: (t: (typeof TEMPLATES)[number]) => void }) {
  const mine = useSettings((s) => s.oooTemplates);
  const [dialog, setDialog] = useState<null | 'save' | 'manage'>(null);
  return (
    <>
      <select aria-label="Templates" className="ooo-tpl" value="" onChange={(e) => {
        const v = e.target.value;
        if (v === '__save') { setDialog('save'); return; }
        if (v === '__manage') { setDialog('manage'); return; }
        const own = mine.find((t) => t.id === v);
        if (own) { applyToPage(own, editing); return; }
        const built = TEMPLATES.find((t) => t.id === v);
        if (built) onBuiltIn(built);
      }}>
        <option value="">Templates...</option>
        {mine.length > 0 && <optgroup label="Your templates">{mine.map((t) => <option key={t.id} value={t.id}>{t.name} ({partsWords(t)})</option>)}</optgroup>}
        <optgroup label="Built in (message only)">{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
        <optgroup label="Templates">
          <option value="__save">Save as new template…</option>
          {mine.length > 0 && <option value="__manage">Manage templates…</option>}
        </optgroup>
      </select>
      {dialog === 'save' && <SaveTemplateDialog editing={editing} onClose={() => setDialog(null)} />}
      {dialog === 'manage' && <ManageTemplatesDialog editing={editing} onClose={() => setDialog(null)} />}
    </>
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
function SaveTemplateDialog({ editing, existing, onClose }: { editing?: string; existing?: OooTemplate; onClose: () => void }) {
  const plan = useSettings((s) => s.ooo);
  const list = useSettings((s) => s.oooTemplates);
  const [name, setName] = useState(existing?.name || '');
  const [parts, setParts] = useState<OooPart[]>(existing?.parts || DEFAULT_PARTS);
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

/** Your templates: rename, copy (Friday afternoons into Wednesday away), update from the page, change what's kept, delete. */
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
    const fresh = templateFromPlan(t.name, t.parts, useSettings.getState().ooo, { id: t.id, editing });
    saveList(list.map((x) => (x.id === t.id ? { ...fresh, copiedFrom: t.copiedFrom } : x)));
    toast({ text: `${t.name} updated from the page.`, ttl: 3000 });
  };
  const remove = (t: OooTemplate) => {
    const before = list;
    saveList(list.filter((x) => x.id !== t.id));
    toast({ text: `${t.name} deleted.`, ttl: 7000, undo: () => saveList(before) });
  };
  if (changing) return <SaveTemplateDialog editing={editing} existing={changing} onClose={() => setChanging(null)} />;
  return (
    <Dialog title="Your templates" onClose={onClose} actions={<button className="btn primary" onClick={onClose}>Done</button>}>
      {!list.length && <p className="hint">No templates yet. Set Out of Office up the way you want it, then choose Save as new template from Templates.</p>}
      <div className="cg-list tpl-list">
        {list.map((t) => (
          <div key={t.id} className="cg-row">
            {renaming?.id === t.id ? (
              <input className="cg-name grow" aria-label="Template name" value={renaming.name} autoFocus onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} onBlur={finishRename} onKeyDown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }} />
            ) : (
              <span className="grow"><b>{t.name}</b><small>{t.copiedFrom ? `Copied from ${t.copiedFrom} · ` : ''}{templateSummary(t, accName)}</small></span>
            )}
            <button className="btn small" onClick={() => copy(t)}>Copy</button>
            <button className="btn small" aria-label={`More for ${t.name}`} onClick={(e) => menu.open(e.currentTarget.getBoundingClientRect(), [
              { label: 'Rename', onClick: () => setRenaming({ id: t.id, name: t.name }) },
              { label: "Update from what's on the page", onClick: () => update(t) },
              { label: 'Change what it includes…', onClick: () => setChanging(t) },
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
