'use strict';

const { Plugin, PluginSettingTab, Setting, Notice, SuggestModal, TFile, requestUrl } = require('obsidian');
const path = require('path');
const fs = require('fs');

/* ---------------- settings ---------------- */

const DEFAULT_SETTINGS = {
  // Rewrite a pasted address. Off leaves only the command.
  linkOnPaste: true,
  // [↗](https://…) beside a note link, so the address survives a rename or a
  // move of the note. Off by default: it clutters the note (his ruling,
  // 2026-09-26, reversing the plan's default).
  keepWebLink: false,
  // [Title (Vault: Name)], so he sees where a link goes while reading.
  vaultInLinkText: true,
  // Fetch a page's title when no note exists for it (Auto Link Title's job).
  fetchTitles: true,
  // The properties a note names its source in. Case does not matter.
  urlKeys: 'url, source',
  // Vault names never linked to, such as old copies. His list of 2026-09-26:
  // Ideaverse, Archive, TESTFIELD. The vault being worked in is searched even
  // when listed, so a test inside TESTFIELD still finds TESTFIELD's notes.
  leaveOutVaults: [],
};

// Pages treat a script kindly when it looks like a browser; X serves its
// post text in the title only then.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15000;
// A paste refreshes the index first when it is older than this. A refresh
// only stats files (about 0.25 s over 6,000 notes), rereading the changed ones.
const INDEX_MAX_AGE_MS = 60 * 1000;

