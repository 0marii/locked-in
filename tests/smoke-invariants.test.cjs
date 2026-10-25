"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("escapeHtml present in todos and week-reports", () => {
  assert.match(read("js/todos.js"), /function escapeHtml\b|escapeHtml\s*\(/);
  assert.match(read("js/week-reports.js"), /function escapeHtml\b|escapeHtml\s*\(/);
});

test("sanitizeSvg / SAFE_SVG_TAGS present in customize", () => {
  const src = read("js/customize.js");
  assert.match(src, /function sanitizeSvg\b|sanitizeSvg\s*\(/);
  assert.match(src, /SAFE_SVG_TAGS/);
});

test("critical screen and settings danger IDs exist", () => {
  const html = read("index.html");
  for (const id of [
    "setup-screen",
    "timer-screen",
    "report-screen",
    "history-screen",
    "insights-screen",
    "notes-screen",
    "todos-screen",
    "customize-screen",
    "settings-screen",
    "settings-clear-history-btn",
    "settings-erase-all-btn",
    "settings-export-btn",
    "settings-import-btn"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("SW precache covers bundles + modules, not every raw css/*", () => {
  const sw = read("sw.js");
  const assetV = (sw.match(/ASSET_V\s*=\s*"(\d+)"/) || [])[1];
  assert.ok(assetV, "ASSET_V required");
  assert.match(sw, /`\.\/style\.css\?v=\$\{ASSET_V\}`/);
  assert.match(sw, /`\.\/css\/screens\.css\?v=\$\{ASSET_V\}`/);
  assert.match(sw, /`\.\/app\.js\?v=\$\{ASSET_V\}`/);
  assert.match(sw, /`\.\/js\/bind\.js\?v=\$\{ASSET_V\}`/);
  assert.doesNotMatch(sw, /`\.\/css\/tokens\.css\?v=\$\{ASSET_V\}`/);
  assert.doesNotMatch(sw, /`\.\/css\/settings\.css\?v=\$\{ASSET_V\}`/);
});
