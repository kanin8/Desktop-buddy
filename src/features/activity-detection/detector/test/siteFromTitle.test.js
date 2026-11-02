// Unit tests for reading the website from a browser window title.
// Run with: node --test "src/features/activity-detection/detector/test/*.test.js"
const test = require('node:test');
const assert = require('node:assert');

const { isBrowser, siteFromTitle, withSiteFromTitle } = require('../siteFromTitle');
const { ActivityClassifier } = require('../../classifier/index.js');

test('a YouTube tab in Brave is reported as YouTube', () => {
  const info = withSiteFromTitle({ appName: 'Brave Browser', title: '(3) Funny cats compilation - YouTube - Brave', source: 'app' });
  assert.strictEqual(info.site, 'YouTube');
  assert.strictEqual(info.domain, 'youtube.com');
  assert.strictEqual(info.source, 'title');
});

test('the YouTube home page is recognised', () => {
  assert.deepStrictEqual(siteFromTitle('YouTube - Brave'), { name: 'YouTube', domain: 'youtube.com' });
});

test('a site name inside a page title does not count', () => {
  assert.strictEqual(siteFromTitle('Notes about YouTube - Google Docs - Brave').name, 'Google Docs');
  assert.strictEqual(siteFromTitle('Why I quit YouTube forever - Medium - Brave'), null);
});

test('other separators and browsers work', () => {
  assert.strictEqual(siteFromTitle('Home / X - Google Chrome').name, 'X');
  assert.strictEqual(siteFromTitle('Inbox | Notion — Mozilla Firefox').name, 'Notion');
});

test('non-browser windows are left alone', () => {
  const info = { appName: 'Visual Studio Code', title: 'YouTube - notes.md', source: 'app' };
  assert.strictEqual(isBrowser(info.appName), false);
  assert.strictEqual(withSiteFromTitle(info), info);
});

test('the classifier marks title-detected YouTube as leisure', () => {
  const info = withSiteFromTitle({ appName: 'Brave Browser', title: 'Funny cats - YouTube - Brave', source: 'app' });
  assert.strictEqual(new ActivityClassifier().classify(info), 'leisure');
});

test('an unlisted site shows its name from the title, without a guessed domain', () => {
  const info = withSiteFromTitle({ appName: 'Brave Browser', title: 'Why I quit YouTube forever - Medium - Brave', source: 'app' });
  assert.strictEqual(info.site, 'Medium');
  assert.strictEqual(info.domain, undefined);
});

test('a one-part title is shown as it is', () => {
  assert.strictEqual(withSiteFromTitle({ appName: 'Brave Browser', title: 'New Tab - Brave', source: 'app' }).site, 'New Tab');
});

test('a profile name after the browser name is ignored', () => {
  assert.strictEqual(siteFromTitle('Funny cats - YouTube - Google Chrome - Work').name, 'YouTube');
});

test('a title that is only the browser name adds no site', () => {
  const info = { appName: 'Brave Browser', title: 'Brave', source: 'app' };
  assert.strictEqual(withSiteFromTitle(info).site, undefined);
});
