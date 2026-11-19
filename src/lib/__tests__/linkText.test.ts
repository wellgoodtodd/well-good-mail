import { describe, it, expect } from 'vitest';
import { asHref, fullHref, linkLabel } from '../linkText';

describe('asHref', () => {
  it('knows web addresses, with or without https', () => {
    expect(asHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(asHref('example.co.uk')).toBe('https://example.co.uk');
    expect(asHref('www.example.com/page')).toBe('https://www.example.com/page');
  });
  it('knows email addresses', () => {
    expect(asHref('sam@example.com')).toBe('mailto:sam@example.com');
    expect(asHref('mailto:sam@example.com')).toBe('mailto:sam@example.com');
  });
  it('leaves ordinary words alone', () => {
    expect(asHref('our website')).toBeNull();
    expect(asHref('Agenda')).toBeNull();
    expect(asHref('')).toBeNull();
    expect(asHref('e.g')).toBeNull();
  });
});

describe('fullHref', () => {
  it('adds https:// when there is none', () => {
    expect(fullHref('example.com')).toBe('https://example.com');
    expect(fullHref('https://example.com')).toBe('https://example.com');
    expect(fullHref('sam@example.com')).toBe('mailto:sam@example.com');
  });
});

describe('linkLabel', () => {
  it('shows a link tidily', () => {
    expect(linkLabel('https://www.example.com/')).toBe('example.com');
    expect(linkLabel('https://example.com/pricing')).toBe('example.com/pricing');
    expect(linkLabel('mailto:sam@example.com')).toBe('sam@example.com');
  });
});
