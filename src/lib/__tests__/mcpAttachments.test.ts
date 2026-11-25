import { describe, expect, it, vi } from 'vitest';
import { attachmentIs, handleRpc, pickAttachment, attachList, saveTarget, visibleTools, MAX_SAVE_BYTES, type McpWorld } from '../mcp/handlers';
import { defaultMcp, tidy, type McpSettings } from '../mcp/permissions';
import type { Account, Message } from '../types';

const MB = 1048576;
const file = (id: string, filename: string, mimeType: string, size: number, inline = false) => ({ id, filename, mimeType, size, inline });
const acc = (id: string) => ({ id, email: `${id}@x.com`, label: id.toUpperCase(), order: 0, kind: 'gmail' } as unknown as Account);
const msg = (id: string, accountId: string, subject: string, attachments: ReturnType<typeof file>[]) => ({ id, accountId, threadId: `t-${id}`, subject, snippet: 'short', date: Date.UTC(2026, 10, 20), from: { email: 'host@x.com', name: 'Host' }, to: [], cc: [], attachments, hasAttachments: attachments.some((a) => !a.inline), bodyText: 'Here is the recording.', bodyLoaded: true } as unknown as Message);

function world(settings: Partial<McpSettings>, ask = true) {
  const messages: Record<string, Message> = {
    m1: msg('m1', 'a', 'Episode 12 recording', [file('logo', 'logo.png', 'image/png', 2000, true), file('x1', 'Episode 12.m4a', 'audio/mp4', 28 * MB), file('x2', 'notes.pdf', 'application/pdf', MB / 2)]),
    m2: msg('m2', 'a', 'Invoice', [file('x3', 'invoice.pdf', 'application/pdf', MB)]),
    m3: msg('m3', 'a', 'Setup', [file('x4', 'setup.exe', 'application/octet-stream', MB)]),
    m4: msg('m4', 'a', 'Huge', [file('x5', 'raw.wav', 'audio/wav', MAX_SAVE_BYTES + 1)]),
    m5: msg('m5', 'b', 'Private', [file('x6', 'secret.m4a', 'audio/mp4', MB)]),
  };
  const saveAttachment = vi.fn(async (x: { folder: string; subfolder: string; name: string }) => ({ path: `${x.folder.replace(/\\$/, '')}${x.subfolder ? `\\${x.subfolder}` : ''}\\${x.name}`, bytes: 28 * MB }));
  const ask$ = vi.fn(async (req: { accounts: { id: string }[] }) => ({ allowed: ask ? req.accounts.map((a) => a.id) : [] }));
  const log = vi.fn();
  const w: McpWorld = {
    settings: tidy({ ...defaultMcp(), enabled: true, accounts: { a: 'read' }, ...settings }),
    accounts: [acc('a'), acc('b')],
    folders: {},
    draftGroups: [],
    messages,
    events: [],
    followups: [],
    search: () => Object.values(messages),
    loadBody: async (id) => messages[id],
    ask: ask$,
    granted: () => false,
    saveAttachment,
    makeDraft: vi.fn(),
    openDraft: vi.fn(),
    aiDraft: () => undefined,
    log,
    version: '0.7.5',
    now: 1_000_000,
  };
  return { w, saveAttachment, ask$, log };
}
const call = (name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
const body = (r: unknown) => {
  const res = (r as { result: { isError?: boolean; content: { text: string }[] } }).result;
  return { error: Boolean(res.isError), text: res.content[0].text, data: res.isError ? undefined : JSON.parse(res.content[0].text) };
};
const ALLOWED = ['D:\\Projects\\Podcasts'];

describe('attachments for an AI', () => {
  it('numbers attachments from 1, leaving out pictures inside the text', () => {
    const { w } = world({});
    expect(attachList(w.messages.m1).map((x) => [x.n, x.a.filename])).toEqual([[1, 'Episode 12.m4a'], [2, 'notes.pdf']]);
  });

  it('get_message lists each attachment with its number, size in MB and type', async () => {
    const { w } = world({ modes: { ...defaultMcp().modes, 'read.messages': 'allow' } });
    const r = body(await handleRpc(w, call('get_message', { id: 'm1' })));
    expect(r.data.emails[0].attachments).toEqual([
      { number: 1, filename: 'Episode 12.m4a', sizeMB: 28, type: 'audio/mp4' },
      { number: 2, filename: 'notes.pdf', sizeMB: 0.5, type: 'application/pdf' },
    ]);
  });

  it('search_mail can list attachments, or find only emails with audio', async () => {
    const { w } = world({});
    const listed = body(await handleRpc(w, call('search_mail', { query: 'x', list_attachments: true })));
    expect(listed.data.results.find((x: { id: string }) => x.id === 'm2').attachments[0].filename).toBe('invoice.pdf');
    const audio = body(await handleRpc(w, call('search_mail', { query: 'x', attachment_type: 'audio' })));
    expect(audio.data.results.map((x: { id: string }) => x.id)).toEqual(['m1', 'm4']);
    expect(audio.data.results[0].attachments.map((x: { filename: string }) => x.filename)).toEqual(['Episode 12.m4a']);
    const plain = body(await handleRpc(w, call('search_mail', { query: 'x' })));
    expect(plain.data.results[0].attachments).toBeUndefined();
  });

  it('matches kinds of file by type or extension', () => {
    expect(attachmentIs({ filename: 'a.m4a', mimeType: 'application/octet-stream' }, 'audio')).toBe(true);
    expect(attachmentIs({ filename: 'a.pdf', mimeType: 'application/pdf' }, 'pdf')).toBe(true);
    expect(attachmentIs({ filename: 'a.pdf', mimeType: 'application/pdf' }, 'application/pdf')).toBe(true);
    expect(attachmentIs({ filename: 'a.pdf', mimeType: 'application/pdf' }, 'audio')).toBe(false);
  });

  it('picks an attachment by number or by name', () => {
    const { w } = world({});
    const list = attachList(w.messages.m1);
    expect(pickAttachment(list, 2).pick?.a.filename).toBe('notes.pdf');
    expect(pickAttachment(list, '1').pick?.a.filename).toBe('Episode 12.m4a');
    expect(pickAttachment(list, 'episode 12.M4A').pick?.n).toBe(1);
    expect(pickAttachment(list, 'notes').pick?.n).toBe(2);
    expect(pickAttachment(list, 3).error).toContain('no attachment 3');
    expect(pickAttachment(list, 'zzz').error).toContain('No attachment');
  });

  it('only saves inside an allowed folder, and never climbs out of it', () => {
    expect(saveTarget('D:\\Projects\\Podcasts', ALLOWED)).toEqual({ folder: 'D:\\Projects\\Podcasts', subfolder: '' });
    expect(saveTarget('d:/projects/podcasts/Show/Audio/_Inbox/', ALLOWED)).toEqual({ folder: 'D:\\Projects\\Podcasts', subfolder: 'Show\\Audio\\_Inbox' });
    expect(saveTarget('D:\\Projects\\PodcastsOther', ALLOWED)).toHaveProperty('error');
    expect(saveTarget('D:\\Projects\\Podcasts\\..\\..\\Windows', ALLOWED)).toHaveProperty('error');
    expect(saveTarget('Podcasts\\Audio', ALLOWED)).toHaveProperty('error');
    expect(saveTarget('C:\\Users\\Someone\\Startup', ALLOWED)).toHaveProperty('error');
    expect(saveTarget('D:\\Anything', [])).toHaveProperty('error');
    expect(saveTarget('E:\\Audio', ['E:\\'])).toEqual({ folder: 'E:\\', subfolder: 'Audio' });
  });

  it('saves the one attachment asked for and says where it went', async () => {
    const { w, saveAttachment, log } = world({ saveFolders: ALLOWED });
    const r = body(await handleRpc(w, call('download_attachment', { id: 'm1', attachment: 1, save_to: 'D:\\Projects\\Podcasts\\Inbox' })));
    expect(r.error).toBe(false);
    expect(saveAttachment).toHaveBeenCalledTimes(1);
    expect(saveAttachment).toHaveBeenCalledWith({ messageId: 'm1', attachmentId: 'x1', folder: 'D:\\Projects\\Podcasts', subfolder: 'Inbox', name: 'Episode 12.m4a' });
    expect(r.data).toMatchObject({ saved: true, path: 'D:\\Projects\\Podcasts\\Inbox\\Episode 12.m4a', sizeMB: 28, email: { subject: 'Episode 12 recording' } });
    expect(r.data.email.date).toBe('2026-11-20T00:00:00.000Z');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Saved the attachment'), 'done');
  });

  it('asks first by default, and keeps the extension when renaming', async () => {
    const { w, saveAttachment, ask$ } = world({ saveFolders: ALLOWED });
    await handleRpc(w, call('download_attachment', { id: 'm1', attachment: 'Episode 12.m4a', save_to: 'D:\\Projects\\Podcasts', filename: 'EP12 raw' }));
    expect(ask$).toHaveBeenCalledWith(expect.objectContaining({ capability: 'files.save', what: expect.stringContaining('D:\\Projects\\Podcasts') }));
    expect(saveAttachment).toHaveBeenCalledWith(expect.objectContaining({ name: 'EP12 raw.m4a' }));
  });

  it('refuses outside the allowed folders, programs, over 2 GB, unshared accounts, and a no', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ id: 'm1', attachment: 1, save_to: 'C:\\Windows' }, 'not inside a folder'],
      [{ id: 'm3', attachment: 1, save_to: 'D:\\Projects\\Podcasts' }, 'Programs and scripts'],
      [{ id: 'm1', attachment: 2, save_to: 'D:\\Projects\\Podcasts', filename: 'run.bat' }, 'Programs and scripts'],
      [{ id: 'm4', attachment: 1, save_to: 'D:\\Projects\\Podcasts' }, '2 GB'],
      [{ id: 'm5', attachment: 1, save_to: 'D:\\Projects\\Podcasts' }, 'not in a shared account'],
    ];
    for (const [args, words] of cases) {
      const { w, saveAttachment } = world({ saveFolders: ALLOWED });
      const r = body(await handleRpc(w, call('download_attachment', args)));
      expect(r.error).toBe(true);
      expect(r.text).toContain(words);
      expect(saveAttachment).not.toHaveBeenCalled();
    }
    const { w, saveAttachment } = world({ saveFolders: ALLOWED }, false);
    expect(body(await handleRpc(w, call('download_attachment', { id: 'm1', attachment: 1, save_to: 'D:\\Projects\\Podcasts' }))).error).toBe(true);
    expect(saveAttachment).not.toHaveBeenCalled();
  });

  it('works on a Read only account, and is listed for the AI', () => {
    const { w } = world({});
    expect(visibleTools(w.settings).map((t) => t.name)).toContain('download_attachment');
  });

  it('keeps the allowed folders tidy', () => {
    expect(tidy({ saveFolders: [' D:\\A ', 'D:\\A', '', 3 as unknown as string] }).saveFolders).toEqual(['D:\\A']);
    expect(tidy(undefined).saveFolders).toEqual([]);
  });
});
