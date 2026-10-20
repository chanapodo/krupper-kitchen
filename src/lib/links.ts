/**
 * Recipe links pasted from a Google results page often come wrapped
 * (google.com/url?q=...) or with Google's tracking glued on, sometimes straight
 * onto the path with no "?" ("/Recipes/6590&sa=U&ved=...&usg=..."). Such links
 * don't open, so they are cleaned before anything reads them.
 */

// tracking parameters that never change what page opens
const JUNK = /^(utm_\w+|fbclid|gclid|gclsrc|dclid|msclkid|igshid|mc_cid|mc_eid|sa|ved|usg|sqi|ei|oq|gs_lcp|sclient|cad|uact|rct|esrc|aqs|sourceid)$/i;
// on YouTube "si" is a share tracker too, but "v", "t", "list" matter
const KEEP_ON_YT = /^(v|t|list|index)$/i;

/** The first http(s) link in a pasted text (shares often add a title before it). */
export function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"'״]+/i);
  return m ? m[0].replace(/[).,;!?]+$/, '') : null;
}

export function cleanUrl(raw: string): string {
  let s = (firstUrl(raw) ?? raw).trim();
  for (let i = 0; i < 3; i++) {
    let u: URL;
    try {
      u = new URL(s);
    } catch {
      return s;
    }
    // Google redirect: the real link is in q= or url=
    const host = u.hostname.replace(/^www\./, '');
    if (/^google\.[a-z.]+$/.test(host) && u.pathname === '/url') {
      const inner = u.searchParams.get('q') ?? u.searchParams.get('url');
      if (inner && /^https?:\/\//.test(inner)) {
        s = inner;
        continue;
      }
    }
    break;
  }
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return s;
  }
  // "&sa=U&ved=..." glued to the path: everything from the first "&key=" is a query, not the path
  const glued = u.pathname.match(/^(.*?)&[\w.-]+=.*$/);
  if (glued) {
    const extra = decodeURIComponent(u.pathname.slice(glued[1].length + 1));
    u.pathname = glued[1];
    for (const pair of extra.split('&')) {
      const [k, v = ''] = pair.split('=');
      if (k && !u.searchParams.has(k)) u.searchParams.append(k, v);
    }
  }
  const yt = /(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname.replace(/^www\./, ''));
  for (const k of [...u.searchParams.keys()]) {
    if (yt ? !KEEP_ON_YT.test(k) : JUNK.test(k)) u.searchParams.delete(k);
  }
  if (u.hash && /^#:~:text=/.test(u.hash)) u.hash = '';
  let out = u.toString();
  if (!u.search) out = out.replace(/\?$/, '');
  return out;
}
