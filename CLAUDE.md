# Working notes for ARCH After URLinking

Turns a pasted address into the right link: to the note that already exists for
it in any vault on this computer, or, when there is none, a web link titled with
the page's title. Takes over Auto Link Title's job. Built for THOUGHTS, where
thoughts link to notes in other vaults; tested in `TESTFIELD` first (his choice,
2026-09-26).

**His plan and decisions are in `After URLinking Plan.md`** beside this file:
the note he reads. This file holds the rules for building it and the current
state; the history is in `CHANGELOG.md`. The family rules in
`~/Documents/CLAUDE.md` apply (plain commits, no AI attribution, logging always
on, nothing in `lib/` requires `obsidian`).

## What it does, and why each part is there

- **The vault list is read from Obsidian's own `obsidian.json`** on every index
  build (`lib/vaults.js`), never stored in settings: the Mac and the PC mirror the
  vaults at different paths and each reads its own list. A vault is named by its
  folder, which is what `vault=` in an `obsidian://` address means.
- **A note is found by the address in its source property** (`url`, `source`,
  any case; the family writes `url: "[Link](https://…)"`). Every address in the
  property counts, plain, as a markdown link or as a list.
- **`matchKey()` in `lib/urls.js` is the whole matching**: a YouTube id in any
  spelling, an X post by its id, a Reddit thread by its id, and otherwise host
  and path with `www.`/`m.`/`old.`, the fragment, a trailing slash and tracking
  parameters dropped. `?s=`/`?t=` are not dropped generally: X is keyed before
  the list is read, and on WordPress `?s=` is the search.
- **A folder holding its own `.obsidian` is another vault and is skipped** while
  walking. `~/Downloads` is registered as a vault by accident and holds every
  other vault; without this each note would be indexed twice. The cost: a vault
  that is not registered with Obsidian (the old ones inside `Archive/`) is not
  indexed at all.
- **Each vault's own *Excluded files* are honoured** (`userIgnoreFilters`), so a
  note in THOUGHTS' `TRASH` or an excluded old copy is never linked to.
- **The index lives in memory only.** A settings or cache file in the plugin
  folder is mirrored between the Mac and the PC, and paths differ between them.
  The first build takes about 3 s over 15 vaults and 6,900 notes in plain Node,
  and 6 to 13 s inside Obsidian (measured 2026-09-26), in the background after
  startup; a refresh stats every file and
  rereads only changed ones (0.25 s), and runs before a paste when the index is
  over a minute old.
- **Nothing here writes by itself**, so there is no `automaticOn`: building the
  index only reads, and every link is written by his paste or command.
- **A paste puts `[Linking… xxxxx](url)` in at once**, then swaps in the result.
  If the placeholder is gone by then, nothing is written.
- **Left alone**: a paste inside a code block, inline code, a link's address
  (`](` or `<` just before the cursor), or the frontmatter, where a `url`
  property must stay a plain address for After Clipping.
- **A note link reads `[Note title (Vault: Vault name)](obsidian://…)`**, his
  format of 2026-09-26. **The web link beside it (`[↗](https://…)`) is off by
  default**, his ruling the same day, because it clutters the note; it is the
  setting *Keep the web link beside a note link*.
- **An `obsidian://` address is encoded with `( ) ' ! *` escaped too**:
  `encodeURIComponent` leaves them, and a `)` ends a markdown link's address.
  Vault names with a non-breaking space (`⏻ TECHNOS`) are never retyped; they come
  from the folder name and encode as `%C2%A0`.
- **Several notes for one address**: this vault's first, then a menu lists them
  with "The web link only". 84 addresses had several notes on 2026-09-26, nearly
  all old copies. **He left out Ideaverse, Archive and TESTFIELD** (*"exclude them
  to keep things simple"*), and `backup-strategy/_before-video-move/` went into the
  Documents vault's *Excluded files*. That leaves 12, all inside vaults he uses:
  five CHAOS films with an old copy in `_/Old Film Notes` (his todo to compare and
  delete), duplicate downloads in CHAOS, one iCanStudy page split into several
  notes, and Psycho-history's *The Acceleration (Safe)*.
- **The left-out list is a setting of each vault**, so **every vault that installs
  the plugin needs the same list** (Ideaverse, Archive, TESTFIELD); set it in the
  settings tab, never in `data.json` while Obsidian runs. The vault being worked in
  is searched even when listed, so a test inside TESTFIELD still finds its notes.
- **The command *Link the URL under the cursor*** works on a bare address, a
  selected one, or an existing `[text](https://…)` link. On an existing link it
  only ever swaps in a note link; with no note, the link is left exactly as it was.

## Titles (`lib/titles.js`)

- **YouTube**: the page's `<title>` reads " - YouTube" to a script (Auto Link
  Title's usual failure). YouTube's oEmbed returns the real title.
- **Reddit**: the provider's DNS on his Mac answers `127.0.0.1` for
  `www.reddit.com`, and `old.reddit.com` answers scripts with 403 (checked
  2026-09-26). The title is read from the address:
  `r/Stoicism – Epictetus said freedom is secured not by the`.
- **X**: the page title with a browser User-Agent is `Name on X: "post text" / X`;
  the ` / X` is cut. X's oEmbed answered nothing.
- **Everything else**: `og:title`, then `twitter:title`, then `<title>`.
- **A title that is only the site's name** ("Instagram", "Gemini") is dropped
  and the address pasted bare, for him to name.

## Things learned building it

- The sandboxed shell here has no Python certificates (`CERTIFICATE_VERIFY_FAILED`),
  so reachability is tested with `curl`.
- zsh globs `?`, `[` and `*` in unquoted `grep -E` patterns and fails with "no
  matches found"; quote them or use a script.

## Where things stand (edit in place)

**0.1.0, built and tested in `TESTFIELD` on 2026-09-26** (left-out list set there), symlinked there like
the siblings; **Auto Link Title is turned off in TESTFIELD** for the test (turn it
back on with `obsidian vault=TESTFIELD plugin:enable id=obsidian-auto-link-title`
if the test ends without this plugin). `npm test` has 6 passing tests on `lib/`.
Inside the running app, through `obsidian eval`: every row of the plan's table,
the NBSP vault `⏻ TECHNOS`, a note in this vault as `[[…]]`, Reddit, X,
Wikipedia's parentheses, the places a paste is left alone (inline code, a code
block, a link's address), the command on an existing link with and without a
note, two commands during an index refresh, and the several-notes menu (choose,
and Escape for the web link). **Not yet done: clicking an `obsidian://` link to
see it open** (it would open other vaults' windows on his screen); the note
`TESTFIELD/ARCH test/URLinking Test.md` holds links for him to click.

- A cursor put inside the frontmatter in Live Preview is moved below the
  properties by Obsidian, so the frontmatter rule only matters in Source mode.
- **Unconfirmed, After Clipping**: the first test run, on a note created a moment
  before, lost one placeholder and left a stray `r` while After Clipping was
  processing that new note (`processing … (no url)`, `transform done`). A rerun on
  the same note was clean. If it recurs, look at whether After Clipping writes
  back a note it read before the editor's latest change.

Not published: no GitHub repository yet. It becomes a public one (BRAT needs it)
when he moves it out of TESTFIELD. The later work (colour for vault links, a
repair command, converting THOUGHTS' existing links) is in the plan note, *Later*.
