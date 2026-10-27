#!/usr/bin/env node
/** Run tests/*.test.cjs without a shell glob (Windows-safe). */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const dir = path.join(__dirname, "..", "tests");
const files = fs.readdirSync(dir)
  .filter((name) => name.endsWith(".test.cjs"))
  .sort()
  .map((name) => path.join(dir, name));

if (!files.length) {
  console.error("No test files in tests/");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status || 0);
