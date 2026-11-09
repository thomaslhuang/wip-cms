// Earlier versions of a post, page or list item, read from git (read-only), and putting one back.
//
// Only commits count: whatever you've changed since the last commit isn't "history" yet, and w·i·p cms
// never commits (that stays in GitHub Desktop). Putting an old version back is a normal change that
// shows up in GitHub Desktop like any other. Before it replaces anything, the text it replaces is
// kept in .cms-trash/replaced-versions/<time>/ so nothing you wrote is ever lost, even if it was
// never committed.
//
// A list item (a project kept in projects.json) is found in each old copy of its file by its
// permalink (slug), or else its title, so history follows it even if it moved in the list.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const site = require("./site");
const listfile = require("./listfile");

const SHA = /^[0-9a-f]{7,40}$/;
const git = (args) => execFileSync("git", ["-c", "core.quotepath=false", ...args],
  { cwd: site.requireSite().root, encoding: "utf8", timeout: 10000, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

const isJson = (p) => /\.json$/i.test(p);

// which file, and which item in it (for a list entry)
function target(id) {
  if (listfile.isListEntry(id)) { const { file, index } = listfile.splitEntry(id); site.inSite(file); return { file, index }; }
  site.inSite(id);
  return { file: String(id), index: null };
}
const identity = (item) => item && typeof item === "object" ? String(item.slug || item.title || "") : "";
const itemText = (item) => JSON.stringify(item, null, 2) + "\n";

// the file as it was at a commit: its text, or null if it didn't exist then
function textAt(commit, file) {
  try { return git(["show", `${commit}:./${file}`]); } catch { return null; }
}

// the text of the thing at that commit (the whole file, or just the list item)
function thingAt(commit, id) {
  const { file, index } = target(id);
  const text = textAt(commit, file);
  if (text == null) return null;
  if (index == null) return text;
  let items;
  try { items = JSON.parse(text); } catch { return null; }   // (YAML lists aren't read back)
  if (!Array.isArray(items)) return null;
  const key = currentIdentity(id);
  const found = key ? items.find((it) => identity(it) === key) : null;
  return found ? itemText(found) : null;
}
function currentIdentity(id) {
  const { file, index } = target(id);
  return identity(listfile.readList(file).items[index]);
}
function currentText(id) {
  const { file, index } = target(id);
  if (index == null) return fs.readFileSync(site.inSite(file), "utf8");
  const item = listfile.readList(file).items[index];
  if (item === undefined) throw Object.assign(new Error("This item isn't in the list any more."), { status: 404 });
  return itemText(item);
}

// earlier versions that differ from now, newest first: [{ commit, short, when, author, subject }]
function list(id, limit = 40) {
  const { file, index } = target(id);
  if (index != null && isJson(file) === false) return { versions: [], note: "History isn't available for items in a YAML list." };
  let log;
  try { log = git(["log", "-n", "80", "--format=%H%x1f%aI%x1f%an%x1f%s", "--", file]); }
  catch { return { versions: [], note: "This site isn't in a git folder, so there's no history to show." }; }
  const now = currentText(id);
  const versions = [];
  let previous = now;
  for (const line of log.split("\n").filter(Boolean)) {
    const [commit, when, author, subject] = line.split("\x1f");
    const text = thingAt(commit, id);
    if (text == null || text === previous) continue;   // gone then, or the same as the one after it
    previous = text;
    versions.push({ commit, short: commit.slice(0, 7), when, author, subject });
    if (versions.length >= limit) break;
  }
  return { versions };
}

// ---------- what putting a version back would change ----------

// a line-by-line comparison: [{ op: " " | "+" | "-", text }] (the long unchanged stretches are cut to "…")
function lineDiff(from, to, context = 3, maxLines = 2500) {
  const a = from.split("\n"), b = to.split("\n");
  if (a.length > maxLines || b.length > maxLines) return { lines: [], tooBig: true };
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ op: " ", text: a[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) ops.push({ op: "-", text: a[i++] });
    else ops.push({ op: "+", text: b[j++] });
  }
  while (i < n) ops.push({ op: "-", text: a[i++] });
  while (j < m) ops.push({ op: "+", text: b[j++] });
  // keep changes and a few lines around them
  const keep = new Array(ops.length).fill(false);
  ops.forEach((o, k) => { if (o.op !== " ") for (let x = Math.max(0, k - context); x <= Math.min(ops.length - 1, k + context); x++) keep[x] = true; });
  const lines = [];
  let cut = false;
  ops.forEach((o, k) => { if (keep[k]) { lines.push(o); cut = false; } else if (!cut) { lines.push({ op: "…", text: "" }); cut = true; } });
  return { lines };
}

// what putting this version back would change: lines with "-" go away, lines with "+" come back
function diff(id, commit) {
  if (!SHA.test(String(commit))) throw Object.assign(new Error("Not a version."), { status: 400 });
  const old = thingAt(commit, id);
  if (old == null) throw Object.assign(new Error("That version isn't there any more."), { status: 404 });
  return lineDiff(currentText(id), old);
}

// ---------- putting a version back ----------

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
function keepCurrent(id) {
  const { file, index } = target(id);
  const name = index == null ? file : file + `#${index}.json`;
  const to = path.join(site.trashDir(), "replaced-versions", stamp(), name);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, currentText(id));
  return site.rel(to);
}

// version: the one the editor was showing (entries.fileVersion or a list item's), so a version isn't
// put back over a file that has changed since
function restore(id, commit, version, entries) {
  if (!SHA.test(String(commit))) throw Object.assign(new Error("Not a version."), { status: 400 });
  const old = thingAt(commit, id);
  if (old == null) throw Object.assign(new Error("That version isn't there any more."), { status: 404 });
  const { file, index } = target(id);
  if (index == null) {
    const full = site.inSite(file);
    if (version && entries.fileVersion(fs.readFileSync(full, "utf8")) !== version) {
      throw Object.assign(new Error("This file was changed somewhere else. Reopen it, then try again."), { status: 409 });
    }
    const kept = keepCurrent(id);
    fs.writeFileSync(full, old, "utf8");
    return { ...entries.readEntry(id), kept };
  }
  const kept = keepCurrent(id);
  const saved = entries.writeEntry(id, JSON.parse(old), "", version);
  return { ...saved, kept };
}

module.exports = { list, diff, restore, lineDiff };
