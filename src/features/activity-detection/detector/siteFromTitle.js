// Works out which website a browser window shows from its title, for
// platforms where the URL cannot be read (Windows, Linux).
const { browsers, sites } = require('./sites.json');

// Browsers join page title, site name and browser name with one of these,
// e.g. "Funny cats - YouTube - Brave" or "Inbox | Notion".
const TITLE_SEPARATORS = /\s+[-–—|·/]\s+/;

// "(3) Funny cats" -> "Funny cats": unread counts are not part of the name.
const NOTIFICATION_COUNT = /^\(\d+\+?\)\s*/;

function isBrowserName(text) {
  const name = String(text || '').toLowerCase();
  return browsers.some(browser => name.includes(browser.toLowerCase()));
}

function isBrowser(appName) {
  return isBrowserName(appName);
}

/**
 * Splits a window title into its parts and drops the browser's own name (and
 * anything after it, such as a profile name), leaving only the page's parts.
 * "Funny cats - YouTube - Brave" -> ["Funny cats", "YouTube"]
 */
function pageSegments(title) {
  const segments = String(title || '')
    .split(TITLE_SEPARATORS)
    .map(segment => segment.replace(NOTIFICATION_COUNT, '').trim())
    .filter(Boolean);
  const browserIndex = segments.findIndex(isBrowserName);
  return browserIndex >= 0 ? segments.slice(0, browserIndex) : segments;
}

/**
 * Returns { name, domain } for the known site in `title`, or null.
 * A marker must be a whole title segment, so a document called
 * "Notes about YouTube - Google Docs" is Google Docs, not YouTube.
 * Segments are checked from the end, where browsers put the site name.
 */
function siteFromTitle(title) {
  const segments = pageSegments(title).map(segment => segment.toLowerCase());

  for (let i = segments.length - 1; i >= 0; i--) {
    const site = sites.find(candidate =>
      candidate.titleMarkers.some(marker => marker.toLowerCase() === segments[i]));
    if (site) return { name: site.name, domain: site.domain };
  }
  return null;
}

/**
 * Best guess at the site name for a site that is not in sites.json. Most
 * sites end their title with their own name ("Some article - Medium"), so the
 * last part is used; a title with one part is shown as it is.
 */
function guessSiteName(title) {
  const segments = pageSegments(title);
  return segments.length ? segments[segments.length - 1] : null;
}

/**
 * Adds `site` (and `domain` for known sites) to a browser window's info, so
 * the activity shows the website instead of the browser. Windows of other
 * apps are returned unchanged.
 */
function withSiteFromTitle(info) {
  if (!isBrowser(info.appName)) return info;

  const known = siteFromTitle(info.title);
  if (known) return { ...info, site: known.name, domain: known.domain, source: 'title' };

  // Unknown site: show its name, but leave `domain` unset rather than guess
  // an address, so url rules and overrides only ever match real domains.
  const guessed = guessSiteName(info.title);
  return guessed ? { ...info, site: guessed, source: 'title' } : info;
}

module.exports = { isBrowser, siteFromTitle, guessSiteName, withSiteFromTitle };
