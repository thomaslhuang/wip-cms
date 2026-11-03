// The Trash: what's in the site's .cms-trash folder, and putting things back.
//
// Everything moved to the Trash goes into .cms-trash/<when>/<where it was>, so each folder
// there is one trip to the Trash (one post, or several picked together). Inside it:
//   a post         its folder (…/my-post/index.md) or its .md file, plus its image folder
//   a list item    <list file>/<name>.json: { from, position, item }, plus its own image folders
//   a file         a picture or other file from the media library (or the old version of one
//                  that was replaced or cropped)
// Putting one back moves it to where it was. Nothing is ever deleted here: to empty the Trash,
// delete .cms-trash (or folders in it) in the Finder.
const fs = require("fs");
const path = require("path");
const site = require("./site");
const { inSite, rel } = site;
const { parseMarkdown } = require("./frontmatter");
const { loadConfig } = require("./config");
const listfile = require("./listfile");

// a trip's folder name ("2026-11-03T21-11-00-123Z") -> when it was
const STAMP = /^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/;
const whenOf = (stamp) => { const m = STAMP.exec(stamp); return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : null; };

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const titleOfPost = (file) => { try { const { data } = parseMarkdown(fs.readFileSync(file, "utf8")); return String(data.title || ""); } catch { return ""; } };

// a list's section (its fields say which image folders belong to an item)
function listSection(file) {
  try { return loadConfig().sections.find((s) => s.store === "list" && s.path === file) || null; } catch { return null; }
}
function itemFolders(section, item) {
  if (!section) return [];
  // (required here, not at the top: entries.js and this file would otherwise need each other)
  try { return require("./entries").ownFolders(section.fields, item); } catch { return []; }
}

// One trip to the Trash -> the things in it: [{ id, kind, title, was, extra: [rel paths in the trip] }]
function thingsIn(stamp) {
  const top = path.join(site.trashDir(), stamp);
  const inTrip = (full) => path.relative(top, full).split(path.sep).join("/");
  const things = [], claimed = new Set();
  const claim = (relPath) => claimed.add(relPath);
  const isClaimed = (relPath) => [...claimed].some((c) => relPath === c || relPath.startsWith(c + "/"));

  // posts and list items first: they take their image folders with them
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const r = inTrip(full);
      if (isDir(full)) {
        if (fs.existsSync(path.join(full, "index.md"))) {
          claim(r);
          things.push({ id: stamp + "/" + r, kind: "post", title: titleOfPost(path.join(full, "index.md")) || name, was: r });
        } else walk(full);
        continue;
      }
      if (/\.md$/i.test(name)) {
        claim(r);
        things.push({ id: stamp + "/" + r, kind: "post", title: titleOfPost(full) || name.replace(/\.md$/i, ""), was: r });
      } else if (/\.json$/i.test(name)) {
        let saved = null;
        try { saved = JSON.parse(fs.readFileSync(full, "utf8")); } catch { /* an ordinary .json file */ }
        if (saved && saved.from && saved.item && typeof saved.item === "object") {
          claim(r);
          const item = saved.item;
          things.push({ id: stamp + "/" + r, kind: "item", title: String(item.title || item.name || item.slug || name.replace(/\.json$/i, "")), was: saved.from, list: saved.from });
        }
      }
    }
  };
  if (isDir(top)) walk(top);

  // the image folders that went with them
  for (const t of things) {
    t.extra = [];
    const folders = t.kind === "post"
      ? [rel(site.imageFolderFor(t.was.endsWith(".md") ? t.was : t.was + "/index.md"))]
      : itemFolders(listSection(t.list), JSON.parse(fs.readFileSync(path.join(top, t.id.slice(stamp.length + 1)), "utf8")).item);
    for (const f of folders) if (f && fs.existsSync(path.join(top, f)) && !isClaimed(f)) { claim(f); t.extra.push(f); }
  }

  // everything else: files on their own (pictures from the media library, old versions)
  const loose = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      if (name === ".DS_Store") continue;
      const full = path.join(dir, name);
      const r = inTrip(full);
      if (isClaimed(r)) continue;
      if (isDir(full)) loose(full);
      else things.push({ id: stamp + "/" + r, kind: "file", title: name, was: r, extra: [] });
    }
  };
  if (isDir(top)) loose(top);
  return things;
}

