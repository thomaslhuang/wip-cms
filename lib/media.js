// The image library (src/images/...): browsing folders and saving uploads.
//
// Uploads arrive already converted to WebP at 1500px by the browser (see
// public/js/media.js). If a browser can't make WebP (Safari), the photo arrives as JPEG.
const fs = require("fs");
const path = require("path");
const { imagesDir, inSite, rel, inMedia, fileToImageUrl } = require("./site");

const IMAGE_EXT = /\.(webp|jpe?g|png|gif|svg|heic|heif|avif)$/i;
// other files you can drop into a post from this computer (not from the phone page)
const FILE_EXT = /\.(mp4|m4v|mov|webm|mp3|m4a|wav|pdf|zip|txt|csv|docx?|xlsx?|pptx?|key|pages|numbers)$/i;
const MAX_FILE = 95 * 1024 * 1024; // GitHub refuses files over 100 MB

const kindOf = (name) => IMAGE_EXT.test(name) ? "image" : /\.(mp4|m4v|mov|webm)$/i.test(name) ? "video" : "file";

// one folder's contents: sub-folders, images (for pickers), and everything (images, videos,
// other files) for the Media page
function listFolder(folderRel) {
  const full = folderRel ? inSite(folderRel) : imagesDir();
  if (!inMedia(full)) throw Object.assign(new Error("Not in the image library"), { status: 400 });
  if (!fs.existsSync(full)) return { folder: rel(full), folders: [], images: [], exists: false };
  const folders = [], images = [], items = [];
  for (const name of fs.readdirSync(full).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    if (name.startsWith(".")) continue;
    const p = path.join(full, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) folders.push({ name, folder: rel(p) });
    else if (IMAGE_EXT.test(name) || FILE_EXT.test(name)) {
      const item = { name, url: fileToImageUrl(p), size: stat.size, kind: kindOf(name) };
      items.push(item);
      if (item.kind === "image") images.push(item);
    }
  }
  return { folder: rel(full), folders, images, items, exists: true };
}

// save an upload into a library folder, never overwriting: photo.webp, photo-2.webp, ...
//   anyFile: true allows FILE_EXT too (videos, PDFs...)
function saveUpload(folderRel, filename, buffer, anyFile = false) {
  const folder = inSite(folderRel);
  if (!inMedia(folder)) throw Object.assign(new Error("Uploads must go in the image library"), { status: 400 });
  const safe = path.basename(String(filename)).replace(/[^\w.\- ]+/g, "-");
  if (!IMAGE_EXT.test(safe) && !(anyFile && FILE_EXT.test(safe))) {
    throw Object.assign(new Error((anyFile ? "Can't add this kind of file: " : "Not an image file: ") + filename), { status: 400 });
  }
  if (buffer.length > MAX_FILE) throw Object.assign(new Error(`${filename} is over 95 MB; GitHub won't accept files that big. Try a smaller export.`), { status: 413 });
  fs.mkdirSync(folder, { recursive: true });
  const ext = path.extname(safe), stem = path.basename(safe, ext);
  let target = path.join(folder, safe);
  for (let n = 2; fs.existsSync(target); n++) target = path.join(folder, `${stem}-${n}${ext}`);
  fs.writeFileSync(target, buffer);
  return { url: fileToImageUrl(target), name: path.basename(target) };
}

// a picture chosen from elsewhere in the library, copied into a field's own folder (for fields
// that save just the file name, which only works for pictures in that folder)
function copyInto(url, folderRel) {
  const from = require("./site").imageUrlToFile(url);
  if (!fs.existsSync(from)) throw Object.assign(new Error("Not found: " + url), { status: 404 });
  if (path.dirname(from) === inSite(folderRel)) return { url: fileToImageUrl(from), name: path.basename(from) };
  return saveUpload(folderRel, path.basename(from), fs.readFileSync(from), true);
}

// ---------- moving files to the Trash ----------
// Which of these files are still used somewhere in the site's content (posts, pages, data
// files, templates)? Looks for the file's address, and for its bare name (for sites that
// store just "photo.jpg").
const TEXT = /\.(md|markdown|json|ya?ml|njk|liquid|html?|js|css|11ty\.js)$/i;
const SKIP_DIRS = new Set(["node_modules", "_site", ".git", ".cms-trash"]);
function usage(urls) {
  const site = require("./site");
  const wanted = urls.map((url) => ({ url, name: path.basename(decodeURI(url)) }));
  const found = Object.fromEntries(urls.map((u) => [u, []]));
  const media = site.requireSite().mediaSources.map((m) => inSite(m.input));
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (SKIP_DIRS.has(name) || name.startsWith(".") && name !== ".pages.yml") continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) { if (!media.includes(full)) walk(full); continue; }
      if (!TEXT.test(name) || st.size > 2_000_000) continue;
      const text = fs.readFileSync(full, "utf8");
      for (const w of wanted) if (text.includes(w.url) || text.includes(w.name)) found[w.url].push(rel(full));
    }
  };
  walk(site.requireSite().root);
  return found;
}

// into .cms-trash/<time>/<where it was>, so it can be put back
function trash(urls) {
  const site = require("./site");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const moved = [];
  for (const url of urls) {
    const from = site.imageUrlToFile(url);
    if (!inMedia(from) || !fs.existsSync(from) || fs.statSync(from).isDirectory()) continue;
    const to = path.join(site.trashDir(), stamp, rel(from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    moved.push(rel(to));
  }
  return { moved };
}

module.exports = { listFolder, saveUpload, copyInto, usage, trash, MAX_FILE };
