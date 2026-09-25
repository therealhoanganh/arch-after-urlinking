// Every vault on this computer, and every note in them that names its source.
//
// Obsidian lists its vaults in obsidian.json, so no vault path is stored in
// settings: the Mac and the PC mirror the vaults at different paths, and each
// reads its own list. A vault is named by its folder, which is what the
// vault= in an obsidian:// address means.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { matchKey } = require('./urls.js');

// Where Obsidian keeps obsidian.json: macOS, Linux (deb/AppImage, snap,
// flatpak), Windows.
function registryCandidates() {
  const home = os.homedir();
  return [
    path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json'),
    path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obsidian', 'obsidian.json'),
    path.join(home, 'snap', 'obsidian', 'current', '.config', 'obsidian', 'obsidian.json'),
    path.join(home, '.var', 'app', 'md.obsidian.Obsidian', 'config', 'obsidian', 'obsidian.json'),
    path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'obsidian', 'obsidian.json'),
  ];
}

// [{ name, path }], every registered vault that still exists on disk.
function listVaults() {
  for (const file of registryCandidates()) {
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { continue; }
    const out = [];
    for (const v of Object.values(data.vaults || {})) {
      if (!v || !v.path) continue;
      try { if (!fs.statSync(path.join(v.path, '.obsidian')).isDirectory()) continue; } catch (_) { continue; }
      out.push({ name: path.basename(v.path), path: v.path });
    }
    return { registry: file, vaults: out };
  }
  return { registry: null, vaults: [] };
}

// The vault's own *Excluded files* (userIgnoreFilters): a plain entry is a
// path prefix, one written /like this/ is a regular expression. Honoured so a
// note he sent to TRASH or excluded as an old copy is never linked to.
function ignoreFilters(vaultPath) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(vaultPath, '.obsidian', 'app.json'), 'utf8')).userIgnoreFilters || []; } catch (_) {}
  return list.map((f) => {
    const m = String(f).match(/^\/(.*)\/([a-z]*)$/);
    if (m) { try { const re = new RegExp(m[1], m[2]); return (p) => re.test(p); } catch (_) { return () => false; } }
    return (p) => p.startsWith(String(f));
  });
}

// The frontmatter block at the top of a note, or ''.
function frontmatter(text) {
  if (!text.startsWith('---')) return '';
  const end = text.indexOf('\n---', 3);
  return end === -1 ? '' : text.slice(3, end);
}

// Every web address in the named properties, whether written plainly, as a
// markdown link ("[Link](https://…)", the family's shape) or as a list.
function sourceUrls(fm, keys) {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const out = [];
  const lines = fm.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([^\s:#][^:]*):(.*)$/);
    if (!m || !wanted.has(m[1].trim().toLowerCase())) continue;
    let value = m[2];
    while (i + 1 < lines.length && /^\s+-?\s*\S/.test(lines[i + 1])) value += '\n' + lines[++i];
    for (const u of value.match(/https?:\/\/[^\s)"'\]>]+/g) || []) out.push(u);
  }
  return out;
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.obsidian', '.trash']);
const HEAD_BYTES = 16384;

async function readHead(file) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    let text = buf.toString('utf8', 0, bytesRead);
    // A frontmatter longer than the head: read the whole note.
    if (bytesRead === HEAD_BYTES && text.startsWith('---') && text.indexOf('\n---', 3) === -1) {
      text = await fs.promises.readFile(file, 'utf8');
    }
    return text;
  } finally { await fh.close(); }
}

// Walks one vault. A folder holding its own .obsidian is another vault and is
// left to its own scan, so ~/Downloads (registered by accident, and holding
// every other vault) does not index each note twice. prev is this vault's
// last scan; a note whose mtime has not changed is not read again.
async function scanVault(vault, keys, prev) {
  const ignored = ignoreFilters(vault.path);
  const files = {};
  let read = 0;
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    let entries;
    try { entries = await fs.promises.readdir(path.join(vault.path, rel), { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
        if (ignored.some((f) => f(relPath + '/'))) continue;
        if (fs.existsSync(path.join(vault.path, relPath, '.obsidian'))) continue;
        stack.push(relPath);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        if (ignored.some((f) => f(relPath))) continue;
        const full = path.join(vault.path, relPath);
        let mtime;
        try { mtime = (await fs.promises.stat(full)).mtimeMs; } catch (_) { continue; }
        const old = prev && prev.files[relPath];
        if (old && old.mtime === mtime) { files[relPath] = old; continue; }
        let urls = [];
        try { urls = sourceUrls(frontmatter(await readHead(full)), keys); } catch (_) {}
        read++;
        files[relPath] = { mtime, urls };
      }
    }
  }
  return { files, read };
}

// Builds key -> [{ vault, file, title, url }] from every vault's scan.
function buildIndex(scans) {
  const index = new Map();
  let notes = 0;
  for (const [name, scan] of Object.entries(scans)) {
    for (const [file, info] of Object.entries(scan.files)) {
      if (!info.urls.length) continue;
      notes++;
      const seen = new Set();
      for (const url of info.urls) {
        const key = matchKey(url);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ vault: name, file, title: path.basename(file).replace(/\.md$/i, ''), url });
      }
    }
  }
  return { index, notes };
}

module.exports = { listVaults, registryCandidates, ignoreFilters, frontmatter, sourceUrls, scanVault, buildIndex };