// the Trash, newest first: [{ stamp, when, things }]
function list() {
  const dir = site.trashDir();
  if (!isDir(dir)) return { trips: [], count: 0 };
  const trips = fs.readdirSync(dir).filter((n) => STAMP.test(n) && isDir(path.join(dir, n))).sort().reverse()
    .map((stamp) => ({ stamp, when: whenOf(stamp), things: thingsIn(stamp) }))
    .filter((t) => t.things.length);
  return { trips, count: trips.reduce((n, t) => n + t.things.length, 0) };
}

// just how many things are in it (for the sidebar)
const count = () => { try { return list().count; } catch { return 0; } };

// where a thing in the Trash really is (never outside .cms-trash)
function inTrash(id) {
  const dir = site.trashDir();
  const full = path.resolve(dir, String(id || ""));
  if (!full.startsWith(dir + path.sep)) throw Object.assign(new Error("That isn't in the Trash."), { status: 400 });
  return full;
}

const taken = (relPath) => Object.assign(new Error(`There's already something at ${relPath}, so it can't go back there. Move or rename that first.`), { status: 409 });

// remove folders left empty in a trip (and the trip itself, once it's empty)
function prune(from, top) {
  let dir = from;
  while (dir.startsWith(top) && isDir(dir)) {
    const left = fs.readdirSync(dir).filter((n) => n !== ".DS_Store");
    if (left.length) break;
    fs.rmSync(dir, { recursive: true, force: true });
    if (dir === top) break;
    dir = path.dirname(dir);
  }
}

// put one thing back where it was; returns { restored: <its path in the site>, file?: <what to open> }
function restore(id) {
  const full = inTrash(id);
  if (!fs.existsSync(full)) throw Object.assign(new Error("It's no longer in the Trash."), { status: 404 });
  const stamp = path.relative(site.trashDir(), full).split(path.sep)[0];
  const top = path.join(site.trashDir(), stamp);
  const thing = thingsIn(stamp).find((t) => t.id === path.relative(site.trashDir(), full).split(path.sep).join("/"));
  if (!thing) throw Object.assign(new Error("It's no longer in the Trash."), { status: 404 });

  // the image folders that went with it go back first (none of them may be in the way)
  for (const f of thing.extra) if (fs.existsSync(inSite(f))) throw taken(f);

  let file = null;
  if (thing.kind === "item") {
    const saved = JSON.parse(fs.readFileSync(full, "utf8"));
    const listData = listfile.readList(saved.from);
    const at = Math.max(0, Math.min(listData.items.length, Number(saved.position || 1) - 1));
    listData.items.splice(at, 0, saved.item);
    listfile.writeList(saved.from, listData);
    fs.rmSync(full, { force: true });
    file = `${saved.from}#${at}`;
  } else {
    const dest = inSite(thing.was);
    if (fs.existsSync(dest)) throw taken(thing.was);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(full, dest);
    if (thing.kind === "post") file = thing.was.endsWith(".md") ? thing.was : thing.was + "/index.md";
  }
  for (const f of thing.extra) {
    const dest = inSite(f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(path.join(top, f), dest);
    prune(path.dirname(path.join(top, f)), top);
  }
  prune(path.dirname(full), top);
  return { restored: thing.was, file, kind: thing.kind };
}

// show the Trash in the Finder (it's made first if there's nothing in it yet)
function reveal() {
  const dir = site.trashDir();
  fs.mkdirSync(dir, { recursive: true });
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  require("child_process").spawn(opener, [dir], { detached: true, stdio: "ignore" }).unref();
  return { ok: true };
}

module.exports = { list, count, restore, reveal, inTrash };
