// What's waiting to be published: the files git says changed in the open site since the last
// commit. Read-only. w·i·p cms never commits or pushes: that stays in GitHub Desktop.
const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const site = require("./site");

// "XY path" entries separated by NUL (-z: no quoting of odd file names). A rename or copy is
// followed by one more entry: where it came from.
function parse(raw) {
  const parts = String(raw).split("\0");
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2), file = entry.slice(3);
    if (/[RC]/.test(xy)) i++;   // skip "where it came from"
    if (file === ".cms-trash" || file.startsWith(".cms-trash/")) continue;
    const status = xy === "??" || xy.includes("A") ? "new" : xy.includes("D") ? "deleted" : xy.includes("R") ? "renamed" : "modified";
    files.push({ path: file, status });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function status() {
  try {
    const out = execFileSync("git", ["-c", "core.quotepath=false", "status", "--porcelain", "-z", "--untracked-files=all"],
      { cwd: site.requireSite().root, encoding: "utf8", timeout: 5000, maxBuffer: 32 * 1024 * 1024 });
    const files = parse(out);
    return { count: files.length, files: files.slice(0, 500), more: Math.max(0, files.length - 500) };
  } catch { return { count: null, files: [], more: 0 }; }
}

// show one of the changed files in the Finder (its folder, if it's been deleted)
function reveal(relative) {
  let full = site.inSite(relative);
  const missing = !fs.existsSync(full);
  if (missing) full = path.dirname(full);
  const mac = process.platform === "darwin";
  const args = mac ? (missing ? [full] : ["-R", full]) : [missing ? full : path.dirname(full)];
  const opener = mac ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  spawn(opener, args, { detached: true, stdio: "ignore" }).unref();
  return { ok: true };
}

module.exports = { parse, status, reveal };
