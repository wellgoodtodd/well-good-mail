// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bodyUnsubscribeLink, headerLinks, pageIsBlank } from '../unsubscribe';

describe('unsubscribe helpers', () => {
  it('reads the header links', () => {
    expect(headerLinks('<mailto:u@example.com?subject=x>, <https://example.com/u/1>')).toEqual({ https: 'https://example.com/u/1', mailto: 'mailto:u@example.com?subject=x' });
    expect(headerLinks('<http://example.com/u>')).toEqual({ https: undefined, mailto: undefined });
  });

  it('finds the link in the email by its words, then by its address', () => {
    expect(bodyUnsubscribeLink('<a href="https://a.com/x">Read more</a><a href="https://a.com/y">Unsubscribe</a>')).toBe('https://a.com/y');
    expect(bodyUnsubscribeLink('<a href="https://a.com/x">Manage your email preferences</a>')).toBe('https://a.com/x');
    expect(bodyUnsubscribeLink('<a href="https://a.com/unsub?id=1">here</a>')).toBe('https://a.com/unsub?id=1');
    expect(bodyUnsubscribeLink('<a href="https://a.com/x">Website</a>')).toBeUndefined();
    expect(bodyUnsubscribeLink(undefined)).toBeUndefined();
  });

  it('tells a blank page from one with something on it', () => {
    expect(pageIsBlank('<html><head><title></title></head><body>  </body></html>')).toBe(true);
    expect(pageIsBlank('')).toBe(true);
    expect(pageIsBlank('<body><p>You have been unsubscribed.</p></body>')).toBe(false);
    expect(pageIsBlank('<body><form><button>Confirm</button></form></body>')).toBe(false);
    expect(pageIsBlank('<body><div id="root"></div><script src="/app.js"></script></body>')).toBe(false);
  });
});
