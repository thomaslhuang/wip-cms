const { makeSite, read, write } = require("./helpers");
const test = require("node:test");
const assert = require("node:assert");
const entries = require("../lib/entries");
const trash = require("../lib/trash");

const LIST = "src/_data/projects.json";

test("a list's items are entries, in the file's order", () => {
  makeSite();
  const items = entries.listEntries("projects");
  assert.deepStrictEqual(items.map((i) => i.title), ["First", "Second"]);
  assert.strictEqual(items[1].file, LIST + "#1");
});

test("saving one item changes only that item and keeps the file's indentation", () => {
  const root = makeSite();
  const e = entries.readEntry(LIST + "#0");
  entries.writeEntry(LIST + "#0", { ...e.data, title: "First!" }, "", e.version);
  const text = read(root, LIST);
  assert.match(text, /^\[\n    \{\n        "title": "First!"/);   // still four spaces
  assert.match(text, /"title": "Second"/);
  assert.ok(text.endsWith("]\n"));
});

test("a list changed elsewhere refuses the save", () => {
  const root = makeSite();
  const e = entries.readEntry(LIST + "#0");
  write(root, LIST, JSON.stringify([{ title: "Moved", slug: "moved", year: 1 }, { title: "First", slug: "first", year: 2024 }]));
  assert.throws(() => entries.writeEntry(LIST + "#0", { ...e.data, title: "Mine" }, "", e.version), (err) => err.status === 409);
});

test("two items can't share a permalink", () => {
  makeSite();
  const e = entries.readEntry(LIST + "#0");
  assert.throws(() => entries.writeEntry(LIST + "#0", { ...e.data, slug: "second" }, "", e.version), (err) => err.status === 409);
});

test("new items go at the top, with a free permalink", () => {
  makeSite();
  const made = entries.createEntry("projects", "First", "first");
  assert.strictEqual(made.file, LIST + "#0");
  assert.strictEqual(made.data.slug, "first-2");
});

test("items can be moved", () => {
  makeSite();
  entries.moveEntry("projects", 0, 1);
  assert.deepStrictEqual(entries.listEntries("projects").map((i) => i.title), ["Second", "First"]);
});

test("a trashed item can be put back where it was", () => {
  const root = makeSite();
  entries.deleteEntry(LIST + "#0");
  assert.deepStrictEqual(entries.listEntries("projects").map((i) => i.title), ["Second"]);
  const trip = trash.list().trips[0];
  trash.restore(trip.things[0].id);
  assert.deepStrictEqual(entries.listEntries("projects").map((i) => i.title), ["First", "Second"]);
  assert.match(read(root, LIST), /"slug": "first"/);
});

test("a trashed post comes back with its pictures", () => {
  const fs = require("fs"), path = require("path");
  const root = makeSite();
  entries.deleteEntry("src/blog/2026/10/cafe-opening/index.md");
  assert.ok(!fs.existsSync(path.join(root, "src/blog/2026/10/cafe-opening")));
  assert.ok(!fs.existsSync(path.join(root, "src/images/blog/2026/10/cafe-opening/front.webp")));
  const thing = trash.list().trips[0].things.find((t) => t.kind === "post");
  trash.restore(thing.id);
  assert.ok(fs.existsSync(path.join(root, "src/blog/2026/10/cafe-opening/index.md")));
  assert.ok(fs.existsSync(path.join(root, "src/images/blog/2026/10/cafe-opening/front.webp")));
});
