// First-run guide: walks someone through making their own Google key, then proves it works with a real sign in.
// The same screen also has a short "stop signing in every week" guide (publishing the Google project).
import { useState } from 'react';
import { Icon } from './Icon';
import { openExternal } from '../lib/platform';
import { saveGoogleKeys } from '../lib/auth/google';
import { saveMicrosoftKey } from '../lib/auth/microsoft';
import { addGoogleAccountStrict, addImapAccountStrict, addMicrosoftAccountStrict, reconnectAccount, useMail } from '../lib/mail';
import { useSettings } from '../lib/settings';
import { IMAP_PRESETS, presetById, presetForEmail } from '../lib/imapUtil';
import { closeGuide, openGuide, useGuide } from '../lib/guide';

export { closeGuide, openGuide, useGuide };

const CONSOLE = 'https://console.cloud.google.com';
const SERVICES: [string, string][] = [
  ['Gmail API', `${CONSOLE}/apis/library/gmail.googleapis.com`],
  ['Google Calendar API', `${CONSOLE}/apis/library/calendar-json.googleapis.com`],
  ['People API', `${CONSOLE}/apis/library/people.googleapis.com`],
  ['Google Drive API', `${CONSOLE}/apis/library/drive.googleapis.com`],
];

/** A picture of the real Google page, if one has been added to public/guide/. Without one, nothing shows. */
function Shot({ file, alt }: { file: string; alt: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return <img className="gshot" src={`${import.meta.env.BASE_URL}guide/${file}`} alt={alt} onError={() => setMissing(true)} />;
}

/** Several pictures in a row of a step, in order. */
function Shots({ files }: { files: [string, string][] }) {
  return <>{files.map(([f, alt]) => <Shot key={f} file={f} alt={alt} />)}</>;
}

function Link({ url, children }: { url: string; children: React.ReactNode }) {
  return <button className="btn" onClick={() => openExternal(url)}>{children} <Icon name="popout" size={13} /></button>;
}

function Copy({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="gcopy">
      <span><small>{label}</small>{value}</span>
      <button className="btn" onClick={() => { navigator.clipboard?.writeText(value).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

const SETUP_STEPS = ['Welcome', 'Project', 'Services', 'Sign-in screen', 'Your key', 'Paste it', 'Done'];

export function SetupGuide() {
  const mode = useGuide((s) => s.mode) || 'setup';
  return mode === 'publish' ? <PublishGuide /> : mode === 'microsoft' ? <MicrosoftGuide /> : mode === 'imap' ? <ImapGuide /> : <FirstRun />;
}

function Frame({ step, total, children, onBack, onNext, nextLabel, hideNext, onClose }: {
  step: number; total: number; children: React.ReactNode; onBack?: () => void; onNext?: () => void; nextLabel?: string; hideNext?: boolean; onClose?: () => void;
}) {
  return (
    <div className="guide" role="region" aria-label="Setup guide">
      <button className="btn guide-x" title="Close this guide" aria-label="Close this guide" onClick={closeGuide}><Icon name="close" size={14} /> Close</button>
      <div className="guide-card">
        <div className="guide-dots" aria-hidden>{Array.from({ length: total }, (_, i) => <b key={i} className={i < step ? 'done' : i === step ? 'on' : ''} />)}</div>
        {children}
        <div className="guide-foot">
          <span>{onBack ? <button className="btn" onClick={onBack}>Back</button> : onClose ? <button className="btn ghost" onClick={onClose}>Close</button> : null}</span>
          {!hideNext && <button className="btn primary" onClick={onNext}>{nextLabel || 'Done, next'}</button>}
        </div>
      </div>
    </div>
  );
}

function FirstRun() {
  const [step, setStep] = useState(0);
  const [ticks, setTicks] = useState([false, false, false, false]);
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const accounts = useMail((s) => s.accounts);
  const total = SETUP_STEPS.length;
  const next = () => setStep((n) => Math.min(total - 1, n + 1));
  const back = () => setStep((n) => Math.max(0, n - 1));
  const close = accounts.length ? closeGuide : undefined;

  const test = async () => {
    setError('');
    if (!id.trim() || !secret.trim()) return setError('Paste both the client ID and the client secret first.');
    if (!id.includes('.apps.googleusercontent.com')) return setError('That client ID looks wrong. It should end in .apps.googleusercontent.com');
    setBusy(true);
    try {
      await saveGoogleKeys(id, secret);
      setEmail(await addGoogleAccountStrict());
      setStep(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === 0) return (
    <Frame step={0} total={total} onNext={next} nextLabel="Start" onClose={close}>
      <p className="gstep">About 10 minutes</p>
      <h2>Let's get Well Good Mail talking to Gmail</h2>
      <p className="glead">Google needs you to make a free key of your own so the app can read your mail. This guide takes you through it one step at a time, and checks at the end that it works.</p>
      <ul className="gfacts">
        <li><Icon name="clock" size={15} /> Takes about 10 minutes, once</li>
        <li><Icon name="check" size={15} /> Free, and no card needed</li>
        <li><Icon name="user" size={15} /> You need a Google account</li>
      </ul>
      <div className="gsafe"><Icon name="shield" size={16} /><span>Your key stays on this computer, in Windows Credential Manager. Nothing is sent to anyone else, and the app only talks to Google.</span></div>
    </Frame>
  );
  if (step === 1) return (
    <Frame step={1} total={total} onBack={back} onNext={next}>
      <p className="gstep">Step 1 of 5</p>
      <h2>Create a project</h2>
      <p className="glead">A project is just a folder in Google's console that holds your key.</p>
      <Link url={`${CONSOLE}/projectcreate`}>Open Google Cloud</Link>
      <ol className="gol">
        <li>Give the project the name below. Leave everything else as it is.</li>
        <li>You may see an Organisation box. Work and school accounts have one, and personal Gmail accounts don't. Either way, leave it alone. You don't need to create an organisation.</li>
        <li>Click Create, then wait for the bell icon to say it is ready.</li>
      </ol>
      <Copy label="Project name" value="Well Good Mail" />
      <Shot file="project.png" alt="The New project page in Google Cloud" />
    </Frame>
  );
  if (step === 2) return (
    <Frame step={2} total={total} onBack={back} onNext={next}>
      <p className="gstep">Step 2 of 5</p>
      <h2>Turn on four services</h2>
      <p className="glead">Each button opens that service's page. Click the blue Enable button, come back, and tick it off. If the page already says Manage and "API Enabled", it's on already, so just tick it.</p>
      {SERVICES.map(([name, url], i) => (
        <div className="gline" key={name}>
          <input type="checkbox" checked={ticks[i]} onChange={(e) => setTicks(ticks.map((t, j) => (j === i ? e.target.checked : t)))} aria-label={`${name} done`} />
          <span>{name}</span>
          <Link url={url}>Open</Link>
        </div>
      ))}
      <Shot file="services.png" alt="The Enable button on a service page" />
    </Frame>
  );
  if (step === 3) return (
    <Frame step={3} total={total} onBack={back} onNext={next}>
      <p className="gstep">Step 3 of 5</p>
      <h2>Set up the sign-in screen</h2>
      <p className="glead">This is the screen Google shows when you sign in. Only you will ever see it.</p>
      <Link url={`${CONSOLE}/auth/overview`}>Open the sign-in screen settings</Link>
      <ol className="gol">
        <li>Click Get started.</li>
        <li>App information: use the app name below, and pick your own email as the support email. Click Next.</li>
        <li>Audience: choose External, then Next.</li>
        <li>Contact information: your own email again. Click Next.</li>
        <li>Finish: tick the box to agree, click Continue, then Create.</li>
        <li>Afterwards, open Audience in the left menu. Under Test users, click Add users, type your own Gmail address, and click Save.</li>
      </ol>
      <Copy label="App name" value="Well Good Mail" />
      <Shots files={[
        ['auth-start.png', 'The Google Auth Platform page with the Get started button'],
        ['auth-app.png', 'The App information step'],
        ['auth-audience.png', 'The Audience step with External chosen'],
        ['auth-contact.png', 'The Contact information step'],
        ['auth-finish.png', 'The Finish step with the agree box ticked'],
        ['testusers.png', 'The Test users box with the Add users button'],
        ['testusers-add.png', 'The Add users panel with an email address typed in'],
      ]} />
    </Frame>
  );
  if (step === 4) return (
    <Frame step={4} total={total} onBack={back} onNext={next}>
      <p className="gstep">Step 4 of 5</p>
      <h2>Create your key</h2>
      <p className="glead">This is the key the app uses to ask Google for your mail.</p>
      <Link url={`${CONSOLE}/auth/clients/create`}>Open the key page</Link>
      <ol className="gol">
        <li>Application type: choose Desktop app.</li>
        <li>Name: anything will do. Leave the AI-powered agent box unticked, then click Create.</li>
        <li>A box appears with a client ID and a client secret. Keep it open until you have pasted both into the next step. Google will not show the secret again once you close it.</li>
      </ol>
      <Shots files={[
        ['key-type.png', 'Choosing Desktop app as the application type'],
        ['key-name.png', 'The name filled in and the Create button'],
        ['key-created.png', 'The box that appears with the client ID and secret'],
      ]} />
    </Frame>
  );
  if (step === 5) return (
    <Frame step={5} total={total} onBack={back} hideNext>
      <p className="gstep">Step 5 of 5</p>
      <h2>Paste your key</h2>
      <p className="glead">Copy both values from that box and paste them here. Then test the sign-in with your own Gmail.</p>
      <label className="glabel" htmlFor="g-id">Client ID</label>
      <input id="g-id" className="gin" value={id} placeholder="123456789-abc.apps.googleusercontent.com" onChange={(e) => { setId(e.target.value); setError(''); }} />
      <label className="glabel" htmlFor="g-secret">Client secret</label>
      <input id="g-secret" className="gin" type="password" value={secret} placeholder="Starts with GOCSPX-" onChange={(e) => { setSecret(e.target.value); setError(''); }} />
      {error && <p className="gerr" role="alert">{error}</p>}
      <div style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={test} disabled={busy}>{busy ? 'Waiting for Google...' : 'Test sign-in'}</button>
        {busy && <span className="glead" style={{ marginLeft: 10 }}>Finish signing in in your browser.</span>}
      </div>
      {accounts.length > 0 && <p className="ghint">You already have accounts here. A new key means signing in to each of them again.</p>}
      <p className="ghint">Your browser opens Google and asks you to allow access. Click Allow. If you see a "hasn't verified this app" warning first, that is normal for your own key: click Advanced, then continue.</p>
      <Shot file="test-allow.png" alt="Google asking you to allow Well Good Mail access to your account" />
    </Frame>
  );
  return (
    <Frame step={6} total={total} hideNext>
      <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
        <div className="gtick"><Icon name="check" size={26} /></div>
        <h2>Well done, it works</h2>
        <p className="glead">Google accepted your key and {email || 'your account'} is connected. Your mail is downloading now.</p>
        <button className="btn primary" onClick={closeGuide}>Open my mail</button>
      </div>
      {accounts.filter((a) => a.email !== email && a.kind === 'gmail').length > 0 && (
        <div className="gsafe" style={{ display: 'block' }}>
          <p style={{ margin: '0 0 8px' }}>You changed your Google key, so your other accounts need signing in again. You can do it now, or later from Settings.</p>
          {accounts.filter((a) => a.email !== email && a.kind === 'gmail').map((a) => (
            <div className="gline" key={a.id}>
              <span>{a.email}</span>
              <button className="btn" onClick={() => reconnectAccount(a.id)}>Sign in</button>
            </div>
          ))}
        </div>
      )}
      <div className="gsafe"><Icon name="alert" size={16} /><span>Until you publish your Google project, Google will ask you to sign in again about once a week. Settings, then Accounts, has a short guide for that when you want it.</span></div>
    </Frame>
  );
}

const PRIVACY_TEXT = `Privacy policy for Well Good Mail

Well Good Mail is a personal email app. It connects to my Google account only to read, send and organise my own email, calendar events and contacts.

Everything it downloads is stored on my own computer. Nothing is sent to the people who made the app or to any other company. The key that lets the app sign in is kept in Windows Credential Manager on my computer.

I can remove the app's access to my Google account at any time at https://myaccount.google.com/permissions.

Contact: [your email address]`;

const HOME_TEXT = `Well Good Mail

A personal email app for Windows, set up and used by one person for their own mail. It is not a commercial service and has no other users.

Privacy policy: [link to your privacy page]`;

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="gcopy" style={{ alignItems: 'flex-start' }}>
      <span><small>{label}</small><span style={{ whiteSpace: 'pre-wrap', fontSize: '0.88em' }}>{value}</span></span>
      <button className="btn" onClick={() => { navigator.clipboard?.writeText(value).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

function PublishGuide() {
  const [step, setStep] = useState(0);
  const total = 6;
  const finish = () => { useSettings.getState().set({ googlePublished: true }); setStep(5); };
  if (step === 0) return (
    <Frame step={0} total={total} onNext={() => setStep(1)} nextLabel="Show me" onClose={closeGuide}>
      <p className="gstep">About 15 minutes</p>
      <h2>Stop signing in every week</h2>
      <p className="glead">While your Google project is in testing mode, Google signs you out after 7 days. Publishing it stops that. Nobody reviews it, and it stays private to you.</p>
      <div className="gsafe"><Icon name="alert" size={16} /><span>Google wants a public web page about your app and a public privacy policy page before it lets you publish. You need somewhere to put two short pages. If that is too much, you can skip this and just sign in again each week.</span></div>
    </Frame>
  );
  if (step === 1) return (
    <Frame step={1} total={total} onBack={() => setStep(0)} onNext={() => setStep(2)}>
      <p className="gstep">Step 1 of 4</p>
      <h2>Put two short pages on the web</h2>
      <p className="glead">They need a public web address that anyone can open. Your own website is easiest. A Google Sites page or a public Notion page can work too. Copy the text below into two pages, and keep both addresses handy.</p>
      <CopyBlock label="Home page text" value={HOME_TEXT} />
      <CopyBlock label="Privacy policy text" value={PRIVACY_TEXT} />
      <p className="ghint">Put your own email and the home page's privacy link where the square brackets are.</p>
      <details className="gdetails">
        <summary>I want to use an address like mail.mydomain.com</summary>
        <p>The simplest way is to put the pages on a site you already have, for example mydomain.com/mail and mydomain.com/mail/privacy. That needs no changes to your domain settings.</p>
        <p>If you do want your own subdomain, you need to point it at wherever the pages live. Sign in to the company that manages your domain, find DNS settings, and add a CNAME record. The name is the part before your domain (for example mail). The value is the address your page host tells you to use. It can take a few hours to start working.</p>
        <p>On the Branding page, the authorised domain is just your main domain (mydomain.com), not the subdomain.</p>
        <p>To check, open both page addresses in a private browser window. If they load without signing in, Google can see them too.</p>
      </details>
    </Frame>
  );
  if (step === 2) return (
    <Frame step={2} total={total} onBack={() => setStep(1)} onNext={() => setStep(3)}>
      <p className="gstep">Step 2 of 4</p>
      <h2>Fill in the Branding page</h2>
      <Link url={`${CONSOLE}/auth/branding`}>Open the Branding page</Link>
      <ol className="gol">
        <li>Application home page: the address of your first page.</li>
        <li>Application privacy policy link: the address of your privacy page.</li>
        <li>Authorised domains: click Add domain and type just the domain, for example example.com.</li>
        <li>Skip the logo. Adding one makes Google ask you to submit the app for review.</li>
        <li>Click Save.</li>
      </ol>
      <Shots files={[
        ['branding.png', 'The Branding page before it is filled in'],
        ['branding-filled.png', 'The Branding page with the web addresses and domain filled in'],
      ]} />
    </Frame>
  );
  if (step === 3) return (
    <Frame step={3} total={total} onBack={() => setStep(2)} onNext={() => setStep(4)}>
      <p className="gstep">Step 3 of 4</p>
      <h2>Publish your project</h2>
      <Link url={`${CONSOLE}/auth/audience`}>Open the audience page</Link>
      <ol className="gol">
        <li>Make sure the right project is picked at the top.</li>
        <li>Under Publishing status, click Publish app, then Confirm.</li>
        <li>The status changes from Testing to In production.</li>
        <li>If Publish app is greyed out, the Branding page is missing something. Hover over the button to see what.</li>
        <li>If Google mentions verification of the app, ignore that part. The next step covers the only check you need.</li>
      </ol>
      <Shots files={[
        ['publish-app.png', 'The Publish app button, now active'],
        ['in-production.png', 'The status changed to In production'],
        ['publish-needs.png', 'If the button is greyed out, hover to see what is missing'],
      ]} />
    </Frame>
  );
  if (step === 4) return (
    <Frame step={4} total={total} onBack={() => setStep(3)} onNext={finish} nextLabel="I've done it">
      <p className="gstep">Step 4 of 4</p>
      <h2>Verify your branding</h2>
      <p className="glead">Once the project is in production, Google asks you to verify the name, home page and privacy page you entered. It is automatic and takes a few minutes.</p>
      <Link url={`${CONSOLE}/auth/branding`}>Open the Branding page</Link>
      <ol className="gol">
        <li>Under Verification status, click Verify branding.</li>
        <li>Wait up to five minutes. You can leave the page open.</li>
        <li>When it says the branding is verified but not yet shown, click Publish branding. Do this within 7 days.</li>
      </ol>
      <Shots files={[
        ['verify-branding.png', 'Verification status with the Verify branding button'],
        ['verify-progress.png', 'Verification in progress'],
        ['verify-ready.png', 'Verified, with the Publish branding button'],
        ['verify-done.png', 'Verified and shown to users'],
      ]} />
    </Frame>
  );
  return (
    <Frame step={5} total={total} hideNext>
      <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
        <div className="gtick"><Icon name="check" size={26} /></div>
        <h2>All done</h2>
        <p className="glead">Your project is published and your branding is verified. Sign in to each account once more when the app asks, and Google should stop signing you out every week.</p>
        <button className="btn primary" onClick={closeGuide}>Back to the app</button>
      </div>
    </Frame>
  );
}


const AZURE = 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade';

function MicrosoftGuide() {
  const [step, setStep] = useState(0);
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const total = 4;

  const test = async () => {
    setError('');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())) return setError('That does not look like an application ID. It is made of letters and numbers in groups, like 12345678-abcd-1234-abcd-1234567890ab.');
    setBusy(true);
    try {
      await saveMicrosoftKey(id);
      setEmail(await addMicrosoftAccountStrict());
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === 0) return (
    <Frame step={0} total={total} onNext={() => setStep(1)} nextLabel="Start" onClose={closeGuide}>
      <p className="gstep">About 10 minutes</p>
      <h2>Use your own Microsoft app ID</h2>
      <p className="glead">Well Good Mail already has a shared app ID for Microsoft, so a personal Outlook, Hotmail or Live account can sign in without any of this. You only need your own if a work or school account is blocked because your administrator has to approve apps, and you can register one that your organisation controls.</p>
      <div className="gsafe"><Icon name="alert" size={16} /><span>Microsoft 365 support is new and has only had light testing. If something goes wrong, the message shown is worth keeping.</span></div>
    </Frame>
  );
  if (step === 1) return (
    <Frame step={1} total={total} onBack={() => setStep(0)} onNext={() => setStep(2)}>
      <p className="gstep">Step 1 of 2</p>
      <h2>Register the app</h2>
      <Link url={AZURE}>Open Microsoft Entra, App registrations</Link>
      <ol className="gol">
        <li>Sign in with your Microsoft account. If it asks you to set up Azure first, follow the free sign up. No card should be needed for this.</li>
        <li>Click New registration.</li>
        <li>Name: the one below.</li>
        <li>Supported account types: choose "Accounts in any organizational directory and personal Microsoft accounts".</li>
        <li>Redirect URI: choose "Public client/native (mobile and desktop)" and type http://localhost</li>
        <li>Click Register. On the page that opens, copy the Application (client) ID.</li>
      </ol>
      <Copy label="Name" value="Well Good Mail" />
      <Copy label="Redirect address" value="http://localhost" />
    </Frame>
  );
  if (step === 2) return (
    <Frame step={2} total={total} onBack={() => setStep(1)} hideNext>
      <p className="gstep">Step 2 of 2</p>
      <h2>Paste the ID and test it</h2>
      <label className="glabel" htmlFor="m-id">Application (client) ID</label>
      <input id="m-id" className="gin" value={id} placeholder="12345678-abcd-1234-abcd-1234567890ab" onChange={(e) => { setId(e.target.value); setError(''); }} />
      {error && <p className="gerr" role="alert">{error}</p>}
      <div style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={test} disabled={busy}>{busy ? 'Waiting for Microsoft...' : 'Test sign-in'}</button>
        {busy && <span className="glead" style={{ marginLeft: 10 }}>Finish signing in in your browser.</span>}
      </div>
      <p className="ghint">Your browser opens Microsoft and asks you to allow access. Click Accept.</p>
    </Frame>
  );
  return (
    <Frame step={3} total={total} hideNext>
      <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
        <div className="gtick"><Icon name="check" size={26} /></div>
        <h2>Well done, it works</h2>
        <p className="glead">Microsoft accepted the ID and {email || 'your account'} is connected. Your mail is downloading now.</p>
        <button className="btn primary" onClick={closeGuide}>Open my mail</button>
      </div>
    </Frame>
  );
}

/** Steps for making an app password, for the services where that is how Well Good Mail signs in. */
const APP_PASSWORD_STEPS: Record<string, string[]> = {
  icloud: [
    'Sign in at account.apple.com with your Apple Account. Two-factor sign in must be switched on, which it is for most accounts.',
    'Choose Sign-In and Security, then App-Specific Passwords.',
    'Click the plus button, give it the name below, and click Create.',
    'Apple shows a password made of four groups of letters, such as abcd-efgh-ijkl-mnop. Copy it. Apple only shows it once.',
  ],
  yahoo: [
    'Sign in to your Yahoo account and open Account security.',
    'Choose Generate app password (or Manage app passwords).',
    'Give it the name below, and click Generate.',
    'Copy the password it shows.',
  ],
  fastmail: [
    'Sign in to Fastmail and open Settings, then Privacy and Security, then Integrations.',
    'Choose New app password, and give it the name below.',
    'For access, choose Mail (IMAP/POP/SMTP), then click Generate.',
    'Copy the password it shows.',
  ],
  aol: [
    'Sign in to your AOL account and open Account security.',
    'Choose Generate app password, and give it the name below.',
    'Copy the password it shows.',
  ],
};

function ImapGuide() {
  const startPreset = useGuide((s) => s.preset);
  const startEmail = useGuide((s) => s.email);
  const accounts = useMail((s) => s.accounts);
  const existing = startEmail ? accounts.find((a) => a.kind === 'imap' && a.email === startEmail) : undefined;
  const [presetId, setPresetId] = useState(startPreset || (existing ? presetForEmail(existing.email)?.id : undefined) || '');
  const [step, setStep] = useState(existing ? 2 : startPreset ? 1 : 0);
  const [email, setEmail] = useState(existing?.email || '');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState(existing?.imap?.host || '');
  const [port, setPort] = useState(String(existing?.imap?.port || 993));
  const [smtpHost, setSmtpHost] = useState(existing?.imap?.smtpHost || '');
  const [smtpPort, setSmtpPort] = useState(String(existing?.imap?.smtpPort || 465));
  const [username, setUsername] = useState(existing?.imap?.username || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const preset = presetById(presetId);
  const custom = !preset;
  const total = 4;

  const choose = (id: string) => { setPresetId(id); setStep(id && presetById(id) ? 1 : 2); };

  const connect = async () => {
    setError('');
    const address = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return setError('That email address does not look right.');
    if (!password.trim()) return setError('Paste the app password first.');
    const matched = preset || presetForEmail(address);
    const settings = matched
      ? { host: matched.host, port: matched.port, smtpHost: matched.smtpHost, smtpPort: matched.smtpPort, username: address }
      : { host: host.trim(), port: Number(port) || 993, smtpHost: smtpHost.trim(), smtpPort: Number(smtpPort) || 465, username: (username || address).trim() };
    if (!settings.host || !settings.smtpHost) return setError('Enter the incoming and outgoing server names.');
    setBusy(true);
    try {
      await addImapAccountStrict(settings, address, password.trim(), existing?.displayName || address.split('@')[0]);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === 0) return (
    <Frame step={0} total={total} onNext={() => setStep(1)} hideNext>
      <p className="gstep">About 3 minutes</p>
      <h2>Add an email account</h2>
      <p className="glead">Choose where your email is.</p>
      <div className="gpick">
        {IMAP_PRESETS.map((p) => <button key={p.id} className="btn" onClick={() => choose(p.id)}>{p.name}</button>)}
        <button className="btn" onClick={() => choose('other')}>Another email service (IMAP)</button>
      </div>
      <div className="gsafe"><Icon name="shield" size={16} /><span>Your password stays on this computer, in Windows Credential Manager. Well Good Mail talks straight to your email service and nothing goes through anyone else.</span></div>
    </Frame>
  );

  if (step === 1 && preset) return (
    <Frame step={1} total={total} onBack={() => setStep(0)} onNext={() => setStep(2)}>
      <p className="gstep">Step 1 of 2</p>
      <h2>Make an app password for {preset.name}</h2>
      <p className="glead">{preset.name} does not let apps sign in with your normal password. Instead you make a separate {preset.passwordName} for Well Good Mail. You can cancel it at any time, and it does not change your own password.</p>
      <Link url={preset.passwordUrl}>Open {preset.name} account settings</Link>
      <ol className="gol">
        {(APP_PASSWORD_STEPS[preset.id] || []).map((t) => <li key={t}>{t}</li>)}
      </ol>
      <Copy label="Name for the password" value="Well Good Mail" />
    </Frame>
  );

  if (step === 2) return (
    <Frame step={2} total={total} onBack={() => setStep(preset ? 1 : 0)} hideNext>
      <p className="gstep">{existing ? 'New password' : preset ? 'Step 2 of 2' : 'Your account'}</p>
      <h2>{existing ? `Enter a new password for ${existing.email}` : preset ? 'Enter your address and password' : 'Enter your account details'}</h2>
      <label className="glabel" htmlFor="i-email">Email address</label>
      <input id="i-email" className="gin" value={email} disabled={Boolean(existing)} placeholder={preset?.id === 'icloud' ? 'you@icloud.com' : 'you@example.com'} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
      <label className="glabel" htmlFor="i-pass">{preset ? `The ${preset.passwordName}` : 'Password (an app password, if your service has them)'}</label>
      <input id="i-pass" className="gin" type="password" autoComplete="off" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
      {custom && !existing && (
        <>
          <label className="glabel" htmlFor="i-host">Incoming mail server (IMAP) and port</label>
          <div className="gline"><input id="i-host" className="gin" value={host} placeholder="imap.example.com" onChange={(e) => setHost(e.target.value)} /><input className="gin" style={{ width: 90 }} aria-label="IMAP port" value={port} onChange={(e) => setPort(e.target.value)} /></div>
          <label className="glabel" htmlFor="i-smtp">Outgoing mail server (SMTP) and port</label>
          <div className="gline"><input id="i-smtp" className="gin" value={smtpHost} placeholder="smtp.example.com" onChange={(e) => setSmtpHost(e.target.value)} /><input className="gin" style={{ width: 90 }} aria-label="SMTP port" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} /></div>
          <label className="glabel" htmlFor="i-user">Username (leave empty if it is your email address)</label>
          <input id="i-user" className="gin" value={username} onChange={(e) => setUsername(e.target.value)} />
          <p className="ghint">Incoming is normally port 993. Outgoing is port 465, or 587 for some services. Your email service's help pages list them.</p>
        </>
      )}
      {error && <p className="gerr" role="alert">{error}</p>}
      <div style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={connect} disabled={busy}>{busy ? 'Connecting...' : existing ? 'Save and reconnect' : 'Connect'}</button>
      </div>
    </Frame>
  );

  return (
    <Frame step={3} total={total} hideNext>
      <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
        <div className="gtick"><Icon name="check" size={26} /></div>
        <h2>Well done, it works</h2>
        <p className="glead">{email.trim().toLowerCase() || 'Your account'} is connected. Your mail is downloading now.</p>
        <button className="btn primary" onClick={closeGuide}>Open my mail</button>
      </div>
    </Frame>
  );
}
