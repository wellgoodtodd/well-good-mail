// Small banners inside the app for new mail, used instead of a Windows pop-up while the app is open and in front.
import { create } from 'zustand';

export interface Banner {
  id: number;
  title: string;
  body: string;
  actionLabel?: string;
  run?: () => void;
}

export const useBanners = create<{ list: Banner[] }>(() => ({ list: [] }));
let counter = 0;

export function dismissBanner(id: number) {
  useBanners.setState((s) => ({ list: s.list.filter((b) => b.id !== id) }));
}

export function showBanner(b: Omit<Banner, 'id'>) {
  const id = ++counter;
  useBanners.setState((s) => ({ list: [...s.list.slice(-2), { ...b, id }] }));
  setTimeout(() => dismissBanner(id), 7000);
}
