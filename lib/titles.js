// The title a web link is written with, when no note exists for it.
//
// This is the job Auto Link Title did, done per site where a page's own
// <title> lies to a script. fetchText(url) is handed in by main.js (Obsidian's
// requestUrl, which ignores CORS); nothing here requires 'obsidian'.

const { parse, bareHost, youtubeId } = require('./urls.js');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : m));
}

function clean(s) {
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

function metaContent(html, attr, name) {
  const re1 = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${name}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? clean(m[1]) : '';
}

function htmlTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? clean(m[1]) : '';
}

// A title that is only the site's name ("Instagram", "Gemini", " - YouTube")
// says nothing about the page; the link is better left bare for him to name.
function isOnlySiteName(title, u) {
  const t = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!t) return true;
  const label = bareHost(u).split('.').slice(-2, -1)[0] || '';
  return t === label || t === 'google' + label || ['youtube', 'x', 'twitter', 'login', 'signin', 'justamoment'].includes(t);
}

// Reddit is unreachable from his Mac (the provider's DNS answers 127.0.0.1
// for www.reddit.com, old.reddit.com refuses scripts), so the title is read
// from the address: /r/Stoicism/comments/v8cdfl/epictetus_said_freedom/.
function redditTitleFromUrl(u) {
  const parts = u.pathname.split('/').filter(Boolean);
  const sub = parts[0] === 'r' && parts[1] ? `r/${parts[1]}` : parts[0] === 'u' || parts[0] === 'user' ? `u/${parts[1] || ''}` : '';
  const at = parts.indexOf('comments');
  const slug = at > -1 ? parts[at + 2] : '';
  if (!slug) return sub || null;
  let words = slug;
  try { words = decodeURIComponent(slug); } catch (_) {}
  words = words.replace(/_/g, ' ').trim();
  const sentence = words.charAt(0).toUpperCase() + words.slice(1);
  return sub ? `${sub} – ${sentence}` : sentence;
}

// X's page title is 'Name on X: "post text" / X' or 'Name (@handle) / X'.
function xTitle(html) {
  const t = htmlTitle(html).replace(/\s*\/\s*X$/, '');
  return t && t !== 'X' ? t : metaContent(html, 'property', 'og:title');
}

async function titleFor(url, fetchText, log = () => {}) {
  const u = parse(url);
  if (!u) return null;
  const host = bareHost(u);

  try {
    if (youtubeId(u) || /(^|\.)youtube\.com$/.test(host)) {
      const body = await fetchText(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      try {
        const t = clean(JSON.parse(body).title || '');
        if (t) return t;
      } catch (_) { /* not a video or playlist oEmbed knows; fall through to the page */ }
    }

    if (host === 'reddit.com' || host === 'redd.it') return redditTitleFromUrl(u);

    const html = await fetchText(url);
    const title = host === 'x.com' || host === 'twitter.com'
      ? xTitle(html)
      : metaContent(html, 'property', 'og:title') || metaContent(html, 'name', 'twitter:title') || htmlTitle(html);
    if (isOnlySiteName(title, u)) {
      log(`no title for ${url}: the page gave "${title}", only the site's name`);
      return null;
    }
    return title;
  } catch (e) {
    log(`no title for ${url}: ${e.message}`);
    return null;
  }
}

module.exports = { titleFor, redditTitleFromUrl, isOnlySiteName, decodeEntities, htmlTitle, metaContent };