class ArchAfterURLinking extends Plugin {
  async onload() {
    await this.loadSettings();
    this.scans = {};
    this.vaults = [];
    this.index = new Map();
    this.indexedAt = 0;
    this.indexing = null;

    this.addCommand({ id: 'link-url', name: 'Link the URL under the Cursor', editorCallback: (editor, view) => this.linkAtCursor(editor, view) });
    this.addCommand({ id: 'rebuild-index', name: 'Rebuild the Index of Notes in Every Vault', callback: () => this.refreshIndex(true, true) });

    this.registerEvent(this.app.workspace.on('editor-paste', (evt, editor, info) => this.onPaste(evt, editor, info)));
    this.addSettingTab(new ArchAfterURLinkingSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => this.refreshIndex(false, false));
    this.log('loaded', this.manifest.version);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() { await this.saveData(this.settings); }

  // The settings file is mirrored between computers; a synced edit is taken in
  // rather than overwritten by the copy held in memory.
  async onExternalSettingsChange() {
    await this.loadSettings();
    this.refreshIndex(true, false);
  }

  /* ---------------- lib loading ---------------- */

  // Takes the bundle when built, falls back to disk so the repo runs unbuilt.
  lib() {
    if (this._lib) return this._lib;
    if (typeof ARCH_LIB !== 'undefined') { this._lib = ARCH_LIB; return this._lib; }
    const dir = path.join(this.vaultRoot(), this.app.vault.configDir, 'plugins', this.manifest.id, 'lib');
    this.dropLibFromRequireCache(dir);
    this._lib = require(path.join(dir, 'index.js'));
    return this._lib;
  }

  // A reloaded plugin would otherwise keep running the old lib/. Node caches a
  // module under its real path, and the plugin folder is a symlink into the
  // repo during development, so both paths are matched; and the require handed
  // to a plugin is Obsidian's wrapper, whose .cache is not Node's -- Electron's
  // real one is window.require. Both traps are ARCH Recreations' findings.
  dropLibFromRequireCache(dir) {
    const cache = (typeof window !== 'undefined' && window.require && window.require.cache) || require.cache || {};
    const roots = [dir];
    try { roots.push(fs.realpathSync(dir)); } catch (_) {}
    let dropped = 0;
    for (const key of Object.keys(cache)) {
      if (roots.some((root) => key.startsWith(root + path.sep))) { delete cache[key]; dropped++; }
    }
    if (dropped) this.log(`reloaded ${dropped} lib module(s) from disk`);
  }

  vaultRoot() { return this.app.vault.adapter.getBasePath(); }
  vaultName() { return path.basename(this.vaultRoot()); }
  log(...a) { console.log('[arch-after-urlinking]', ...a); }

  /* ---------------- the index of every vault ---------------- */

  urlKeys() {
    return String(this.settings.urlKeys || '').split(',').map((s) => s.trim()).filter(Boolean);
  }

  // One refresh at a time; a caller arriving mid-refresh waits for that one,
  // and a forced one (settings changed) then runs again, since the running one
  // started with the old settings.
  refreshIndex(force, announce) {
    if (this.indexing) return force ? this.indexing.then(() => this.refreshIndex(true, announce)) : this.indexing;
    if (!force && Date.now() - this.indexedAt < INDEX_MAX_AGE_MS) return Promise.resolve();
    this.indexing = this.doRefresh(force, announce).finally(() => { this.indexing = null; });
    return this.indexing;
  }

  async doRefresh(force, announce) {
    const L = this.lib();
    const started = Date.now();
    const { registry, vaults } = L.listVaults();
    if (!registry) this.log('could not find obsidian.json; only this vault is known');
    const leaveOut = new Set(this.settings.leaveOutVaults || []);
    // This vault is always known, even if the registry could not be read.
    const here = { name: this.vaultName(), path: this.vaultRoot() };
    const all = vaults.some((v) => v.path === here.path) ? vaults : [...vaults, here];
    this.registry = registry;
    this.vaults = all;
    const keys = this.urlKeys();
    const scans = {};
    let read = 0;
    for (const v of all) {
      if (leaveOut.has(v.name) && v.path !== here.path) continue;
      const prev = force ? null : this.scans[v.name];
      try {
        scans[v.name] = await L.scanVault(v, keys, prev);
        read += scans[v.name].read;
      } catch (e) {
        this.log(`could not read vault ${v.name} (${v.path}): ${e.message}`);
      }
    }
    this.scans = scans;
    const { index, notes } = L.buildIndex(scans);
    this.index = index;
    this.indexedAt = Date.now();
    const msg = `indexed ${notes} notes with a source in ${Object.keys(scans).length} vaults (${leaveOut.size} left out), ${read} read, in ${Date.now() - started} ms`;
    this.log(msg);
    if (announce) new Notice(`After URLinking: ${msg}.`);
  }

  // Notes for a key, this vault's first; a note under a left-out vault never
  // reaches here.
  lookup(key) {
    const here = this.vaultName();
    const found = (this.index.get(key) || []).slice();
    return found.sort((a, b) => (a.vault === here ? 0 : 1) - (b.vault === here ? 0 : 1));
  }

  /* ---------------- paste ---------------- */

  onPaste(evt, editor, info) {
    if (!this.settings.linkOnPaste || evt.defaultPrevented) return;
    const data = evt.clipboardData;
    if (!data || (data.files && data.files.length)) return;
    const text = (data.getData('text/plain') || '').trim();
    const L = this.lib();
    if (!L.isWebUrl(text) && !L.isObsidianUrl(text)) return;
    const why = this.leaveAloneHere(editor);
    if (why) { this.log(`paste of ${text} left as it is: ${why}`); return; }

    evt.preventDefault();
    const selection = editor.getSelection();
    const sourcePath = info && info.file ? info.file.path : '';
    this.writeLink(editor, text, selection, sourcePath, 'paste');
  }

  // Places where a pasted address must stay exactly as pasted: a code block,
  // inline code, the address half of a markdown link, the frontmatter (a url
  // property is After Clipping's to read, and wants the plain address).
  leaveAloneHere(editor) {
    const cur = editor.getCursor('from');
    const before = editor.getLine(cur.line).slice(0, cur.ch);
    if (/\]\(\s*$/.test(before) || /<\s*$/.test(before)) return 'inside a link address';
    if ((before.match(/`/g) || []).length % 2 === 1) return 'inside inline code';
    let fence = 0;
    for (let i = 0; i < cur.line; i++) if (/^\s*(```|~~~)/.test(editor.getLine(i))) fence++;
    if (fence % 2 === 1) return 'inside a code block';
    if (editor.getLine(0) === '---') {
      for (let i = 1; i <= cur.line; i++) {
        if (editor.getLine(i) === '---') return null;
        if (i === cur.line) return 'inside the frontmatter';
      }
    }
    return null;
  }

  // Puts a placeholder where the address goes at once, works out the link
  // (which may wait on the index or a web page), then swaps it in. If the
  // placeholder is gone by then (undone, edited, another note), nothing is
  // written. original is the markdown link the command was run on, kept when
  // no note is found.
  async writeLink(editor, url, selection, sourcePath, reason, original = null) {
    const marker = `[Linking… ${Math.random().toString(36).slice(2, 7)}](${url})`;
    editor.replaceSelection(marker);
    let out = original || url;
    try {
      out = await this.linkFor(url, selection, sourcePath, original);
    } catch (e) {
      this.log(`${reason} of ${url}: ${e.message}; left as it was`);
    }
    const text = editor.getValue();
    const at = text.indexOf(marker);
    if (at === -1) { this.log(`${reason} of ${url}: the placeholder was gone, nothing written`); return; }
    editor.replaceRange(out, editor.offsetToPos(at), editor.offsetToPos(at + marker.length));
  }

  // The markdown a pasted address becomes.
  async linkFor(url, selection, sourcePath, original = null) {
    const L = this.lib();
    await this.refreshIndex(false, false);
    const c = L.classify(url, { vaults: this.vaults, lookup: (k) => this.lookup(k) });
    const opts = this.settings;

    if (!c) {
      this.log(`${url}: an obsidian address for a vault not on this computer, left as it is`);
      return selection ? L.webLink(selection, url) : url;
    }

    if (c.kind === 'obsidian') {
      if (c.note.vault === this.vaultName()) {
        const link = this.localLink(c.note.file, sourcePath, selection);
        if (link) { this.log(`${url}: a note in this vault, written as an internal link`); return link; }
        this.log(`${url}: no note ${c.note.file} in this vault, left as it is`);
        return selection ? L.webLink(selection, url) : url;
      }
      this.warnIfMissing(c.note);
      this.log(`${url}: a note in ${c.note.vault}, ${c.note.file}`);
      return L.noteLink(c.note, opts, selection, null);
    }

    // A web address.
    let note = null;
    if (c.notes.length === 1) note = c.notes[0];
    else if (c.notes.length > 1) {
      note = await new ChooseNoteModal(this.app, c.notes, url).choose();
      this.log(`${url}: ${c.notes.length} notes have it (${c.notes.map((n) => `${n.vault}/${n.file}`).join('; ')}); chose ${note ? `${note.vault}/${note.file}` : 'the web link'}`);
    }
    if (note) {
      if (note.vault === this.vaultName()) {
        const link = this.localLink(note.file, sourcePath, selection);
        if (link) {
          this.log(`${url}: its note is in this vault, ${note.file}`);
          return opts.keepWebLink ? `${link} [↗](${L.destination(url)})` : link;
        }
      }
      if (c.notes.length === 1) this.log(`${url}: its note is in ${note.vault}, ${note.file}`);
      return L.noteLink(note, opts, selection, url);
    }

    if (original) { this.log(`${url}: no note; the link is kept as it was`); return original; }
    if (selection) { this.log(`${url}: no note; the selected text is the link text`); return L.webLink(selection, url); }
    if (!opts.fetchTitles) { this.log(`${url}: no note; fetching titles is off`); return url; }
    const title = await L.titleFor(url, (u) => this.fetchText(u), (m) => this.log(m));
    if (!title) return url;
    this.log(`${url}: ${c.notes.length ? 'the web link chosen' : 'no note'}; titled "${title}"`);
    return L.webLink(title, url);
  }

  // [[Note]] or a markdown link, however this vault is set to write links.
  localLink(file, sourcePath, alias) {
    const f = this.app.vault.getAbstractFileByPath(`${file}.md`) || this.app.metadataCache.getFirstLinkpathDest(file, sourcePath);
    if (!(f instanceof TFile)) return null;
    return this.app.fileManager.generateMarkdownLink(f, sourcePath, '', alias || undefined);
  }

  warnIfMissing(note) {
    const v = this.vaults.find((x) => x.name === note.vault);
    if (!v) return;
    const p = path.join(v.path, ...`${note.file}.md`.split('/'));
    if (!fs.existsSync(p) && !fs.existsSync(path.join(v.path, ...note.file.split('/')))) {
      this.log(`note ${note.file} is not in ${note.vault} on this computer; linked anyway, as pasted`);
    }
  }

  async fetchText(url) {
    const res = await Promise.race([
      requestUrl({ url, method: 'GET', headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en' }, throw: false }),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`no answer in ${FETCH_TIMEOUT_MS / 1000} s`)), FETCH_TIMEOUT_MS)),
    ]);
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return res.text;
  }

  /* ---------------- the command ---------------- */

  // The selected address, or the one under the cursor: a bare address, or a
  // markdown link [text](https://…) whose address is replaced by the note's.
  linkAtCursor(editor, view) {
    const L = this.lib();
    const sourcePath = view && view.file ? view.file.path : '';
    const sel = editor.getSelection().trim();
    if (sel && (L.isWebUrl(sel) || L.isObsidianUrl(sel))) {
      this.writeLink(editor, sel, '', sourcePath, 'command');
      return;
    }
    const cur = editor.getCursor();
    const line = editor.getLine(cur.line);
    const re = /\[((?:\\.|[^\]\\])*)\]\((<[^>]+>|[^)\s]+)\)|(?:https?|obsidian):\/\/[^\s)>\]]+/g;
    let m;
    while ((m = re.exec(line))) {
      const from = m.index;
      const to = m.index + m[0].length;
      if (cur.ch < from || cur.ch > to) continue;
      const url = m[2] ? m[2].replace(/^<|>$/g, '') : m[0];
      if (!L.isWebUrl(url) && !L.isObsidianUrl(url)) break;
      editor.setSelection({ line: cur.line, ch: from }, { line: cur.line, ch: to });
      this.writeLink(editor, url, '', sourcePath, 'command', m[2] ? m[0] : null);
      return;
    }
    new Notice('After URLinking: no URL under the cursor.');
  }
}

