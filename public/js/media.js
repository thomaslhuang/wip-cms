// The image picker: browse the image library, pick images, upload new ones.
//
// Uploads are converted here in the browser to WebP, longest edge 1500px (what the site
// uses), and saved straight into the post's own folder. Browsers that can't make WebP
// (Safari) send a 1500px JPEG instead; the GitHub Action converts it after you push.
import { h, fill, icon, toast, confirmBox } from "./util.js";
import { api } from "./api.js";
import { t as tr, t2, fmtDate } from "./i18n.js";

const LONGEST_EDGE = 1500;

// one file -> { blob, name } ready to save
export async function prepareForWeb(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    return { blob: file, name: file.name }; // gif, svg...: as they are
  }
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { return { blob: file, name: file.name }; } // e.g. HEIC in Chrome/Firefox: the Action converts it later
  const scale = Math.min(1, LONGEST_EDGE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const stem = file.name.replace(/\.[^.]+$/, "");
  const webp = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.82));
  if (webp && webp.type === "image/webp") return { blob: webp, name: stem + ".webp" };
  const jpg = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  return { blob: jpg || file, name: stem + ".jpg" };
}

// upload several files into a library folder; returns their /images/... addresses
export async function uploadFiles(folder, files) {
  const urls = [];
  for (const file of files) {
    const { blob, name } = await prepareForWeb(file);
    const saved = await api.upload(folder, name, blob);
    urls.push(saved.url);
  }
  if (urls.length) toast(t2(urls.length, "Uploaded {n} image", "Uploaded {n} images"));
  return urls;
}

// what a dropped file is: "image", "video" or "file"
export const kindOf = (file) => /^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|svg|heic|heif|avif)$/i.test(file.name) ? "image"
  : /^video\//.test(file.type) || /\.(mp4|m4v|mov|webm)$/i.test(file.name) ? "video" : "file";

// upload any mix of files (images are made web-ready first); returns [{ url, name, kind }]
export async function uploadAny(folder, files) {
  const out = [];
  for (const file of files) {
    const kind = kindOf(file);
    try {
      if (kind === "image") {
        const { blob, name } = await prepareForWeb(file);
        out.push({ ...(await api.upload(folder, name, blob)), kind });
      } else out.push({ ...(await api.upload(folder, file.name, file, "file")), kind, name: file.name });
    } catch (e) { toast(e.message, "error"); }
  }
  if (out.length) toast(t2(out.length, "Added {n} file", "Added {n} files"));
  return out;
}

// a hidden file input, opened from a button; calls back with the chosen files
export function chooseFiles(multiple, onFiles, accept = "image/*") {
  const input = h("input", { type: "file", accept, multiple, style: { display: "none" } });
  input.addEventListener("change", () => { if (input.files.length) onFiles([...input.files]); input.remove(); });
  document.body.append(input);
  input.click();
}

// where the image library is (from .pages.yml media.input, e.g. "src/images"); set by app.js
let ROOT = "src/images";
export function setMediaRoot(root, sources = []) { ROOT = root.replace(/\/$/, ""); SOURCES = sources; }
let SOURCES = [];
// the web address of a library folder: "src/img/projects/x" -> "/img/projects/x"
export function folderUrl(folder) {
  const f = String(folder).replace(/^\/+|\/+$/g, "");
  const m = SOURCES.find((s) => f === s.input || f.startsWith(s.input + "/"));
  return m ? (m.output.replace(/\/$/, "") + f.slice(m.input.length)) : null;
}

