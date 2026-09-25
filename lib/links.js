// What a pasted address becomes, written as markdown.

const path = require('path');
const { isWebUrl, isObsidianUrl, matchKey, parseObsidianUrl, obsidianUrl } = require('./urls.js');

// Link text may not hold a bare [ or ], or the link ends early.
function escapeText(s) {
  return String(s).replace(/\s+/g, ' ').trim().replace(/[[\]]/g, '\\$&');
}

// An address with a space or a bracket inside it is wrapped in <>, which
// markdown reads as one address whatever it holds.
function destination(url) {
  return /[\s()<>]/.test(url) ? `<${url.replace(/>/g, '%3E')}>` : url;
}

function webLink(text, url) {
  return `[${escapeText(text)}](${destination(url)})`;
}

// [Note title · Vault](obsidian://…) and, when a web address is known and
// kept, [↗](https://…) beside it: the address survives a rename or move of the
// note, and lets a later repair find it again (his choice, 2026-09-26).
function noteLink(note, opts, text, webUrl) {
  const shown = text || (opts.vaultInLinkText ? `${note.title} · ${note.vault}` : note.title);
  let out = `[${escapeText(shown)}](${obsidianUrl(note.vault, note.file)}${note.heading ? '%23' + encodeURIComponent(note.heading) : ''})`;
  if (webUrl && opts.keepWebLink) out += ` [↗](${destination(webUrl)})`;
  return out;
}

// Classifies a pasted text. ctx: { vaults: [{name, path}], lookup(key) }.
// Returns one of
//   { kind: 'web', url, key, notes: [...] }      notes may be empty
//   { kind: 'obsidian', url, note }               note.vault may be this vault
//   null                                          not an address this handles
function classify(text, ctx) {
  const t = String(text || '').trim();
  if (isWebUrl(t)) {
    const key = matchKey(t);
    return { kind: 'web', url: t, key, notes: ctx.lookup(key) || [] };
  }
  if (isObsidianUrl(t)) {
    const p = parseObsidianUrl(t);
    if (!p) return null;
    let vault = p.vault;
    let file = p.file;
    if (p.path) {
      // open?path= names a file on disk; the vault is the deepest one holding it.
      const holder = ctx.vaults
        .filter((v) => p.path === v.path || p.path.startsWith(v.path + path.sep))
        .sort((a, b) => b.path.length - a.path.length)[0];
      if (!holder) return null;
      vault = holder.name;
      file = path.relative(holder.path, p.path).split(path.sep).join('/');
    }
    const known = ctx.vaults.find((v) => v.name === vault);
    if (!known) return null;
    file = String(file).replace(/\.md$/i, '');
    return { kind: 'obsidian', url: t, note: { vault, file, title: path.posix.basename(file), heading: p.heading || '' } };
  }
  return null;
}

module.exports = { classify, noteLink, webLink, escapeText, destination };
