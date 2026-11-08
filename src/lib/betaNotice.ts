// Telling people a newer test build exists. It never installs anything: it only shows a note in Settings, Updates,
// with links to the release notes and the installer. Live builds only look when the person has switched it on.
import { create } from 'zustand';
import { httpFetch, isTauri } from './platform';
import { settings } from './settings';

const RELEASES_API = 'https://api.github.com/repos/wellgoodtodd/well-good-mail/releases?per_page=30';

/** Compares two versions like 0.6.4, 0.6.4-beta.2 and 0.6.5-beta.1. A test build is older than the live version it leads to. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, '').split('-', 2);
    return { nums: core.split('.').map((n) => Number(n) || 0), pre: pre ? pre.split('.') : undefined };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (!x.pre && !y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) {
      const d = Number(p) - Number(q);
      if (d) return d < 0 ? -1 : 1;
    } else if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

export interface BetaRelease { version: string; notesUrl: string; downloadUrl: string }

export interface GithubRelease { tag_name: string; prerelease: boolean; draft: boolean; html_url: string; assets?: { name: string; browser_download_url: string }[] }

/** The newest test build that is newer than the version you are running, if any. */
export function newerBeta(releases: GithubRelease[], current: string): BetaRelease | undefined {
  let best: BetaRelease | undefined;
  for (const r of releases) {
    if (!r.prerelease || r.draft) continue;
    const version = r.tag_name.replace(/^v/, '');
    if (compareVersions(version, current) <= 0) continue;
    if (best && compareVersions(version, best.version) <= 0) continue;
    const installer = r.assets?.find((a) => /setup\.exe$/i.test(a.name));
    best = { version, notesUrl: r.html_url, downloadUrl: installer?.browser_download_url || r.html_url };
  }
  return best;
}

interface BetaState { status: 'idle' | 'checking' | 'done' | 'error'; found?: BetaRelease; checkedAt?: number }
export const useBetaNotice = create<BetaState>(() => ({ status: 'idle' }));

/** Test builds always look for newer test builds. Live builds look only when the person asked to hear about them. */
export const wantsBetaNotices = (current?: string) => Boolean(current && (/^\d+\.\d+\.\d+-/.test(current) || settings().testVersionNotices));

/** Asks GitHub's public release list. Quiet on failure: this is only a courtesy. */
export async function checkForBeta(current: string | undefined, opts: { force?: boolean } = {}) {
  if (!isTauri() || !current || !wantsBetaNotices(current)) {
    useBetaNotice.setState({ status: 'done', found: undefined });
    return;
  }
  const last = useBetaNotice.getState().checkedAt;
  if (!opts.force && last && Date.now() - last < 60 * 60 * 1000) return;
  useBetaNotice.setState({ status: 'checking' });
  try {
    const r = await httpFetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`GitHub said ${r.status}`);
    const releases = (await r.json()) as GithubRelease[];
    useBetaNotice.setState({ status: 'done', found: newerBeta(releases, current), checkedAt: Date.now() });
  } catch {
    useBetaNotice.setState({ status: 'error', checkedAt: Date.now() });
  }
}
