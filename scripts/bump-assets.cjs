#!/usr/bin/env node
/** Bump ASSET_V / APP_ASSET_V / ?v= queries / SW CACHE, then rebundle CSS. */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function write(rel, text) {
  fs.writeFileSync(path.join(root, rel), text);
}

function listJs() {
  return fs.readdirSync(path.join(root, "js"))
    .filter((n) => n.endsWith(".js"))
    .map((n) => path.join("js", n));
}

const sw = read("sw.js");
const currentMatch = sw.match(/ASSET_V\s*=\s*"(\d+)"/);
if (!currentMatch) {
  console.error("Could not find ASSET_V in sw.js");
  process.exit(1);
}
const current = Number(currentMatch[1]);
const arg = process.argv[2];
const next = arg != null && String(arg).trim() !== ""
  ? Number(arg)
  : current + 1;
if (!Number.isFinite(next) || next < 1) {
  console.error("Invalid version:", arg);
  process.exit(1);
}
const from = String(current);
const to = String(next);

const cacheMatch = sw.match(/CACHE\s*=\s*"locked-in-v(\d+)"/);
const cacheNum = cacheMatch ? Number(cacheMatch[1]) : current;
const nextCache = cacheNum + (next > current ? 1 : 0);

const files = [
  "sw.js",
  "index.html",
  "app.js",
  "js/constants.js",
  ...listJs().filter((p) => p !== "js/constants.js")
];

for (const rel of files) {
  let text = read(rel);
  if (rel === "sw.js") {
    text = text.replace(/ASSET_V\s*=\s*"\d+"/, `ASSET_V = "${to}"`);
    text = text.replace(/CACHE\s*=\s*"locked-in-v\d+"/, `CACHE = "locked-in-v${nextCache}"`);
  } else if (rel === "js/constants.js") {
    text = text.replace(/APP_ASSET_V\s*=\s*"\d+"/, `APP_ASSET_V = "${to}"`);
  }
  text = text.replace(new RegExp(`\\?v=${from}\\b`, "g"), `?v=${to}`);
  // Deferred app boot in index.html uses import("./app.js?v=…")
  text = text.replace(new RegExp(`(app\\.js\\?v=)${from}\\b`, "g"), `$1${to}`);
  write(rel, text);
}

const bundle = spawnSync(process.execPath, [path.join(root, "scripts", "bundle-css.cjs")], {
  cwd: root,
  encoding: "utf8"
});
if (bundle.status !== 0) {
  console.error(bundle.stdout || "");
  console.error(bundle.stderr || "");
  process.exit(bundle.status || 1);
}
if (bundle.stdout) process.stdout.write(bundle.stdout);

console.log(`assets bumped ${from} → ${to} (CACHE locked-in-v${nextCache})`);
