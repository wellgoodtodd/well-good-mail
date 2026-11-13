import { describe, expect, it } from 'vitest';
import { isLinkPlace, placeMatch, placesFromEvents, suggestPlaces } from '../places';

const NOW = 1_000_000;
const ev = (id: string, location: string | undefined, start: number, accountId = 'a') => ({ id, accountId, location, start });

describe('places from events', () => {
  it('skips links and empty places, and joins spellings case-insensitively', () => {
    const places = placesFromEvents([
      ev('1', 'The Crown, Leeds', 10),
      ev('2', 'the crown, leeds', 20),
      ev('3', 'The Crown,  Leeds ', 30),
      ev('4', 'https://meet.google.com/abc-defg-hij', 40),
      ev('5', '', 50),
      ev('6', undefined, 60),
    ], NOW);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ place: 'The Crown, Leeds', uses: 3, last: 30 });
  });

  it('counts the same event once when it comes from two copies', () => {
    const places = placesFromEvents([ev('1', 'Office', 10), ev('1', 'Office', 10), ev('2', 'Office', 20)], NOW);
    expect(places[0].uses).toBe(2);
  });

  it('treats future events as used now', () => {
    expect(placesFromEvents([ev('1', 'Gym', NOW + 5000)], NOW)[0].last).toBe(NOW);
  });

  it('knows a link from a place', () => {
    expect(isLinkPlace('https://zoom.us/j/123')).toBe(true);
    expect(isLinkPlace('www.example.com')).toBe(true);
    expect(isLinkPlace('teams.microsoft.com/l/meetup-join/xyz')).toBe(true);
    expect(isLinkPlace('Room 4.2, Main Building')).toBe(false);
    expect(isLinkPlace('12 High Street, York')).toBe(false);
  });
});

describe('matching and ranking', () => {
  it('scores the start of the place over the start of a word over anywhere', () => {
    expect(placeMatch('Leeds Station', 'lee')).toBe(3);
    expect(placeMatch('The Crown, Leeds', 'lee')).toBe(2);
    expect(placeMatch('Fleetwood', 'lee')).toBe(1);
    expect(placeMatch('York', 'lee')).toBe(0);
  });

  const places = placesFromEvents([
    ev('1', 'Fleet Street Cafe', 100),
    ev('2', 'Leeds Office', 50),
    ev('3', 'Leeds Office', 60),
    ev('4', 'Leeds Library', 300),
    ev('5', 'The Leeds Arms', 400),
  ], NOW);

  it('puts better matches first, then most used, then most recent', () => {
    expect(suggestPlaces('lee', places).map((p) => p.place)).toEqual(['Leeds Office', 'Leeds Library', 'The Leeds Arms', 'Fleet Street Cafe']);
  });

  it('shows the most recent places when nothing is typed', () => {
    expect(suggestPlaces('', places).map((p) => p.place)).toEqual(['The Leeds Arms', 'Leeds Library', 'Fleet Street Cafe', 'Leeds Office']);
  });

  it("doesn't offer the place that's already in the box", () => {
    expect(suggestPlaces('leeds office', places).map((p) => p.place)).not.toContain('Leeds Office');
  });

  it('adds contact addresses after event places, matched by place or name, without repeats', () => {
    const got = suggestPlaces('lee', places, [
      { place: '1 Leeds Road, Bradford', name: 'Sam Patel' },
      { place: 'leeds office', name: 'Work' },
    ]);
    expect(got.filter((p) => p.place.toLowerCase() === 'leeds office')).toHaveLength(1);
    const sam = got.find((p) => p.name === 'Sam Patel');
    expect(sam?.place).toBe('1 Leeds Road, Bradford');
    expect(got.indexOf(sam!)).toBeGreaterThan(got.findIndex((p) => p.place === 'The Leeds Arms'));
    expect(suggestPlaces('sam', places, [{ place: '1 Leeds Road, Bradford', name: 'Sam Patel' }]).map((p) => p.name)).toEqual(['Sam Patel']);
  });

  it('keeps to the limit', () => {
    expect(suggestPlaces('e', places, [], 2)).toHaveLength(2);
  });
});
