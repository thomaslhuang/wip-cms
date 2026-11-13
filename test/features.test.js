const { makeSite, write } = require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const entries = require("../lib/entries");
const changes = require("../lib/changes");
const search = require("../lib/search");
const audit = require("../lib/audit");
const media = require("../lib/media");

// ---------- changes waiting to be published ----------

test("git's status is read into files with plain statuses, skipping the Trash", () => {
  const raw = ["?? src/new post/index.md", " M src/blog/a.md", "D  src/old.md", "R  src/b.md", "src/a-before.md", "?? .cms-trash/2026/x.md", "A  src/é.md", ""].join("\0");
  assert.deepStrictEqual(changes.parse(raw), [
    { path: "src/b.md", status: "renamed" },
    { path: "src/blog/a.md", status: "modified" },
    { path: "src/é.md", status: "new" },   // sorted the way people sort: é next to e
    { path: "src/new post/index.md", status: "new" },
    { path: "src/old.md", status: "deleted" },
  ]);
});

test("in a real git folder: new, changed and deleted files are listed", () => {
  const root = makeSite();
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: root, stdio: "ignore" });
  git("init", "-q"); git("add", "-A"); git("commit", "-qm", "start");
  assert.strictEqual(changes.status().count, 0);
  write(root, "src/blog/2026/10/cafe-opening/index.md", "changed\n");
  write(root, "src/blog/new/index.md", "---\ntitle: N\n---\n");
  fs.rmSync(path.join(root, "src/_data/about.json"));
  fs.mkdirSync(path.join(root, ".cms-trash"), { recursive: true }); write(root, ".cms-trash/x/y.md", "t");
  const s = changes.status();
  assert.strictEqual(s.count, 3);
  assert.deepStrictEqual(s.files.map((f) => f.status).sort(), ["deleted", "modified", "new"]);
});

test("outside a git folder there's no count", () => {
  makeSite();
  assert.strictEqual(changes.status().count, null);
});

test("revealing refuses paths outside the site", () => {
  makeSite();
  assert.throws(() => changes.reveal("../../etc/passwd"), (e) => e.status === 400);
});

// ---------- search ----------

test("search finds posts by title and by text, in any order, ignoring capitals", () => {
  makeSite();
  assert.deepStrictEqual(search.run("CAFE", entries).results.map((r) => r.title), ["Cafe opening"]);
  const hit = search.run("tuesday doors", entries).results[0];
  assert.strictEqual(hit.title, "Cafe opening");
  assert.match(hit.snippet, /Tuesday/);
  assert.strictEqual(hit.section, "blog");
});

test("search looks in list items and single pages too", () => {
  makeSite();
  const second = search.run("second", entries).results[0];
  assert.strictEqual(second.file, "src/_data/projects.json#1");
  const about = search.run("this studio", entries).results[0];
  assert.strictEqual(about.file, "src/_data/about.json");
  assert.strictEqual(about.section, null);
});

test("search ignores picture addresses, needs every word, and wants two letters", () => {
  makeSite();
  assert.strictEqual(search.run("front.webp", entries).results.length, 0);
  assert.strictEqual(search.run("tuesday zebra", entries).results.length, 0);
  assert.strictEqual(search.run("t", entries).results.length, 0);
});

test("title matches come before text matches", () => {
  makeSite({ "src/blog/2026/10/second/index.md": "---\ntitle: Opening night\n---\nthe cafe was full\n" });
  const [first, other] = search.run("cafe", entries).results;
  assert.strictEqual(first.title, "Cafe opening");
  assert.strictEqual(other.title, "Opening night");
});

// ---------- picture checks ----------

test("pictures nothing mentions are listed as unused; used ones aren't", () => {
  makeSite({
    "src/images/spare/lonely.webp": "x",
    "src/images/spare/named.webp": "x",
    "src/_data/gallery.json": '[{"src":"named.webp"}]',
  });
  const names = media.unusedImages().map((u) => u.name);
  assert.deepStrictEqual(names, ["lonely.webp"]);
});

test("usage still says where a picture is used", () => {
  makeSite();
  const url = "/images/blog/2026/10/cafe-opening/front.webp";
  assert.deepStrictEqual(media.usage([url])[url], ["src/blog/2026/10/cafe-opening/index.md"]);
});

test("pictures without alt text: blank ones, and missing ones where the section has an alt field", () => {
  makeSite({
    "src/blog/2026/10/second/index.md": [
      "---", "title: Second", "blocks:",
      "  - type: image", "    src: /images/a.webp", "    alt: ''",
      "  - type: image", "    src: /images/b.webp",
      "  - type: image", "    src: /images/c.webp", "    alt: Fine",
      "---", "Words ![](/images/d.webp) and ![described](/images/e.webp) and <img src=\"/images/f.webp\"> and <img src=\"/images/g.webp\" alt=\"ok\">", "",
    ].join("\n"),
  });
  const found = audit.missingAlt();
  assert.strictEqual(found.length, 1);   // the first post has alt on its picture
  assert.strictEqual(found[0].title, "Second");
  assert.deepStrictEqual(found[0].pictures.sort(), ["/images/a.webp", "/images/b.webp", "/images/d.webp", "/images/f.webp"]);
});

test("a section with no alt field isn't flooded with warnings", () => {
  makeSite({ "src/_data/about.json": '{"heading":"x","hero":{"src":"/images/h.webp"}}' });
  assert.deepStrictEqual(audit.missingAlt().filter((m) => m.file === "src/_data/about.json"), []);
});

test("writing checks: stray ** marks and double spaces, leaving code, line breaks and footnote stars alone", () => {
  makeSite({
    "src/blog/2026/10/second/index.md": [
      "---", "title: Second  post", "caption: '**not closed'", "---",
      "A **bold** word, and a **rogue one.", "", "Two  spaces here.", "", "A line break  ", "next line, then a footnote*", "", "    code  block", "", "```", "a  b", "```", "",
    ].join("\n"),
  });
  const found = audit.writing().find((w) => w.title === "Second  post");
  assert.ok(found);
  const kinds = found.issues.map((i) => i.kind + ":" + i.field).sort();
  assert.deepStrictEqual(kinds, ["marks:body", "marks:caption", "spaces:body", "spaces:title"]);
  assert.match(found.issues.find((i) => i.kind === "spaces" && i.field === "body").sample, /Two␣␣spaces/);
});

test("writing checks: clean text has nothing to report", () => {
  const { textIssues } = require("../lib/textcheck");
  assert.deepStrictEqual(textIssues({ title: "Fine", url: "/a/b  c" }, "All **good** here.  \nNext line.\n"), []);
});
