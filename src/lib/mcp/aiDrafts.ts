// Drafts written by AI apps, kept apart so they're easy to find: AI drafts in the sidebar, with groups
// like Clients or Personal. Groups are kept by id, so renaming one moves every draft in it along with it.
import { create } from 'zustand';
import { store } from '../db';
import { settings, useSettings, type DraftGroup } from '../settings';
import type { Draft } from '../types';

/** Which drafts the AI drafts screen shows: all, one group, or those in no group. */
export type DraftFilter = 'all' | 'none' | string;

export const useAiDrafts = create<{ list: Draft[]; filter: DraftFilter }>(() => ({ list: [], filter: 'all' }));

/** The AI drafts as last loaded, newest first. */
export const aiDraftsNow = () => useAiDrafts.getState().list;

export async function refreshAiDrafts() {
  try {
    const all = await store.drafts();
    useAiDrafts.setState({ list: all.filter((d) => d.byAi).sort((a, b) => b.updatedAt - a.updatedAt) });
  } catch { /* the list just stays as it was */ }
}

export const setDraftFilter = (filter: DraftFilter) => useAiDrafts.setState({ filter });

/** Counts for the sidebar: every group, plus drafts in no group. */
export function groupCounts(list: Draft[], groups: DraftGroup[]): { all: number; none: number; byGroup: Record<string, number> } {
  const known = new Set(groups.map((g) => g.id));
  const byGroup: Record<string, number> = {};
  let none = 0;
  for (const d of list) {
    if (d.group && known.has(d.group)) byGroup[d.group] = (byGroup[d.group] || 0) + 1;
    else none++;
  }
  return { all: list.length, none, byGroup };
}

/** Moves a draft into a group (or out of all groups). */
export async function setDraftGroup(id: string, group: string | undefined) {
  const d = await store.getDraft(id);
  if (!d) return;
  await store.putDraft({ ...d, group });
  await refreshAiDrafts();
}

const groups = () => settings().draftGroups || [];
const saveGroups = (draftGroups: DraftGroup[]) => useSettings.getState().set({ draftGroups });

/** A new group. Returns its id, or the existing one if the name is taken. */
export function addGroup(name: string): string | undefined {
  const clean = name.trim().slice(0, 40);
  if (!clean) return undefined;
  const same = groups().find((g) => g.name.toLowerCase() === clean.toLowerCase());
  if (same) return same.id;
  const id = `g${Date.now().toString(36)}`;
  saveGroups([...groups(), { id, name: clean }]);
  return id;
}

export function renameGroup(id: string, name: string) {
  const clean = name.trim().slice(0, 40);
  if (clean) saveGroups(groups().map((g) => (g.id === id ? { ...g, name: clean } : g)));
}

/** Removes a group. Its drafts stay, in no group. */
export async function deleteGroup(id: string) {
  saveGroups(groups().filter((g) => g.id !== id));
  for (const d of aiDraftsNow().filter((x) => x.group === id)) {
    const full = await store.getDraft(d.id);
    if (full) await store.putDraft({ ...full, group: undefined });
  }
  if (useAiDrafts.getState().filter === id) setDraftFilter('all');
  await refreshAiDrafts();
}