// A folder browser for the media library, used by both the picker window and the Media page.
//   multiple:  allow picking several
//   onPick(urls, done): called as the selection changes; done=true means "finished picking"
//   pickable:  false for the Media page, which shows videos and other files too. Clicking one
//              copies its address; "Select" picks several, to move them to the Trash.
function libraryView({ folder, multiple = false, pickable = true, onPick = () => {}, onClose = null }) {
  let current = folder || ROOT;
  const selected = [];
  const grid = h("div", { class: "picker-grid" });
  const crumbs = h("div", { class: "picker-crumbs" });
  // the Media page's Select mode
  let selecting = false;
  const chosen = new Set();
  let shown = [];
  const selectBar = h("div", { class: "select-bar", hidden: true });
  const drawSelectBar = () => {
    selectBar.hidden = !selecting;
    grid.classList.toggle("selecting", selecting);
    if (!selecting) return;
    fill(selectBar,
      h("span", { class: "select-count" }, chosen.size ? tr("{n} selected", { n: chosen.size }) : tr("Click files to select them")),
      h("button", { class: "btn small", onclick: () => { const all = chosen.size === shown.length; chosen.clear(); if (!all) shown.forEach((i) => chosen.add(i.url)); markChosen(); } },
        chosen.size === shown.length && shown.length ? tr("Select none") : tr("Select all")),
      h("button", { class: "btn small danger", disabled: !chosen.size, onclick: () => trashChosen() }, icon("trash"), tr("Move to Trash")),
      h("button", { class: "btn small primary", onclick: () => setSelecting(false) }, tr("Done")));
  };
  const markChosen = () => { grid.querySelectorAll("[data-url]").forEach((t) => t.classList.toggle("selected", pickable ? selected.includes(t.dataset.url) : chosen.has(t.dataset.url))); if (!pickable) drawSelectBar(); };
  const setSelecting = (on) => { selecting = on; chosen.clear(); selectBtn.classList.toggle("on", on); markChosen(); };
  async function trashChosen() {
    const urls = [...chosen];
    let used = {};
    try { used = await api.mediaUsage(urls); } catch { /* check failed: ask anyway */ }
    const inUse = urls.filter((u) => used[u]?.length);
    const where = [...new Set(inUse.flatMap((u) => used[u]))];
    const message = (inUse.length
      ? tr("{n} of these are still used on the site, in {places}. Moving them to the Trash breaks those until you put them back.", { n: inUse.length, places: where.slice(0, 3).join(", ") + (where.length > 3 ? tr(" and {n} more", { n: where.length - 3 }) : "") }) + " "
      : "") + t2(urls.length, "Move {n} file to the Trash?", "Move {n} files to the Trash?") + " " + tr("They go into the .cms-trash folder in your site, so you can get them back.");
    if (!(await confirmBox(message, tr("Move to Trash")))) return;
    try {
      const { moved } = await api.trashMedia(urls);
      toast(t2(moved.length, "Moved {n} file to .cms-trash", "Moved {n} files to .cms-trash"));
    } catch (e) { toast(e.message, "error"); }
    chosen.clear();
    await show(current);
    markChosen();
  }

  // how the Media page shows a folder, like Finder: icons, a list, or columns (remembered).
  // The picker always shows icons.
  const VIEW_KEY = "wip-media-view";
  let view = pickable ? "icons" : (() => { try { return localStorage.getItem(VIEW_KEY) || "icons"; } catch { return "icons"; } })();
  let focused = null;   // columns: the file whose preview shows in the last column

  const ext = (name) => (name.split(".").pop() || "").toUpperCase();
  const kindLabel = (it) => it.folder ? tr("Folder") : it.kind === "image" ? tr("Image") + " (" + ext(it.name) + ")" : it.kind === "video" ? tr("Video") + " (" + ext(it.name) + ")" : ext(it.name);
  const fmtSize = (n) => n == null ? "" : n < 1024 ? n + " B" : n < 1024 * 1024 ? Math.round(n / 1024) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB";
  const fmtWhen = (ms) => ms ? fmtDate(new Date(ms), "short") : "";
  const previewOf = (img, small) => {
    const kind = img.kind || "image";
    return kind === "image" ? h("img", { src: img.url, loading: "lazy", alt: "", draggable: false })
      : kind === "video" ? h("video", { src: img.url + "#t=0.1", muted: true, preload: small ? "none" : "metadata", playsinline: true })
      : h("span", { class: "picker-file" }, icon("text"), small ? null : h("b", {}, ext(img.name)));
  };
  const isChosen = (img) => (pickable ? selected.includes(img.url) : chosen.has(img.url));

  // clicking a file: pick it (picker), select it (Select mode or ⌘-click), or copy its address
  function clickFile(img, e) {
    if (!pickable && (selecting || e.metaKey || e.shiftKey)) {
      if (!selecting) setSelecting(true);
      chosen.has(img.url) ? chosen.delete(img.url) : chosen.add(img.url);
      markChosen();
      return;
    }
    if (!pickable) {
      if (view === "columns") { focused = img.url; return show(current); }
      navigator.clipboard?.writeText(img.url).then(() => toast(tr("Copied {url}", { url: img.url })), () => toast(img.url));
      return;
    }
    const i = selected.indexOf(img.url);
    if (i >= 0) selected.splice(i, 1);
    else { if (!multiple) selected.length = 0; selected.push(img.url); }
    markChosen();
    onPick(selected.slice(), !multiple && selected.length > 0); // single: pick straight away
  }
  const fileAttrs = (img, cls) => ({ class: cls + (isChosen(img) ? " selected" : ""), title: img.name, draggable: !pickable, "data-url": img.url,
    ondragstart: (e) => e.dataTransfer.setData("text/plain", img.url), onclick: (e) => clickFile(img, e) });

  async function show(path) {
    current = path;
    let list;
    try { list = await api.media(path); } catch (e) { fill(grid, h("p", { class: "muted picker-empty" }, e.message)); return; }
    // breadcrumb: Media / blog / 2026 / 10 / post
    fill(crumbs);
    const parts = path.slice(ROOT.length).split("/").filter(Boolean);
    const link = (label, target) => h("button", { class: "crumb", onclick: () => show(target) }, label);
    crumbs.append(link(tr("Media"), ROOT));
    parts.forEach((p, i) => crumbs.append(" / ", link(p, ROOT + "/" + parts.slice(0, i + 1).join("/"))));
    if (!list.exists) crumbs.append(h("span", { class: "muted" }, "  " + tr("(new folder: made when you upload)")));

    shown = pickable ? list.images : list.items || list.images;
    grid.className = "picker-grid view-" + view + (selecting ? " selecting" : "");
    const empty = !list.folders.length && !shown.length
      ? h("p", { class: "muted picker-empty" }, pickable ? tr("No images here yet. Upload some, or go up a folder.") : tr("Nothing here yet. Upload some, or go up a folder.")) : null;

    if (view === "list") {
      fill(grid,
        h("div", { class: "media-row media-head" }, h("span", {}, tr("Name")), h("span", {}, tr("Kind")), h("span", { class: "num" }, tr("Size")), h("span", {}, tr("Date modified"))),
        ...list.folders.map((f) => h("button", { class: "media-row folder", onclick: () => show(f.folder) },
          h("span", { class: "media-name" }, h("span", { class: "media-thumb" }, icon("folder")), h("span", { class: "media-label" }, f.name)),
          h("span", {}, tr("Folder")), h("span", { class: "num" }, "—"), h("span", {}, fmtWhen(f.modified)))),
        ...shown.map((img) => h("button", fileAttrs(img, "media-row picker-image"),
          h("span", { class: "media-name" }, h("span", { class: "media-thumb" }, previewOf(img, true)), h("span", { class: "media-label" }, img.name), h("span", { class: "picker-check" }, icon("check"))),
          h("span", {}, kindLabel(img)), h("span", { class: "num" }, fmtSize(img.size)), h("span", {}, fmtWhen(img.modified)))),
        empty);
    } else if (view === "columns") {
      // one column per folder from the top down to this one, then the chosen file's preview
      const paths = [ROOT, ...parts.map((p, i) => ROOT + "/" + parts.slice(0, i + 1).join("/"))];
      const lists = await Promise.all(paths.map((p) => (p === path ? list : api.media(p).catch(() => ({ folders: [], items: [] })))));
      const file = shown.find((x) => x.url === focused);
      fill(grid,
        ...lists.map((l, i) => h("div", { class: "media-col" },
          ...l.folders.map((f) => h("button", { class: "media-col-item folder" + (paths[i + 1] === f.folder ? " open" : ""), onclick: () => { focused = null; show(f.folder); } },
            h("span", { class: "media-thumb" }, icon("folder")), h("span", { class: "media-label" }, f.name), icon("chevron", "media-chev"))),
          ...(i === lists.length - 1 ? shown : []).map((img) => h("button", fileAttrs(img, "media-col-item picker-image" + (img.url === focused ? " open" : "")),
            h("span", { class: "media-thumb" }, previewOf(img, true)), h("span", { class: "media-label" }, img.name), h("span", { class: "picker-check" }, icon("check")))),
          i === lists.length - 1 ? empty : null)),
        file ? h("div", { class: "media-col media-preview" },
          h("div", { class: "media-preview-pic" }, file.kind === "video" ? h("video", { src: file.url, controls: true, preload: "metadata" }) : previewOf(file)),
          h("p", { class: "media-preview-name" }, file.name),
          h("p", { class: "muted small" }, kindLabel(file) + " · " + fmtSize(file.size)),
          h("p", { class: "muted small" }, tr("Modified {date}", { date: fmtWhen(file.modified) })),
          h("button", { class: "btn small", onclick: () => navigator.clipboard?.writeText(file.url).then(() => toast(tr("Copied {url}", { url: file.url })), () => toast(file.url)) }, tr("Copy address"))) : null);
      requestAnimationFrame(() => { grid.scrollLeft = grid.scrollWidth; });
    } else {
      // icons: folders are the same size as pictures, with their names underneath
      fill(grid,
        ...list.folders.map((f) => h("button", { class: "picker-image picker-folder", title: f.name, onclick: () => show(f.folder) },
          h("span", { class: "picker-folder-icon" }, icon("folder")), h("span", { class: "picker-name" }, f.name))),
        ...shown.map((img) => h("button", fileAttrs(img, `picker-image kind-${img.kind || "image"}`),
          previewOf(img), img.kind === "video" ? h("span", { class: "picker-kind" }, icon("play")) : null,
          h("span", { class: "picker-name" }, img.name), h("span", { class: "picker-check" }, icon("check")))),
        empty);
    }
    onPick(selected.slice(), false);
  }
  const setView = (v) => {
    view = v;
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* fine */ }
    viewSwitch.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    show(current);
  };
  const viewSwitch = h("div", { class: "segmented icons", role: "group", "aria-label": tr("View") },
    [["icons", "grid", tr("Icons")], ["list", "list", tr("List")], ["columns", "columns", tr("Columns")]].map(([v, ic, label]) =>
      h("button", { class: v === view ? "on" : "", "data-view": v, title: label, "aria-label": label, onclick: () => setView(v) }, icon(ic))));


  // ----- From phone: show a QR code, then watch the folder for photos arriving -----
  const phonePanel = h("div", { class: "phone-panel", hidden: true });
  let phoneTimer = null;
  function stopPhone() { clearInterval(phoneTimer); phoneTimer = null; phonePanel.hidden = true; phoneBtn.classList.remove("on"); }
  async function startPhone() {
    if (phoneTimer) return stopPhone();
    const link = await api.phoneLink(current);
    phoneBtn.classList.add("on");
    phonePanel.hidden = false;
    if (!link.links.length) { fill(phonePanel, h("p", { class: "muted" }, link.error || tr("No network found."))); return; }
    fill(phonePanel, h("div", { class: "phone-qr", html: link.qr }), h("div", { class: "phone-steps" },
      h("p", {}, tr("Scan with your phone's camera (same Wi‑Fi as this Mac), choose photos, and they'll appear here.")),
      h("p", { class: "muted small" }, tr("Saving into: {folder}", { folder: current })),
      h("p", { class: "muted small" }, tr("Or open: "), h("span", { class: "phone-url" }, link.links[0])),
      h("p", { class: "muted small" }, tr("If your phone can't connect, macOS may be asking to allow incoming connections for “node”: click Allow."))));
    const folderAtStart = current;
    const known = new Set((await api.media(current)).images.map((i) => i.url));
    phoneTimer = setInterval(async () => {
      if (current !== folderAtStart || !document.body.contains(grid)) return;
      const now = (await api.media(current)).images;
      const fresh = now.filter((i) => !known.has(i.url));
      if (!fresh.length) return;
      fresh.forEach((i) => known.add(i.url));
      if (pickable) {
        if (multiple) selected.push(...fresh.map((i) => i.url));
        else { selected.length = 0; selected.push(fresh[fresh.length - 1].url); }
      }
      toast(t2(fresh.length, "{n} photo from your phone", "{n} photos from your phone"));
      await show(current);
      if (pickable && !multiple) onPick(selected.slice(), true);
    }, 1500);
  }
  const phoneBtn = h("button", { class: "btn", onclick: () => startPhone() }, icon("phone"), h("span", { class: "label" }, tr("From phone")));
  const selectBtn = h("button", { class: "btn", title: tr("Select several (or ⌘-click)"), onclick: () => setSelecting(!selecting) }, icon("check"), h("span", { class: "label" }, tr("Select")));

  async function upload(files) {
    try {
      // the Media page takes any file (pictures are made web-ready); pickers take pictures
      const urls = pickable ? await uploadFiles(current, files) : (await uploadAny(current, files)).map((f) => f.url);
      if (pickable) { if (multiple) selected.push(...urls); else { selected.length = 0; selected.push(urls[urls.length - 1]); } }
      await show(current);
    } catch (e) { toast(e.message, "error"); }
  }

  const el = h("div", { class: "library",
    ondragover: (e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); },
    ondrop: (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); upload([...e.dataTransfer.files]); } } },
    h("div", { class: "picker-head" }, crumbs,
      phoneBtn,
      h("button", { class: "btn", onclick: () => chooseFiles(multiple || !pickable, upload, pickable ? "image/*" : "") }, icon("upload"), h("span", { class: "label" }, tr("Upload"))),
      pickable ? null : viewSwitch,
      pickable ? null : selectBtn,
      h("button", { class: "icon-btn", title: tr("Refresh"), onclick: () => show(current) }, icon("refresh")),
      onClose ? h("button", { class: "btn ghost", title: tr("Close"), onclick: onClose }, icon("x")) : null),
    phonePanel,
    selectBar,
    grid);
  return { el, show: (p) => show(p ?? current), stopPhone, get folder() { return current; } };
}

