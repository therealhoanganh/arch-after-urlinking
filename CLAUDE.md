# ARCH After URLinking

## Rules

### What It Is

- It turns a pasted address into a link to the note that already exists for it, in any vault on this computer.
- With no note, it writes a web link titled with the page's title.
- It replaces Auto Link Title. Two plugins rewriting one paste fight each other, so Auto Link Title is off wherever this one runs.
- His plan and decisions: `After URLinking Plan.md` beside this file. The history: `CHANGELOG.md`.
- The test record, the per-site title findings and the old duplicate count: `Documents/_/AI/arch-after-urlinking/Details.md`. This repo is public, so they stay out of it.

### Finding the Note

- The vault list is read from Obsidian's own `obsidian.json` on every index build (`lib/vaults.js`), never from settings. The Mac and the PC keep the vaults at different paths.
- A vault is named by its folder, which is what `vault=` in an `obsidian://` address means.
- A note is found by the address in its source properties, the setting Source Properties (`url, source`), any case.
- Every address in the property counts: plain, a markdown link, or a list.
- `matchKey()` in `lib/urls.js` does all the matching. Change matching there and nowhere else.
	- A YouTube video by its id in any spelling, an X post by its id, a Reddit thread by its id.
	- Anything else by host and path, with `www.`, `m.`, `old.`, the fragment, a trailing slash and tracking parameters dropped.
	- `?s=` and `?t=` are not dropped in general. X is keyed before the list is read, and on WordPress `?s=` is the search.
- A folder holding its own `.obsidian` is another vault and is skipped. `~/Downloads` is registered as a vault by accident and holds every other vault, so without this each note would be indexed twice.
- The cost: a vault Obsidian doesn't know, such as the old ones inside `Archive/`, is not indexed.
- Each vault's own Excluded Files (`userIgnoreFilters`) are honoured, so a note in THOUGHTS' `TRASH` is never linked to.
- The index lives in memory only. A cache file in the plugin folder would be mirrored to the PC, where the paths differ.
- The first build takes 6 to 13 s inside Obsidian over 15 vaults and 6,900 notes (Sep 26), in the background after startup.
- A refresh rereads only changed files (0.25 s). It runs before a paste when the index is over a minute old.

### Several Notes for One Address

- This vault's note comes first, then a menu lists the rest with "The web link only".
- He left out Ideaverse, Archive and TESTFIELD. His words: "exclude them to keep things simple".
- The left-out list is a setting of each vault, so every vault that installs the plugin needs the same three. Set it in the settings tab.
- The vault being worked in is searched even when it is left out, so a test in TESTFIELD still finds its notes.

### Writing the Link

- Nothing writes by itself, so there is no `automaticOn`. Building the index only reads, and every link comes from his paste or command.
- A paste puts `[Linking… xxxxx](url)` in at once, then swaps in the result. If the placeholder is gone by then, nothing is written.
- A paste is left alone inside a code block, inline code, a link's address (`](` or `<` just before the cursor) or the frontmatter.
- The frontmatter is left alone because a `url` property must stay a plain address for After Clipping.
- A note link reads `[Note title (Vault: Vault name)](obsidian://…)`, his format of Sep 26.
- The web link beside it, `[↗](https://…)`, is off by default, his ruling: it clutters the note. The setting is Keep the Web Link beside a Note Link.
- An `obsidian://` address escapes `( ) ' ! *` too. `encodeURIComponent` leaves them, and a `)` ends a markdown link's address.
- A vault name with a non-breaking space is never retyped. It comes from the folder name and encodes as `%C2%A0`.
- The command Link the URL under the Cursor works on a bare address, a selected one, or an existing `[text](https://…)` link.
- On an existing link it only ever swaps in a note link. With no note, the link stays exactly as it was.
- A title that is only the site's name, such as "Instagram", is dropped and the address pasted bare, for him to name.
- Each site's title rule, and why, is in the comments of `lib/titles.js`.

### Testing

- `npm test` runs the tests on `lib/`: 6, all passing on Oct 9.
- Test inside the running app through `obsidian eval`, in TESTFIELD, where the repo is symlinked.
- Python in this shell has no certificates (`CERTIFICATE_VERIFY_FAILED`, still so on Oct 9), so test whether a site answers with `curl`.

## Mistakes and Lessons

- Sep 26: zsh expanded `?`, `[` and `*` in an unquoted `grep -E` pattern and failed with "no matches found". Quote the pattern or use a script. It happened again on Oct 9.

## Where It Stands

- 0.1.2 is the latest release, running in THOUGHTS. 0.1.0 came through BRAT, 0.1.1 and 0.1.2 were copied in by hand.
- THOUGHTS leaves out Ideaverse, Archive and TESTFIELD, checked Oct 9.
- Auto Link Title is off in THOUGHTS and TESTFIELD, and on in the 12 other vaults, checked Oct 9.
- Unconfirmed: the first test run, on a note made a moment before, lost one placeholder and left a stray `r` while After Clipping was processing that note. A rerun was clean.
	- If it recurs, check whether After Clipping writes back a note it read before the editor's latest change.
- Later, in the plan note: a command to repair links broken by a rename, converting a whole note's links, and whether other vaults get the plugin.
