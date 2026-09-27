# Changelog

Dated entries, newest last: what changed, what prompted it, and his words where
he gave them.

## 2026-09-26 — Planned and built, 0.1.0

**The request.** *"In this conversation, you will help me build
arch-after-urlinking plugin. It will be mainly used in THOUGHTS vaults where I
link thoughts and ideas to notes in other vaults. This will also cover function
of Auto Link Title, like it will detect the link, wether it's obsidian or from
outside and transform accordingly."* It had been named and parked since the
THOUGHTS split (`~/Documents/CLAUDE.md`, *ARCH After URLinking*), and the six
hand-generated cross-vault links in the Grand Strategy were what it should
produce.

**Measured first.** 1,629 distinct addresses across the vaults belong to notes;
THOUGHTS holds 1,468 links, of which 58 (23 distinct pages) had a note in another
vault. So the value is at paste time, not in converting old links.

**His decisions, from the plan's questions:**

- A note link keeps the web link beside it. His words: *"Note link + web link like
  you recommended, but I think we will need to differentiate them with color, in
  my snippet I already assign cyan to web link, I think I will asign purple-ish to
  obsidian note link. We will work more on this later though, cover all snippet
  and theme, write this down in plan and todo."*
- The link text names the vault: *Title + vault*.
- *"Test in TESTFIELD first instead of THOUGHTS"*.
- The existing THOUGHTS links: *"This I will do manually later (with your assist),
  go through thought notes and month notes entirely and create notes for links."*

Written down as `After URLinking Plan.md` (his note) and three todos under the
plugin in THOUGHTS' September month note.

**Found while building**: Reddit is unreachable from the Mac (the DNS answers
`127.0.0.1`), YouTube page titles read " - YouTube" to a script, and 84 addresses
have more than one note, nearly all old copies. Each is handled as recorded in
`CLAUDE.md`.

## 2026-09-26 — The web link off by default; "(Vault: …)" in the link text

Seeing `[↗](youtube link)` after a note link, he asked whether it was for testing: he had
read the plan's "Note link + web link" as the plugin working on both kinds of link, not
as both links written side by side. His ruling: *"I think it should be turn off by default
becaue It does clutter the note visual."* And for the link text: *"replace "Note name ·
Vault name" with "Note name (Vault: Vault name)", for better visual clarity."* The
setting `keepWebLink` now defaults to off, and the format is in `noteText()` in
`lib/links.js`. The one cost: a planned repair of links to a renamed note can no longer
rely on the web address, and has to find the note by its name.

## 2026-09-26 — Old copies left out of the index

84 addresses had more than one note, so a paste asked which one. Asked whether Ideaverse,
Archive and TESTFIELD should be left out, he answered: *"No, exclude them to keep things
simple."* TESTFIELD's settings now list the three, and the Documents vault's *Excluded
files* gained `backup-strategy/_before-video-move/` (set through Obsidian, not by editing
`app.json`). 12 addresses with several notes remain, all inside vaults he uses; they are
listed in `CLAUDE.md`. Two code changes came with it: the vault being worked in is searched
even when it is on the list (otherwise testing inside TESTFIELD would find nothing there),
and a forced rebuild asked for during a running one now runs again afterwards, where
before it returned the running one, built with the old settings.

## 2026-09-26 — Released 0.1.0, installed in THOUGHTS

He clicked the links in `TESTFIELD/ARCH test/URLinking Test.md` (*"For the test, I did
click and they worked."*) and asked: *"Add the plugin to THOUGHTS for me. And create github
repo for it two."* The repository is public, like the other ARCH plugins, because BRAT
installs from GitHub releases and cannot read a private one. Release 0.1.0 carries the
built `dist/main.js` and `dist/manifest.json`. In THOUGHTS it was installed through BRAT's
`addPlugin`, the left-out list set to Ideaverse, Archive and TESTFIELD (the setting belongs
to each vault), and Auto Link Title turned off.

## 2026-09-27 — 0.1.1, Title Case

From the web-design-guidelines review of 2026-09-27 (`~/Documents/ARCH UI Review.md`), whose
whole list he approved: *"Yes, proceed on."* The two commands and the setting names are in
Title Case, Chicago style, as in ARCH Images Plus 0.7.6: his preference, *"Actually, I much
prefer Title Case."* The *Vaults* heading is Obsidian's own (`setHeading`) rather than plain
`h3` text, and the settings' fields (vault names, property names) get no spell-check
underlines. Its note chooser is Obsidian's own suggest list and needed nothing.

## 2026-09-27 — 0.1.2, the Vaults explanation under its heading

The paragraph explaining the vault list sat loose under the *Vaults* heading, outside the
setting cards; it is the heading's own description now. From his note on the ARCH plugins'
layout the same day (*"the toggle list to paste youtube channel links in is quite ugly"*),
which led to looking at every settings tab for loose paragraphs and bare boxes.
