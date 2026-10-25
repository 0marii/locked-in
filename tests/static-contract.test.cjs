"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const JS_MODULES = [
  "constants.js", "runtime.js", "storage.js", "toast.js", "utils.js",
  "sync.js", "theme-nav.js", "setup.js", "session.js", "history.js",
  "insights.js", "notes.js", "todos.js", "week-reports.js", "customize.js",
  "settings.js", "bind.js"
];

const CSS_MODULES = [
  "tokens.css", "base.css", "layout.css", "components.css", "setup.css",
  "timer.css", "report.css", "history.css", "insights.css", "notes.css",
  "todos.css", "customize.css", "settings.css", "mobile.css"
];

const ASSET_FILES = [
  "favicon.svg", "favicon-32.png", "logo-mark.png",
  "icon-192.png", "icon-512.png", "icon-512-maskable.png",
  "apple-touch-icon.png", "og-image.png", "og-image.svg"
];

function readAppSources() {
  const parts = [read("app.js")];
  for (const name of JS_MODULES) {
    parts.push(read(path.join("js", name)));
  }
  return parts.join("\n");
}

test("no broken root duplicate contract test", () => {
  assert.equal(
    fs.existsSync(path.join(root, "static-contract.test.cjs")),
    false,
    "root static-contract.test.cjs must stay deleted (wrong __dirname)"
  );
});

test("required entry files exist", () => {
  for (const file of [
    "index.html", "app.js", "style.css", "robots.txt", "sitemap.xml",
    "404.html", "manifest.webmanifest", "sw.js"
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
  }
  for (const name of JS_MODULES) {
    assert.ok(fs.existsSync(path.join(root, "js", name)), `missing js/${name}`);
  }
  for (const name of CSS_MODULES) {
    assert.ok(fs.existsSync(path.join(root, "css", name)), `missing css/${name}`);
  }
  for (const name of ASSET_FILES) {
    assert.ok(fs.existsSync(path.join(root, "assets", name)), `missing assets/${name}`);
  }
});

test("index links relative app assets and honest PWA refs", () => {
  const html = read("index.html");
  assert.match(html, /href="\.\/style\.css/);
  assert.match(html, /import\("\.\/app\.js\?v=\d+"\)|type="module"[^>]*src="\.\/app\.js|src="\.\/app\.js[^"]*"[^>]*type="module"/);
  assert.match(html, /href="\.\/assets\/favicon\.svg"/);
  assert.match(html, /href="\.\/assets\/apple-touch-icon\.png"/);
  assert.match(html, /assets\/logo-mark\.png/);
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.match(html, /serviceWorker\.register\("\.\/sw\.js"\)/);
  assert.match(html, /assets\/og-image\.png/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /id="pref-notify-end"/);
  assert.match(html, /id="pref-chime"/);
  assert.match(html, /id="recent-goals"/);
  assert.match(html, /id="goal-tag"/);
  assert.match(html, /id="focus-goals-panel"/);
  assert.match(html, /id="week-reports-panel"|id="share-week-card-btn"|week-reports/);
  assert.match(html, /id="history-tag-filter"/);
  assert.match(html, /name="referrer"/);
  assert.match(read("style.css"), /Locked-In core CSS/);
  assert.doesNotMatch(read("style.css"), /@import/);
});

test("About has no version line; Settings danger labels are clear", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /id="settings-app-version"/);
  assert.match(html, /Delete session history/);
  assert.match(html, /Wipe all app data/);
  assert.match(html, /Why Locked-In/);
});

test("manifest and service worker use relative scope", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(manifest.icons?.some((i) => i.src.includes("assets/icon-192")));
  assert.ok(manifest.icons?.some((i) => String(i.purpose || "").includes("maskable")), "missing maskable icon");
  assert.equal(manifest.lang, "en");
  assert.equal(manifest.id, "./");
  assert.ok(Array.isArray(manifest.categories) && manifest.categories.includes("productivity"));
  const sw = read("sw.js");
  assert.match(sw, /network-first|navigate|text\/html/);
  assert.match(sw, /CACHE\s*=/);
  assert.match(sw, /\.\/index\.html/);
  assert.match(sw, /style\.css\?v=\$\{ASSET_V\}/);
  assert.match(sw, /screens\.css\?v=\$\{ASSET_V\}/);
  assert.match(sw, /app\.js\?v=\$\{ASSET_V\}/);
  for (const name of JS_MODULES) {
    assert.match(sw, new RegExp(`\\.\\/js\\/${name.replace(".", "\\.")}`), `SW must precache js/${name}`);
  }
  // Bundled CSS only — individual css/* source modules stay on disk but are not required in PRECACHE.
  assert.doesNotMatch(sw, /\.\/css\/tokens\.css/);
  assert.doesNotMatch(sw, /\.\/css\/mobile\.css/);
  assert.match(sw, /\.\/assets\/icon-512-maskable\.png/);
  assert.match(sw, /\.\/assets\/favicon\.svg/);
  assert.match(sw, /\.\/assets\/logo-mark\.png/);
});

