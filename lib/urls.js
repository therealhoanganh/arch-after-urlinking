// What a pasted address is, and the key two addresses for the same page share.
//
// A note in another vault is found by the address in its url property, and the
// address pasted is rarely spelled the same way: youtu.be against
// youtube.com/watch, twitter.com against x.com, a share link with ?si= or
// utm_ parameters. matchKey() reduces both sides to one key so they meet.

// Parameters that say who shared a link or where it was clicked, never which
// page it is. hl is a language choice (Instagram's ?hl=en), not a page. X's
// ?s=20&t=… are not listed: X is keyed before this list is read, and on a
// WordPress site ?s= is the search itself.
const TRACKING_PARAMS = new Set([
  'si', 'fbclid', 'gclid', 'dclid', 'msclkid', 'igsh', 'igshid', 'mibextid',
  'ref', 'ref_src', 'ref_url', 'feature', 'hl', 'share_id',
  'rdt', 'mc_cid', 'mc_eid', 'spm', 'vd_source',
]);

const HOST_PREFIXES = /^(www|m|mobile|old|new|np|amp)\./;

function isWebUrl(text) {
  return /^https?:\/\/[^\s]+$/i.test(String(text || '').trim());
}

function isObsidianUrl(text) {
  return /^obsidian:\/\/[^\s]+$/i.test(String(text || '').trim());
}

function parse(url) {
  try { return new URL(String(url).trim()); } catch (_) { return null; }
}

function bareHost(u) {
  return u.hostname.toLowerCase().replace(HOST_PREFIXES, '');
}

// The YouTube video id in any of its spellings, or null.
function youtubeId(u) {
  const host = bareHost(u);
  if (host === 'youtu.be') return u.pathname.split('/')[1] || null;
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;
  const v = u.searchParams.get('v');
  if (v) return v;
  const m = u.pathname.match(/^\/(shorts|live|embed|v)\/([\w-]{6,})/);
  return m ? m[2] : null;
}

// The key a page is known by. Two addresses with the same key are one page.
function matchKey(url) {
  const u = parse(url);
  if (!u || !/^https?:$/.test(u.protocol)) return String(url || '').trim().toLowerCase();
  const host = bareHost(u);

  const yt = youtubeId(u);
  if (yt) return `youtube:${yt}`;
  if (/(^|\.)youtube\.com$/.test(host) && u.pathname === '/playlist' && u.searchParams.get('list')) {
    return `youtube-list:${u.searchParams.get('list')}`;
  }

  if (host === 'x.com' || host === 'twitter.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const at = parts.indexOf('status');
    if (at > -1 && parts[at + 1]) return `x-status:${parts[at + 1]}`;
    if (parts[0]) return `x.com/${parts[0].toLowerCase()}`;
  }

  if (host === 'reddit.com' || host === 'redd.it') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (host === 'redd.it' && parts[0]) return `reddit:${parts[0].toLowerCase()}`;
    const at = parts.indexOf('comments');
    if (at > -1 && parts[at + 1]) return `reddit:${parts[at + 1].toLowerCase()}`;
    // A subreddit or user page: case never matters on Reddit.
    return `reddit.com/${parts.join('/').toLowerCase()}`;
  }

  const kept = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()) && !/^utm_/i.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = kept.length ? '?' + kept.map(([k, v]) => `${k}=${v}`).join('&') : '';
  const pathname = u.pathname.replace(/\/+$/, '');
  return `${host}${pathname}${query}`;
}

// obsidian://open?vault=…&file=…, obsidian://open?path=…, obsidian://vault/…
// and Advanced URI's obsidian://adv-uri?vault=…&filepath=…. Returns
// { vault, file } or { path } (an absolute path on this computer), or null.
// file is as given, with or without .md.
function parseObsidianUrl(url) {
  const text = String(url || '').trim();
  const m = text.match(/^obsidian:\/\/([^?#/]+)\/?([^?#]*)(\?[^#]*)?/i);
  if (!m) return null;
  const action = m[1].toLowerCase();
  const params = new URLSearchParams((m[3] || '').slice(1));
  const heading = text.includes('#') ? decodeSafe(text.slice(text.indexOf('#') + 1)) : '';

  if (action === 'vault') {
    // obsidian://vault/<vault>/<path/to/file>
    const parts = m[2].split('/').map(decodeSafe);
    if (parts.length < 2) return null;
    return { vault: parts[0], file: parts.slice(1).join('/'), heading };
  }
  if (action === 'open') {
    if (params.get('path')) return { path: params.get('path'), heading };
    if (params.get('vault') && params.get('file')) return { vault: params.get('vault'), file: params.get('file'), heading };
    return null;
  }
  if (action === 'advanced-uri' || action === 'adv-uri') {
    const file = params.get('filepath') || params.get('filename');
    if (params.get('vault') && file) return { vault: params.get('vault'), file, heading: params.get('heading') || heading };
    return null;
  }
  return null;
}

function decodeSafe(s) {
  try { return decodeURIComponent(s); } catch (_) { return s; }
}

// encodeURIComponent leaves ( ) ' ! * alone; a ")" inside a markdown link's
// address ends the link, so all five are encoded.
function encodePart(s) {
  return encodeURIComponent(s).replace(/[()'!*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// The address Obsidian's own "Copy Obsidian URL" writes: the vault by name,
// the file without .md, "/" encoded as %2F.
function obsidianUrl(vault, file) {
  return `obsidian://open?vault=${encodePart(vault)}&file=${encodePart(String(file).replace(/\.md$/i, ''))}`;
}

module.exports = { isWebUrl, isObsidianUrl, matchKey, youtubeId, parseObsidianUrl, obsidianUrl, encodePart, bareHost, parse };
