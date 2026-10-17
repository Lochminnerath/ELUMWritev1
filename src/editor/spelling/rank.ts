/** Optimal string alignment distance: insertions, deletions, substitutions and swapped neighbours each cost 1. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const sorted = (s: string) => [...s].sort().join('');
const single = (s: string) => s.replace(/(.)\1+/g, '$1');

/**
 * Orders the dictionary's suggestions by how likely they are to be what was meant:
 * fewest edits first, then the same letters in a different order (the commonest
 * typo) or a doubled letter, then the same first letter. Matches the word's capitalisation.
 */
export function rankSuggestions(word: string, suggestions: string[], limit = 6): string[] {
  const lower = word.toLowerCase();
  const capital = word[0] !== lower[0];
  const seen = new Set<string>();
  return suggestions
    .map((s, index) => {
      const l = s.toLowerCase();
      return {
        s,
        l,
        index,
        distance: editDistance(lower, l),
        anagram: sorted(l) === sorted(lower) ? 0 : 1,
        // A doubled letter typed once, or once typed twice.
        doubled: single(l) === single(lower) ? 0 : 1,
        first: l[0] === lower[0] ? 0 : 1,
        // All-caps entries (abbreviations) rarely fix an ordinary word.
        shouting: s.length > 1 && s === s.toUpperCase() ? 1 : 0,
      };
    })
    .sort((x, y) => x.distance - y.distance || x.anagram - y.anagram || x.doubled - y.doubled || x.shouting - y.shouting || x.first - y.first || x.index - y.index)
    .map(({ s, l }) => (capital && s === l ? s[0].toUpperCase() + s.slice(1) : s))
    .filter((s) => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
