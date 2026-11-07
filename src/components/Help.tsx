// Help: a card for each subject, with the questions inside, and a search box that finds answers by any word.
import { useState } from 'react';
import { Icon } from './Icon';
import { useMail, openScreen } from '../lib/mail';
import { openExternal } from '../lib/platform';
import { countItems, searchHelp } from '../lib/helpTopics';

const ISSUES = 'https://github.com/wellgoodtodd/well-good-mail/issues';

export function Help() {
  const accounts = useMail((s) => s.accounts);
  const [query, setQuery] = useState('');
  const topics = searchHelp(query);
  const found = countItems(topics);
  const searching = query.trim().length > 0;
  return (
    <div className="help-screen">
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
        <p className="hint" role="status" aria-live="polite" style={{ minHeight: '1.4em' }}>{searching ? (found ? `${found} ${found === 1 ? 'answer' : 'answers'} found` : 'Nothing found. Try fewer or different words.') : ''}</p>
        <div className="help-grid">
          {topics.map((t) => (
            <section key={t.id} className="help-card" aria-labelledby={`help-${t.id}`}>
              <header>
                <span className="help-ico"><Icon name={t.icon} size={18} /></span>
                <div>
                  <h2 id={`help-${t.id}`}>{t.title}</h2>
                  <p>{t.blurb}</p>
                </div>
              </header>
              {t.items.map((i) => (
                <details key={i.q + searching} className="help-item" open={searching}>
                  <summary>{i.q}</summary>
                  <p>{i.a}</p>
                </details>
              ))}
            </section>
          ))}
        </div>
        <section className="help-card help-support" aria-labelledby="help-support">
          <header>
            <span className="help-ico"><Icon name="mail" size={18} /></span>
            <div>
              <h2 id="help-support">Still stuck?</h2>
              <p>Well Good Mail is an early, free app from a small team, shared as it is. We read everything, but can't promise a reply.</p>
            </div>
          </header>
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
