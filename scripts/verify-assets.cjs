#!/usr/bin/env node
/** Fail if asset query versions / CSS bundles are out of sync. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const errors = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(msg) {
  errors.push(msg);
}

const sw = read("sw.js");
const swMatch = sw.match(/ASSET_V\s*=\s*"(\d+)"/);
if (!swMatch) fail("sw.js missing ASSET_V");
const assetV = swMatch ? swMatch[1] : null;

const constants = read("js/constants.js");
const appMatch = constants.match(/APP_ASSET_V\s*=\s*"(\d+)"/);
if (!appMatch) fail("js/constants.js missing APP_ASSET_V");
if (assetV && appMatch && appMatch[1] !== assetV) {
  fail(`APP_ASSET_V (${appMatch[1]}) !== ASSET_V (${assetV})`);
}

const html = read("index.html");
const styleV = html.match(/href="\.\/style\.css\?v=(\d+)"/);
const screensV = html.match(/href="\.\/css\/screens\.css\?v=(\d+)"/);
const appImportV = html.match(/import\("\.\/app\.js\?v=(\d+)"\)/)
  || html.match(/src="\.\/app\.js\?v=(\d+)"/);
if (!styleV) fail("index.html missing style.css?v=");
if (!screensV) fail("index.html missing css/screens.css?v=");
if (!appImportV) fail("index.html missing app.js?v=");
if (assetV && styleV && styleV[1] !== assetV) fail(`index style.css v=${styleV[1]} !== ${assetV}`);
if (assetV && screensV && screensV[1] !== assetV) fail(`index screens.css v=${screensV[1]} !== ${assetV}`);
if (assetV && appImportV && appImportV[1] !== assetV) fail(`index app.js v=${appImportV[1]} !== ${assetV}`);

const appJs = read("app.js");
for (const m of appJs.matchAll(/\?v=(\d+)/g)) {
  if (assetV && m[1] !== assetV) fail(`app.js has ?v=${m[1]} (want ${assetV})`);
}

const jsDir = path.join(root, "js");
for (const name of fs.readdirSync(jsDir).filter((n) => n.endsWith(".js"))) {
  const text = read(path.join("js", name));
  for (const m of text.matchAll(/\?v=(\d+)/g)) {
    if (assetV && m[1] !== assetV) fail(`js/${name} has ?v=${m[1]} (want ${assetV})`);
  }
}

const style = read("style.css");
const screens = read("css/screens.css");
if (/@import/.test(style)) fail("style.css must not use @import (run npm run css)");
if (/@import/.test(screens)) fail("css/screens.css must not use @import (run npm run css)");
if (assetV && !style.includes(`(v=${assetV})`)) fail(`style.css missing bundler banner v=${assetV}`);
if (assetV && !screens.includes(`(v=${assetV})`)) fail(`css/screens.css missing bundler banner v=${assetV}`);

if (!sw.includes("`./style.css?v=${ASSET_V}`") && !sw.includes("./style.css?v=")) {
  fail("sw.js PRECACHE should include style.css");
}
if (!sw.includes("`./css/screens.css?v=${ASSET_V}`") && !sw.includes("./css/screens.css?v=")) {
  fail("sw.js PRECACHE should include css/screens.css");
}

if (errors.length) {
  console.error("assets:verify failed:");
  errors.forEach((e) => console.error(" -", e));
  process.exit(1);
}
console.log(`assets:verify ok (v${assetV})`);
