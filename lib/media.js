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

// one folder's contents: sub-folders and images
function listFolder(folderRel) {
  const full = folderRel ? inSite(folderRel) : imagesDir();
  if (!inMedia(full)) throw Object.assign(new Error("Not in the image library"), { status: 400 });
  if (!fs.existsSync(full)) return { folder: rel(full), folders: [], images: [], exists: false };
  const folders = [], images = [];
  for (const name of fs.readdirSync(full).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    if (name.startsWith(".")) continue;
    const p = path.join(full, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) folders.push({ name, folder: rel(p) });
    else if (IMAGE_EXT.test(name)) images.push({ name, url: fileToImageUrl(p), size: stat.size });
  }
  return { folder: rel(full), folders, images, exists: true };
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

module.exports = { listFolder, saveUpload, copyInto, MAX_FILE };
