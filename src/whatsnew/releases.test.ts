import { describe, expect, it } from 'vitest';
import { RELEASES, releasesToShow, tourSteps, unseenReleases, type Release } from './releases';

const r = (id: string): Release => ({ id, date: id, title: id, intro: 'i', features: [{ title: 't', text: 'x', art: 'spark' }] });
const list = [r('c'), r('b'), r('a')];

describe("what's new", () => {
  it('shows only the latest release to someone new', () => {
    expect(unseenReleases(list, null).map((x) => x.id)).toEqual(['c']);
  });

  it('shows every release since the last one seen', () => {
    expect(unseenReleases(list, 'a').map((x) => x.id)).toEqual(['c', 'b']);
  });

  it('shows nothing once the latest was seen', () => {
    expect(unseenReleases(list, 'c')).toEqual([]);
  });

  it('shows the latest when the last one seen no longer exists', () => {
    expect(unseenReleases(list, 'gone').map((x) => x.id)).toEqual(['c']);
  });

  it('opens each release with its title, then one step per feature', () => {
    const steps = tourSteps(list.slice(0, 2));
    expect(steps.map((s) => s.key)).toEqual(['c:intro', 'c:0', 'b:intro', 'b:0']);
    expect(steps[0].art).toBe('mark');
  });

  it('has unique ids and something to show in every release', () => {
    expect(new Set(RELEASES.map((x) => x.id)).size).toBe(RELEASES.length);
    for (const release of RELEASES) expect(release.features.length).toBeGreaterThan(0);
    const keys = tourSteps(RELEASES).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('releasesToShow', () => {
  it('shows nothing to someone brand new, and records the latest quietly', () => {
    expect(releasesToShow(list, null, null)).toEqual({ show: [], record: 'c' });
  });

  it('follows the account across devices, even without anything in this browser', () => {
    expect(releasesToShow(list, 'c', null)).toEqual({ show: [], record: null });
    expect(releasesToShow(list, 'b', null).show.map((x) => x.id)).toEqual(['c']);
  });

  it('prefers the account over this browser', () => {
    expect(releasesToShow(list, 'c', 'a').show).toEqual([]);
  });

  it('falls back to this browser and copies it to the account', () => {
    expect(releasesToShow(list, null, 'c')).toEqual({ show: [], record: 'c' });
    expect(releasesToShow(list, null, 'a').show.map((x) => x.id)).toEqual(['c', 'b']);
  });
});
