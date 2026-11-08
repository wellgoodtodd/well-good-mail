// AI drafts: every draft an AI app wrote, in one place, so they're easy to find, check and send (or bin).
import { useEffect } from 'react';
import { Icon } from './Icon';
import { useMail, providerFor, toast } from '../lib/mail';
import { store } from '../lib/db';
import { openDraft } from '../lib/composeActions';
import { askConfirm } from '../lib/dialogs';
import { useAiDrafts, refreshAiDrafts } from '../lib/mcp/aiDrafts';

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export function AiDrafts() {
  const list = useAiDrafts((s) => s.list);
  const accounts = useMail((s) => s.accounts);
  useEffect(() => { void refreshAiDrafts(); }, []);

  const remove = async (id: string) => {
    const d = list.find((x) => x.id === id);
    if (!d || !(await askConfirm('Delete this draft?', `"${d.subject || '(no subject)'}" will be removed from Well Good Mail and from the account's Drafts folder.`, 'Delete draft'))) return;
    try { if (d.serverDraftId && d.serverAccountId) await providerFor(d.serverAccountId)?.deleteDraft(d.serverDraftId); } catch { /* it may already be gone */ }
    await store.deleteDraft(id);
    await refreshAiDrafts();
    toast({ text: 'Draft deleted', ttl: 2500 });
  };

  return (
    <div className="screen ai-drafts" role="main">
      <div className="ai-drafts-inner">
        <h1>AI drafts</h1>
        <p className="lead">Drafts written by Claude or another AI app. Nothing here has been sent. Open one to check it, change it and send it yourself.</p>
        {list.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Icon name="sparkle" size={24} />
            <div style={{ marginTop: 8 }}>No AI drafts yet. When an AI app writes one, it appears here.</div>
          </div>
        ) : (
          <div className="card">
            {list.map((d) => {
              const acc = accounts.find((a) => a.id === d.fromAccountId);
              return (
                <div key={d.id} className="ai-draft-item" role="button" tabIndex={0} onClick={() => void openDraft(d.id)} onKeyDown={(e) => { if (e.key === 'Enter') void openDraft(d.id); }}>
                  <span className="bar" style={{ background: acc?.colour || 'var(--border)' }} />
                  <div className="grow">
                    <div className="ai-draft-top">
                      <strong>{d.subject || '(no subject)'}</strong>
                      <time>{new Date(d.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                    </div>
                    <div className="ai-draft-meta">To {d.to.map((t) => t.name || t.email).join(', ') || 'nobody yet'} · from {acc?.label || d.fromEmail} · by {d.byAi}</div>
                    <div className="ai-draft-snip">{plain(d.html).slice(0, 160)}</div>
                  </div>
                  <button className="btn small" onClick={(e) => { e.stopPropagation(); void openDraft(d.id); }}>Open</button>
                  <button className="icon-btn" aria-label={`Delete draft ${d.subject}`} title="Delete draft" onClick={(e) => { e.stopPropagation(); void remove(d.id); }}><Icon name="trash" size={15} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
