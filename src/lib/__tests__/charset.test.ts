import { describe, expect, it } from 'vitest';
import { decodeBody } from '../mime';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('decodeBody', () => {
  it('reads UTF-8 that is wrongly labelled us-ascii or iso-8859-1', () => {
    expect(decodeBody(utf8('Abbie’s mum didn’t'), 'us-ascii')).toBe('Abbie’s mum didn’t');
    expect(decodeBody(utf8('café'), 'iso-8859-1')).toBe('café');
  });
  it('still reads real Windows-1252', () => {
    expect(decodeBody(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), 'windows-1252')).toBe('café');
  });
  it('reads normal UTF-8 and unknown labels', () => {
    expect(decodeBody(utf8('plain ’ text'), 'utf-8')).toBe('plain ’ text');
    expect(decodeBody(utf8('ok'), 'x-nonsense')).toBe('ok');
  });
});
