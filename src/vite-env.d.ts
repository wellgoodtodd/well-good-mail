/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
  readonly VITE_MICROSOFT_CLIENT_ID?: string;
}

declare module 'nspell' {
  const nspell: (d: { aff: string; dic: string }) => { correct(word: string): boolean; suggest(word: string): string[]; add(word: string): unknown };
  export default nspell;
}
