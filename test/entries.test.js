const { makeSite, read, write, POST } = require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const entries = require("../lib/entries");
const { parseMarkdown, stringifyMarkdown } = require("../lib/frontmatter");

const FILE = "src/blog/2026/10/cafe-opening/index.md";

test("front matter keeps dates exactly as written", () => {
  const { data } = parseMarkdown(POST);
  assert.strictEqual(data.date, "2026-10-22T00:00:00-07:00");
  assert.strictEqual(data.draft, false);
});

test("front matter round-trips: saving what was read gives the same file", () => {
  const { data, body } = parseMarkdown(POST);
  assert.strictEqual(stringifyMarkdown(data, body), POST);
});

test("a file without front matter is all body", () => {
  const { data, body } = parseMarkdown("Just words.\n");
  assert.deepStrictEqual(data, {});
  assert.strictEqual(body, "Just words.\n");
});

test("saving leaves everything but the edit alone", () => {
  const root = makeSite();
  const e = entries.readEntry(FILE);
  e.data.title = "Cafe grand opening";
  entries.writeEntry(FILE, e.data, e.body, e.version);
  assert.strictEqual(read(root, FILE), POST.replace("title: Cafe opening", "title: Cafe grand opening"));
});

test("reading gives a version, and a save with it works and gives the next one", () => {
  makeSite();
  const e = entries.readEntry(FILE);
  assert.match(e.version, /^[0-9a-f]{12}$/);
  const saved = entries.writeEntry(FILE, { ...e.data, draft: true }, e.body, e.version);
  assert.notStrictEqual(saved.version, e.version);
  // and that next version can be saved with again
  entries.writeEntry(FILE, { ...saved.data, draft: false }, saved.body, saved.version);
});

test("a file changed elsewhere is not overwritten", () => {
  const root = makeSite();
  const e = entries.readEntry(FILE);
  write(root, FILE, POST.replace("Tuesday", "Wednesday"));   // e.g. a git pull
  assert.throws(() => entries.writeEntry(FILE, { ...e.data, title: "Mine" }, e.body, e.version), (err) => err.status === 409);
  assert.match(read(root, FILE), /Wednesday/);
  assert.doesNotMatch(read(root, FILE), /Mine/);
});

test("a save with no version still works (older pages)", () => {
  makeSite();
  const e = entries.readEntry(FILE);
  entries.writeEntry(FILE, { ...e.data, title: "Fine" }, e.body);
  assert.strictEqual(entries.readEntry(FILE).data.title, "Fine");
});

test("data files get versions too", () => {
  const root = makeSite();
  const e = entries.readEntry("src/_data/about.json");
  write(root, "src/_data/about.json", '{"heading":"Changed"}\n');
  assert.throws(() => entries.writeEntry("src/_data/about.json", { heading: "Mine" }, "", e.version), (err) => err.status === 409);
});

test("a new post starts as a draft, with today's date, in the folder the template says", () => {
  const root = makeSite();
  const made = entries.createEntry("blog", "Hello There", "");
  assert.match(made.file, /^src\/blog\/\d{4}\/\d{2}\/hello-there\/index\.md$/);
  assert.strictEqual(made.data.draft, true);
  assert.match(read(root, made.file), /^---\ntitle: Hello There\n/);
});

test("a second post with the same name gets -2, never overwrites", () => {
  makeSite();
  const a = entries.createEntry("blog", "Same", "");
  const b = entries.createEntry("blog", "Same", "");
  assert.notStrictEqual(a.file, b.file);
  assert.match(b.file, /same-2\/index\.md$/);
});

test("the list of posts shows title, date and draft state", () => {
  makeSite();
  const [post] = entries.listEntries("blog");
  assert.strictEqual(post.title, "Cafe opening");
  assert.strictEqual(post.draft, false);
  assert.strictEqual(post.url, "/blog/2026/10/cafe-opening/");
  assert.match(post.excerpt, /We opened the doors/);
});

test("slugify makes web-safe addresses", () => {
  assert.strictEqual(entries.slugify("Café  Ōpening!"), "cafe-opening");
  assert.strictEqual(entries.slugify("???"), "untitled");
});
