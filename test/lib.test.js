// node --test test/  -- checks lib/ against addresses taken from his vaults.
const test = require('node:test');
const assert = require('node:assert');
const L = require('../lib/index.js');

test('one key for every spelling of a YouTube video', () => {
  const k = 'youtube:tOm_aF_SB-k';
  for (const u of [
    'https://www.youtube.com/watch?v=tOm_aF_SB-k',
    'https://youtu.be/tOm_aF_SB-k?si=ZTFJpVnNA64h1_0z&t=1074',
    'https://m.youtube.com/watch?v=tOm_aF_SB-k&feature=share',
    'https://www.youtube.com/shorts/tOm_aF_SB-k',
    'https://youtube.com/live/tOm_aF_SB-k?feature=shared',
  ]) assert.strictEqual(L.matchKey(u), k, u);
});

test('X, Reddit and plain sites', () => {
  assert.strictEqual(L.matchKey('https://twitter.com/onbrandviews/status/1970500247890862143?s=20'), 'x-status:1970500247890862143');
  assert.strictEqual(L.matchKey('https://x.com/ylecun'), L.matchKey('https://twitter.com/YLeCun/'));
  assert.strictEqual(L.matchKey('https://old.reddit.com/r/Stoicism/comments/v8cdfl/epictetus/?utm_source=share'), 'reddit:v8cdfl');
  assert.strictEqual(L.matchKey('https://www.reddit.com/r/Stoicism/comments/v8cdfl/'), 'reddit:v8cdfl');
  assert.strictEqual(L.matchKey('https://predictivehistory.substack.com/p/the-acceleration/?utm_source=x#footnote'),
    'predictivehistory.substack.com/p/the-acceleration');
  assert.strictEqual(L.matchKey('https://www.instagram.com/reel/DMYsJzIpONA/?hl=en'), 'instagram.com/reel/DMYsJzIpONA');
  assert.notStrictEqual(L.matchKey('https://site.com/?s=one'), L.matchKey('https://site.com/?s=two'));
});

test('obsidian addresses', () => {
  assert.deepStrictEqual(
    L.parseObsidianUrl('obsidian://open?vault=Psycho-history&file=Wiki%2FConcepts%2FMass%2C%20energy%2C%20coordination'),
    { vault: 'Psycho-history', file: 'Wiki/Concepts/Mass, energy, coordination', heading: '' });
  assert.deepStrictEqual(L.parseObsidianUrl('obsidian://vault/GENERALS/Browses/Note'), { vault: 'GENERALS', file: 'Browses/Note', heading: '' });
  assert.deepStrictEqual(L.parseObsidianUrl('obsidian://open?path=%2FUsers%2Fx%2FV%2FA.md'), { path: '/Users/x/V/A.md', heading: '' });
  const url = L.obsidianUrl('⏻ TECHNOS', 'YouTube/A (b) c\'s.md');
  assert.ok(!/[()' ]/.test(url), url);
  assert.deepStrictEqual(L.parseObsidianUrl(url), { vault: '⏻ TECHNOS', file: "YouTube/A (b) c's", heading: '' });
});

test('source urls from frontmatter, in the shapes the family writes', () => {
  const fm = L.frontmatter('---\nurl: "[Link](https://www.youtube.com/watch?v=dwbnTddcm4U)"\nURL: "[TMDB](https://www.themoviedb.org/tv/296756)"\nother-games:\n  - "[x](https://store.steampowered.com/x)"\nsource:\n  - https://a.com/1\n  - "[b](https://b.com/2)"\ntags: [a]\n---\nbody https://not.this');
  assert.deepStrictEqual(L.sourceUrls(fm, ['url', 'source']),
    ['https://www.youtube.com/watch?v=dwbnTddcm4U', 'https://www.themoviedb.org/tv/296756', 'https://a.com/1', 'https://b.com/2']);
});

test('classify and write', () => {
  const note = { vault: 'Psycho-history', file: 'Sources/Lectures/The Acceleration', title: 'The Acceleration' };
  const ctx = { vaults: [{ name: 'Psycho-history', path: '/v/Psycho-history' }], lookup: (k) => (k === 'youtube:abcdefghijk' ? [note] : []) };
  const c = L.classify('https://youtu.be/abcdefghijk?si=x', ctx);
  assert.strictEqual(c.kind, 'web');
  assert.strictEqual(c.notes.length, 1);
  assert.strictEqual(L.noteLink(note, { vaultInLinkText: true, keepWebLink: false }, '', c.url),
    '[The Acceleration (Vault: Psycho-history)](obsidian://open?vault=Psycho-history&file=Sources%2FLectures%2FThe%20Acceleration)');
  assert.strictEqual(L.noteLink(note, { vaultInLinkText: true, keepWebLink: true }, '', c.url),
    '[The Acceleration (Vault: Psycho-history)](obsidian://open?vault=Psycho-history&file=Sources%2FLectures%2FThe%20Acceleration) [↗](https://youtu.be/abcdefghijk?si=x)');
  const o = L.classify('obsidian://open?path=%2Fv%2FPsycho-history%2FWiki%2FA.md', ctx);
  assert.deepStrictEqual(o.note, { vault: 'Psycho-history', file: 'Wiki/A', title: 'A', heading: '' });
  assert.strictEqual(L.classify('obsidian://open?vault=Nope&file=A', ctx), null);
  assert.strictEqual(L.webLink('A [b] c', 'https://w.org/wiki/X_(y)'), '[A \\[b\\] c](<https://w.org/wiki/X_(y)>)');
});

test('titles', async () => {
  assert.strictEqual(L.redditTitleFromUrl(new URL('https://www.reddit.com/r/Stoicism/comments/v8cdfl/epictetus_said_freedom_is_secured_not_by_the/')),
    'r/Stoicism – Epictetus said freedom is secured not by the');
  const page = '<title>edward on X: &quot;hello&quot; / X</title>';
  assert.strictEqual(await L.titleFor('https://x.com/a/status/1', async () => page), 'edward on X: "hello"');
  assert.strictEqual(await L.titleFor('https://www.instagram.com/reel/x/', async () => '<title>Instagram</title>'), null);
  assert.strictEqual(await L.titleFor('https://www.youtube.com/watch?v=abcdefghijk', async (u) =>
    (u.includes('oembed') ? '{"title":"Geo-Strategy Update #7:  When Eschatologies Converge"}' : '<title> - YouTube</title>')),
    'Geo-Strategy Update #7: When Eschatologies Converge');
  assert.strictEqual(await L.titleFor('https://a.org/p', async () => { throw new Error('offline'); }), null);
});
