// One email inside a conversation to open in the reading pane: clicked in the list with the conversation opened out.
import { create } from 'zustand';

export const useMessageFocus = create<{ id?: string; seq: number }>(() => ({ seq: 0 }));
export const focusMessage = (id: string) => useMessageFocus.setState((s) => ({ id, seq: s.seq + 1 }));
