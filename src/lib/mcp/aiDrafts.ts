// Drafts written by AI apps, kept apart so they're easy to find: the "AI drafts" place in the sidebar.
import { create } from 'zustand';
import { store } from '../db';
import type { Draft } from '../types';

export const useAiDrafts = create<{ list: Draft[] }>(() => ({ list: [] }));

/** The AI drafts as last loaded, newest first. */
export const aiDraftsNow = () => useAiDrafts.getState().list;

export async function refreshAiDrafts() {
  try {
    const all = await store.drafts();
    useAiDrafts.setState({ list: all.filter((d) => d.byAi).sort((a, b) => b.updatedAt - a.updatedAt) });
  } catch { /* the list just stays as it was */ }
}
