const { makeSite, read, write } = require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const entries = require("../lib/entries");
const history = require("../lib/history");

const POSTFILE = "src/blog/2026/10/cafe-opening/index.md";
const LIST = "src/_data/projects.json";

function gitSite() {
  const root = makeSite();
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("add", "-A"); git("commit", "-qm", "First version");
  return { root, git };
}

test("history lists earlier commits that differ from now, newest first, and not the identical ones", () => {
  const { root, git } = gitSite();
  const a = read(root, POSTFILE);
  write(root, POSTFILE, a.replace("Cafe opening", "Cafe grand opening")); git("commit", "-qam", "Retitle");
  write(root, "src/_data/about.json", '{"heading":"unrelated"}\n'); git("commit", "-qam", "Other file");
  write(root, POSTFILE, a.replace("Cafe opening", "Cafe working title"));   // not committed: not history yet
  const { versions } = history.list(POSTFILE);
  assert.deepStrictEqual(versions.map((v) => v.subject), ["Retitle", "First version"]);
  assert.match(versions[0].short, /^[0-9a-f]{7}$/);
});

test("the diff says what putting a version back would change", () => {
  const { root, git } = gitSite();
  write(root, POSTFILE, read(root, POSTFILE).replace("Cafe opening", "Cafe grand opening")); git("commit", "-qam", "Retitle");
  const [first] = history.list(POSTFILE).versions.slice(-1);
  const { lines } = history.diff(POSTFILE, first.commit);
  assert.deepStrictEqual(lines.filter((l) => l.op !== " " && l.op !== "…").map((l) => l.op + l.text),
    ["-title: Cafe grand opening", "+title: Cafe opening"]);
});

test("putting a version back restores its exact text and keeps what it replaced", () => {
  const { root, git } = gitSite();
  const original = read(root, POSTFILE);
  write(root, POSTFILE, original.replace("Cafe opening", "Committed change")); git("commit", "-qam", "Change");
  write(root, POSTFILE, original.replace("Cafe opening", "Uncommitted words"));
  const version = entries.readEntry(POSTFILE).version;
  const first = history.list(POSTFILE).versions.find((v) => v.subject === "First version");
  const r = history.restore(POSTFILE, first.commit, version, entries);
  assert.strictEqual(read(root, POSTFILE), original);
  assert.strictEqual(r.data.title, "Cafe opening");
  assert.match(fs.readFileSync(path.join(root, r.kept), "utf8"), /Uncommitted words/);
});

test("a version isn't put back over a file that changed since the editor opened it", () => {
  const { root, git } = gitSite();
  write(root, POSTFILE, read(root, POSTFILE).replace("Cafe opening", "Changed")); git("commit", "-qam", "Change");
  const stale = entries.readEntry(POSTFILE).version;
  write(root, POSTFILE, "edited somewhere else\n");
  const first = history.list(POSTFILE).versions.find((v) => v.subject === "First version");
  assert.throws(() => history.restore(POSTFILE, first.commit, stale, entries), (e) => e.status === 409);
  assert.strictEqual(read(root, POSTFILE), "edited somewhere else\n");
});

test("anything that isn't a commit id is refused", () => {
  gitSite();
  assert.throws(() => history.diff(POSTFILE, "--output=/tmp/x"), (e) => e.status === 400);
  assert.throws(() => history.restore(POSTFILE, "HEAD; rm -rf", null, entries), (e) => e.status === 400);
});

test("a list item's history follows it by permalink, even after it moves in the list", () => {
  const { root, git } = gitSite();
  const items = JSON.parse(read(root, LIST));
  items[0].title = "First, renamed"; write(root, LIST, JSON.stringify(items, null, 4) + "\n"); git("commit", "-qam", "Rename first");
  write(root, LIST, JSON.stringify([items[1], items[0]], null, 4) + "\n"); git("commit", "-qam", "Reorder");
  const id = LIST + "#1";   // "first" is now second in the list
  const { versions } = history.list(id);
  assert.deepStrictEqual(versions.map((v) => v.subject), ["First version"]);   // the reorder didn't change the item
  const version = entries.readEntry(id).version;
  history.restore(id, versions[0].commit, version, entries);
  assert.strictEqual(entries.readEntry(id).data.title, "First");
  assert.strictEqual(entries.readEntry(LIST + "#0").data.title, "Second");   // the other item is untouched
});

test("outside git there's a plain note, not an error", () => {
  makeSite();
  assert.match(history.list(POSTFILE).note, /git/);
});

test("line diff cuts long unchanged stretches", () => {
  const long = Array.from({ length: 40 }, (_, i) => "line " + i).join("\n");
  const { lines } = history.lineDiff(long, long.replace("line 20", "LINE 20"));
  assert.ok(lines.some((l) => l.op === "…"));
  assert.ok(lines.length < 15);
});
