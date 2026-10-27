#!/usr/bin/env node
/** Syntax-check app.js and every js/*.js without a shell glob (Windows-safe). */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const files = [
  "app.js",
  ...fs.readdirSync(path.join(root, "js"))
    .filter((name) => name.endsWith(".js"))
    .sort()
    .map((name) => path.join("js", name))
];

for (const rel of files) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, rel)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`syntax ok (${files.length} files)`);
