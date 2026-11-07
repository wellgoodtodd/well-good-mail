// Help: a stack of cards, one for each subject. Click a card to open it (the one before closes), and the questions are
// inside. The search box looks through everything and opens whatever matches.
import { useState } from 'react';
import { Icon } from './Icon';
import { useMail, openScreen } from '../lib/mail';
import { openExternal } from '../lib/platform';
import { countItems, searchHelp } from '../lib/helpTopics';

const ISSUES = 'https://github.com/wellgoodtodd/well-good-mail/issues';

export function Help() {
  const accounts = useMail((s) => s.accounts);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const topics = searchHelp(query);
  const found = countItems(topics);
  const searching = query.trim().length > 0;
  return (
    <div className="help-screen" role="main">
      <div className="help-inner">
        <div className="help-top">
          <button className="btn ghost" onClick={() => useMail.setState({ screen: 'mail' })}><Icon name="chevronLeft" /> Back to mail</button>
        </div>
        <h1>Help</h1>
        <p className="hint">Short answers to the things people ask most. {accounts.length ? '' : 'Add an account to get started.'}</p>
        <div className="help-search">
          <Icon name="search" size={15} />
          <input type="search" value={query} placeholder="Search help, for example print, undo or iCloud" aria-label="Search help" onChange={(e) => setQuery(e.target.value)} />
          {searching && <button className="icon-btn" aria-label="Clear search" onClick={() => setQuery('')}><Icon name="close" size={14} /></button>}
        </div>
        <p className="hint" role="status" aria-live="polite" style={searching ? { minHeight: '1.4em' } : { margin: 0 }}>{searching ? (found ? `${found} ${found === 1 ? 'answer' : 'answers'} found` : 'Nothing found. Try fewer or different words.') : ''}</p>
        <div className="help-stack">
          {topics.map((t) => {
            const open = searching || openId === t.id;
            return (
              <section key={t.id} className={`help-card ${open ? 'open' : ''}`}>
                <h2>
                  <button className="help-head" aria-expanded={open} aria-controls={`help-body-${t.id}`} id={`help-${t.id}`} onClick={() => !searching && setOpenId(open ? null : t.id)}>
                    <span className="help-ico"><Icon name={t.icon} size={18} /></span>
                    <span className="help-title"><strong>{t.title}</strong><small>{t.blurb}</small></span>
                    {!searching && <Icon name="chevronDown" size={16} className="help-chev" />}
                  </button>
                </h2>
                {open && (
                  <div className="help-body" id={`help-body-${t.id}`} role="region" aria-labelledby={`help-${t.id}`}>
                    {t.items.map((i) => (
                      <details key={i.q + searching} className="help-item" open={searching}>
                        <summary>{i.q}</summary>
                        <p>{i.a}</p>
                      </details>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <section className="help-card help-support" aria-labelledby="help-support">
          <div className="help-head static">
            <span className="help-ico"><Icon name="mail" size={18} /></span>
            <span className="help-title"><strong id="help-support">Still stuck?</strong><small>Well Good Mail is an early, free app from a small team, shared as it is. We read everything, but can't promise a reply.</small></span>
          </div>
          <div className="help-actions">
            <button className="btn" onClick={() => openExternal(ISSUES)}>Report a problem on GitHub</button>
            <button className="btn" onClick={() => openExternal('mailto:support@wellgood.media')}>Email support@wellgood.media</button>
            <button className="btn" onClick={() => openScreen('settings', 'diagnostics')}>Open Diagnostics</button>
            <button className="btn" onClick={() => openScreen('settings', 'accounts')}>Open Settings</button>
          </div>
        </section>
      </div>
    </div>
  );
}