// the Media page: browse, upload, phone uploads; click a file to copy its address
export function libraryBrowser({ folder } = {}) {
  const view = libraryView({ folder, pickable: false });
  view.show(folder || ROOT);
  view.el.append(h("p", { class: "muted small picker-tip" }, tr("Drop files here to upload into this folder. Click one to copy its address; ⌘-click or Select to pick several.")));
  return view;
}

// the picker window. Resolves with an array of /images/... addresses, or null if canceled.
//   multiple:  pick several
//   folder:    where it opens, and where "Upload" saves (the post's own image folder)
//   phone:     open straight into "From phone" (QR code for uploading from your phone)
export function openPicker({ multiple = false, folder, phone = false } = {}) {
  return new Promise((resolve) => {
    const count = h("span", { class: "muted" });
    const chooseBtn = h("button", { class: "btn primary", onclick: () => finish(current.slice()) }, tr("Use selected"));
    let current = [];
    const finish = (value) => { view.stopPhone(); overlay.remove(); document.removeEventListener("keydown", onKey); resolve(value); };
    const onKey = (e) => { if (e.key === "Escape") finish(null); };
    document.addEventListener("keydown", onKey);
    const view = libraryView({ folder, multiple, onClose: () => finish(null), onPick: (urls, done) => {
      current = urls;
      count.textContent = urls.length ? tr("{n} selected", { n: urls.length }) : (multiple ? tr("Pick one or more images") : tr("Pick an image"));
      chooseBtn.disabled = !urls.length;
      if (done) finish(urls);
    } });
    const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) finish(null); } },
      h("div", { class: "dialog picker" }, view.el,
        h("div", { class: "picker-foot" }, count, h("span", { class: "muted small" }, tr("Tip: drop images onto this window to upload")),
          multiple ? chooseBtn : null)));
    document.body.append(overlay);
    view.show(folder || ROOT).then(() => { if (phone) view.el.querySelector(".picker-head .btn").click(); });
  });
}