test("screen IDs match navigation data-screen targets", () => {
  const html = read("index.html");
  const screens = [...html.matchAll(/id="((?:setup|timer|report|history|insights|notes|todos|customize|settings)-screen)"/g)].map((m) => m[1]);
  const nav = [...html.matchAll(/data-screen="((?:setup|timer|report|history|insights|notes|todos|customize|settings)-screen)"/g)].map((m) => m[1]);
  for (const id of ["setup-screen", "timer-screen", "history-screen", "insights-screen", "notes-screen", "todos-screen", "settings-screen"]) {
    assert.ok(screens.includes(id), `missing screen ${id}`);
  }
  for (const id of ["setup-screen", "history-screen", "insights-screen", "notes-screen", "todos-screen"]) {
    assert.ok(nav.includes(id), `missing nav target ${id}`);
  }
  assert.ok(html.includes('id="heatmap"') && html.includes('id="heatmap-text"'));
  assert.ok(html.includes('id="setup-heatmap"') && html.includes('id="setup-heatmap-text"'));
  assert.ok(html.includes('id="active-session-banner"') && html.includes('id="resume-session-btn"'));
});

test("app sources expose storage keys and honest save helpers", () => {
  const js = readAppSources();
  for (const key of [
    "locked_in_history_v2",
    "locked_in_active_session_v2",
    "locked_in_theme",
    "locked_in_notes_inbox_v1",
    "locked_in_prefs_v1",
    "locked_in_recent_goals_v1",
    "locked_in_focus_goals_v1",
    "locked_in_todos_v1"
  ]) {
    assert.ok(js.includes(key), `missing storage key ${key}`);
  }
  assert.match(js, /function safeWrite\(/);
  assert.match(js, /function saveHistory\(/);
  assert.match(js, /function notify\(/);
  assert.match(js, /function playChime\(/);
  assert.match(js, /focusVisible:\s*false/);
  assert.match(js, /running in this tab/);
  assert.match(js, /Return to timer/);
  assert.match(js, /Not saved — browser storage unavailable/);
  assert.doesNotMatch(js, /setTimeout\(\(\)=>dom\.taskIntent\.focus/);
});

test("package version matches app version stamp", () => {
  const pkg = JSON.parse(read("package.json"));
  const js = readAppSources();
  assert.equal(pkg.version, "3.1.1");
  assert.match(js, /locked_in_app_version","3\.1\.1"/);
});

test("asset query, SW cache, and precache stay aligned", () => {
  const html = read("index.html");
  const sw = read("sw.js");
  const cssMatch = html.match(/href="\.\/style\.css\?v=(\d+)"/);
  const jsMatch = html.match(/import\("\.\/app\.js\?v=(\d+)"\)/) || html.match(/src="\.\/app\.js\?v=(\d+)"/);
  assert.ok(cssMatch && jsMatch, "index must load versioned CSS and JS");
  assert.equal(cssMatch[1], jsMatch[1], "CSS and JS query versions must match");
  const assetV = cssMatch[1];
  assert.match(html, new RegExp(`href="\\./css/screens\\.css\\?v=${assetV}"`), "index must load deferred screens.css");
  assert.match(sw, new RegExp(`CACHE\\s*=\\s*"locked-in-v\\d+"`));
  const swAssetV = sw.match(/ASSET_V\s*=\s*"(\d+)"/);
  assert.ok(swAssetV, "SW must define ASSET_V");
  assert.equal(swAssetV[1], assetV, "SW ASSET_V must match index asset query");
  assert.match(sw, /style\.css\?v=\$\{ASSET_V\}/);
  assert.match(sw, /screens\.css\?v=\$\{ASSET_V\}/);
  assert.match(sw, /app\.js\?v=\$\{ASSET_V\}/);
  assert.match(sw, /assets\/icon-512-maskable\.png/);
  assert.match(read("app.js"), new RegExp(`runtime\\.js\\?v=${assetV}`));
  assert.match(read("style.css"), /Locked-In core CSS/);
  assert.doesNotMatch(read("style.css"), /@import/);
  assert.match(read("css/screens.css"), /Locked-In screen CSS/);
});
