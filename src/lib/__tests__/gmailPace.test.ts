import { beforeEach, describe, expect, it } from 'vitest';
import { allClear, backOff, gapFor, gmailCost, paceFor, resetPaces, START_RATE, MIN_RATE } from '../providers/gmailPace';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

describe('Gmail pacing by quota cost', () => {
  beforeEach(() => { resetPaces(); localStorage.clear(); });

  it('knows what each kind of request costs', () => {
    expect(gmailCost(`${API}/messages/abc?format=full`)).toBe(5);
    expect(gmailCost(`${API}/history?startHistoryId=1`)).toBe(2);
    expect(gmailCost('/profile')).toBe(1);
    expect(gmailCost('/messages/send', 'POST')).toBe(100);
    expect(gmailCost('/messages/batchModify', 'POST')).toBe(50);
    expect(gmailCost('/drafts/d1', 'PUT')).toBe(15);
  });

  it('starts at two thirds of the 6,000 limit, so an email fetch takes 75 ms', () => {
    const p = paceFor('a');
    expect(p.rate).toBe(START_RATE);
    expect(gapFor(p, 5)).toBe(75);
  });

  it('halves once for a burst of refusals, and remembers a ceiling under where it happened', () => {
    backOff('a', 5000, 1000);
    backOff('a', 5000, 1100);
    backOff('a', 5000, 1200);
    const p = paceFor('a');
    expect(p.rate).toBe(START_RATE / 2);
    expect(p.ceiling).toBe(START_RATE * 0.8);
    expect(JSON.parse(localStorage.getItem('wgm-gmail-pace')!).a).toBe(START_RATE * 0.8);
  });

  it('climbs back to the ceiling but not past it', () => {
    backOff('a', 1, 0);
    for (let i = 0; i < 1000; i++) allClear('a');
    expect(paceFor('a').rate).toBe(START_RATE * 0.8);
  });

  it('starts the next run at the speed it learnt', () => {
    backOff('a', 1, 0);
    resetPaces();
    expect(paceFor('a').rate).toBe(START_RATE * 0.8);
    expect(paceFor('b').rate).toBe(START_RATE);
  });

  it('never goes below the minimum', () => {
    for (let i = 0; i < 30; i++) backOff('a', 1, i * 10);
    expect(paceFor('a').rate).toBe(MIN_RATE);
  });
});