/* ---------------- several notes for one address ---------------- */

class ChooseNoteModal extends SuggestModal {
  constructor(app, notes, url) {
    super(app);
    this.items = [...notes, { webOnly: true }];
    this.setPlaceholder(`${notes.length} notes have ${url} as their source. Link to which?`);
    this.done = false;
  }

  choose() {
    return new Promise((resolve) => { this.resolve = resolve; this.open(); });
  }

  getSuggestions(query) {
    const q = query.toLowerCase();
    return this.items.filter((n) => n.webOnly || `${n.vault} ${n.file}`.toLowerCase().includes(q));
  }

  renderSuggestion(n, el) {
    if (n.webOnly) { el.createEl('div', { text: 'The web link only' }); return; }
    el.createEl('div', { text: `${n.title} (Vault: ${n.vault})` });
    el.createEl('small', { text: n.file, cls: 'mod-muted' });
  }

  onChooseSuggestion(n) {
    this.done = true;
    this.resolve(n.webOnly ? null : n);
  }

  // Escape chooses nothing, which writes the web link. onClose runs before
  // onChooseSuggestion, hence the wait.
  onClose() {
    setTimeout(() => { if (!this.done) this.resolve(null); }, 0);
  }
}

/* ---------------- settings tab ---------------- */

class ArchAfterURLinkingSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    // Its fields hold paths, commands, patterns and lists, not prose, so no
    // spell-check underlines; set as each one gets focus, which is when they appear.
    this.containerEl.addEventListener('focusin', (e) => {
      if (e.target.matches('input[type="text"], input:not([type]), textarea')) e.target.spellcheck = false;
    });
  }

  display() {
    const { containerEl } = this;
    const p = this.plugin;
    const s = p.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Link a Pasted Address')
      .setDesc('A pasted web address becomes a link to the note that already exists for it in any vault, or a link titled with the page\'s title. A pasted obsidian:// address becomes a titled link. Off leaves only the command "Link the URL under the Cursor".')
      .addToggle((t) => t.setValue(s.linkOnPaste).onChange(async (v) => { s.linkOnPaste = v; await p.saveSettings(); }));

    new Setting(containerEl)
      .setName('Keep the Web Link beside a Note Link')
      .setDesc('Writes [↗](https://…) after the link to the note, so the address survives if that note is renamed or moved. Off by default, because it clutters the note.')
      .addToggle((t) => t.setValue(s.keepWebLink).onChange(async (v) => { s.keepWebLink = v; await p.saveSettings(); }));

    new Setting(containerEl)
      .setName('Name the Vault in the Link Text')
      .setDesc('[Note title (Vault: Vault name)] rather than [Note title], so you see where a link goes while reading.')
      .addToggle((t) => t.setValue(s.vaultInLinkText).onChange(async (v) => { s.vaultInLinkText = v; await p.saveSettings(); }));

    new Setting(containerEl)
      .setName('Fetch Page Titles')
      .setDesc('When no note exists for an address, fetch the page\'s title for the link text. YouTube titles come from YouTube\'s own title service; Reddit titles are read from the address, since Reddit does not answer scripts.')
      .addToggle((t) => t.setValue(s.fetchTitles).onChange(async (v) => { s.fetchTitles = v; await p.saveSettings(); }));

    new Setting(containerEl)
      .setName('Source Properties')
      .setDesc('The properties a note names its source address in, separated by commas. Case does not matter.')
      .addText((t) => t.setValue(s.urlKeys).onChange(async (v) => { s.urlKeys = v; await p.saveSettings(); }))
      .addExtraButton((b) => b.setIcon('refresh-cw').setTooltip('Rebuild the index').onClick(() => p.refreshIndex(true, true).then(() => this.display())));

    new Setting(containerEl).setName('Vaults').setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: `Every vault Obsidian knows on this computer${p.registry ? ` (from ${p.registry})` : ''}. Turn one off to never link to its notes, such as a vault of old copies. A note under a vault's own Excluded files is never linked to.`,
    });
    const leaveOut = new Set(s.leaveOutVaults || []);
    for (const v of p.vaults) {
      const scan = p.scans[v.name];
      const withSource = scan ? Object.values(scan.files).filter((f) => f.urls.length).length : 0;
      const isHere = v.path === p.vaultRoot();
      const state = !leaveOut.has(v.name) ? `${withSource} notes with a source`
        : isHere ? `listed as left out, but still searched, since it is the vault you are in (${withSource} notes with a source)`
        : 'left out';
      new Setting(containerEl)
        .setName(v.name)
        .setDesc(`${v.path} — ${state}`)
        .addToggle((t) => t.setValue(!leaveOut.has(v.name)).onChange(async (on) => {
          if (on) leaveOut.delete(v.name); else leaveOut.add(v.name);
          s.leaveOutVaults = [...leaveOut];
          await p.saveSettings();
          await p.refreshIndex(true, false);
          this.display();
        }));
    }
    if (!p.vaults.length) containerEl.createEl('p', { cls: 'setting-item-description', text: 'The index has not been built yet.' });
  }
}

module.exports = ArchAfterURLinking;
