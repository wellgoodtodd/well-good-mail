import { describe, expect, it } from 'vitest';
import { RSVP_ORDER, RSVP_WORDS, answerOfRsvp, clashFor, copiesOf, invitationLists, isInvitation, newInvitationCount, rsvpOfAnswer } from '../invites';
import { graphGuests } from '../providers/microsoft';
import type { CalendarEvent, GuestAnswer } from '../types';

const H = 3600000;
const NOW = 1_800_000_000_000;

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({ id: 'x', accountId: 'a', calendarName: 'Cal', title: 'Thing', start: NOW + H, end: NOW + 2 * H, allDay: false, reminderMinutes: [], ...over });
const invite = (id: string, answer: GuestAnswer, over: Partial<CalendarEvent> = {}) => ev({
  id, title: id, myResponse: answer, organiser: { email: 'sam@x.com', name: 'Sam' },
  guests: [{ email: 'sam@x.com', answer: 'yes', organiser: true }, { email: 'me@x.com', answer, self: true }],
  ...over,
});

describe('which events are invitations', () => {
  it('needs you as a guest, not the organiser', () => {
    expect(isInvitation(invite('a', 'waiting'))).toBe(true);
    expect(isInvitation(invite('b', 'yes', { organiser: { email: 'me@x.com', self: true } }))).toBe(false);
    expect(isInvitation(ev({}))).toBe(false);
    expect(isInvitation(ev({ myResponse: 'yes', guests: [{ email: 'me@x.com', answer: 'yes', self: true, organiser: true }, { email: 'kim@x.com', answer: 'waiting' }] }))).toBe(false);
  });
});

describe('New and Replied', () => {
  it('puts unanswered and cancelled ones in New, soonest first, and answered ones in Replied', () => {
    const l = invitationLists([
      invite('later', 'waiting', { start: NOW + 5 * H, end: NOW + 6 * H }),
      invite('soon', 'waiting'),
      invite('gone', 'waiting', { cancelled: true, start: NOW + 3 * H, end: NOW + 4 * H }),
      invite('yes', 'yes'),
      invite('past', 'waiting', { start: NOW - 3 * H, end: NOW - 2 * H }),
    ], NOW);
    expect(l.fresh.map((e) => e.id)).toEqual(['soon', 'gone', 'later']);
    expect(l.replied.map((e) => e.id)).toEqual(['yes']);
    expect(newInvitationCount(l)).toBe(2);
  });
  it('shows the same invitation on two accounts once, keeping the copy still waiting', () => {
    const l = invitationLists([invite('same', 'yes', { id: 'one' }), invite('same', 'waiting', { id: 'two', accountId: 'b' })], NOW);
    expect(l.fresh.map((e) => e.id)).toEqual(['two']);
    expect(l.replied).toEqual([]);
  });
  it('finds every copy to answer', () => {
    const all = [invite('same', 'waiting', { id: 'one' }), invite('same', 'waiting', { id: 'two', accountId: 'b' }), invite('other', 'waiting')];
    expect(copiesOf(all[0], all).map((e) => e.id)).toEqual(['one', 'two']);
  });
});

describe('clashes', () => {
  it('names an overlapping event you are going to', () => {
    const inv = invite('Podcast planning', 'waiting');
    const edit = ev({ id: 'e', title: 'Edit day', start: NOW, end: NOW + 8 * H });
    expect(clashFor(inv, [inv, edit])?.title).toBe('Edit day');
  });
  it('ignores declined, all-day and back-to-back events', () => {
    const inv = invite('Call', 'waiting');
    expect(clashFor(inv, [
      ev({ id: 'n', title: 'Said no', myResponse: 'no' }),
      ev({ id: 'd', title: 'Holiday', allDay: true, start: NOW, end: NOW + 24 * H }),
      ev({ id: 'b', title: 'Before', start: NOW, end: NOW + H }),
    ])).toBeUndefined();
  });
});

describe('answer words', () => {
  it('says Accept, Maybe and Decline, in that order', () => {
    expect(RSVP_ORDER.map((s) => RSVP_WORDS[s].label)).toEqual(['Accept', 'Maybe', 'Decline']);
    expect(RSVP_WORDS.declined.past).toBe('Not going');
  });
  it('turns calendar answers into ours and back', () => {
    expect(rsvpOfAnswer('waiting')).toBeUndefined();
    expect(rsvpOfAnswer('maybe')).toBe('tentative');
    expect(answerOfRsvp('declined')).toBe('no');
  });
});

describe('Outlook answers', () => {
  it('uses the event\'s own answer when your line in the guest list says none', () => {
    const out = graphGuests({
      isOrganizer: false,
      responseStatus: { response: 'tentativelyAccepted' },
      organizer: { emailAddress: { address: 'sam@x.com' } },
      attendees: [{ status: { response: 'none' }, emailAddress: { address: 'me@x.com' } }],
    }, ['me@x.com']);
    expect(out.myResponse).toBe('maybe');
  });
  it('counts a reply not yet given as waiting', () => {
    const out = graphGuests({ isOrganizer: false, responseStatus: { response: 'notResponded' }, organizer: { emailAddress: { address: 'sam@x.com' } }, attendees: [{ status: { response: 'none' }, emailAddress: { address: 'me@x.com' } }] }, ['me@x.com']);
    expect(out.myResponse).toBe('waiting');
  });
});
