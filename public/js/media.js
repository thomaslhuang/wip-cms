// The image picker: browse the image library, pick images, upload new ones.
//
// Uploads are converted here in the browser to WebP, longest edge 1500px (what the site
// uses), and saved straight into the post's own folder. Browsers that can't make WebP
// (Safari) send a 1500px JPEG instead; the GitHub Action converts it after you push.
import { h, fill, icon, toast } from "./util.js";
import { api } from "./api.js";

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
  if (urls.length) toast(`Uploaded ${urls.length} image${urls.length > 1 ? "s" : ""}`);
  return urls;
}

// a hidden file input, opened from a button; calls back with the chosen files
export function chooseFiles(multiple, onFiles) {
  const input = h("input", { type: "file", accept: "image/*", multiple, style: { display: "none" } });
  input.addEventListener("change", () => { if (input.files.length) onFiles([...input.files]); input.remove(); });
  document.body.append(input);
  input.click();
}

// where the image library is (from .pages.yml media.input, e.g. "src/images"); set by app.js
let ROOT = "src/images";
export function setMediaRoot(root) { ROOT = root.replace(/\/$/, ""); }

// A folder browser for the image library, used by both the picker window and the Images panel.
//   multiple:  allow picking several
//   onPick(urls, done): called as the selection changes; done=true means "finished picking"
//   pickable:  false for the Images panel (clicking an image copies its address instead)
function libraryView({ folder, multiple = false, pickable = true, onPick = () => {}, onClose = null }) {
  let current = folder || ROOT;
  const selected = [];
  const grid = h("div", { class: "picker-grid" });
  const crumbs = h("div", { class: "picker-crumbs" });

  async function show(path) {
    current = path;
    let list;
    try { list = await api.media(path); } catch (e) { fill(grid, h("p", { class: "muted picker-empty" }, e.message)); return; }
    // breadcrumb: images / blog / 2026 / 10 / post
    fill(crumbs);
    const parts = path.slice(ROOT.length).split("/").filter(Boolean);
    const link = (label, target) => h("button", { class: "crumb", onclick: () => show(target) }, label);
    crumbs.append(link("images", ROOT));
    parts.forEach((p, i) => crumbs.append(" / ", link(p, ROOT + "/" + parts.slice(0, i + 1).join("/"))));
    if (!list.exists) crumbs.append(h("span", { class: "muted" }, "  (new folder: made when you upload)"));

    fill(grid,
      ...list.folders.map((f) => h("button", { class: "picker-folder", onclick: () => show(f.folder) }, icon("folder"), h("span", {}, f.name))),
      ...list.images.map((img) => {
        const tile = h("button", { class: "picker-image" + (selected.includes(img.url) ? " selected" : ""), title: img.name, draggable: !pickable,
          ondragstart: (e) => e.dataTransfer.setData("text/plain", img.url),
          onclick: () => {
            if (!pickable) {
              navigator.clipboard?.writeText(img.url).then(() => toast("Copied " + img.url), () => toast(img.url));
              return;
            }
            const i = selected.indexOf(img.url);
            if (i >= 0) selected.splice(i, 1);
            else { if (!multiple) selected.length = 0; selected.push(img.url); }
            grid.querySelectorAll(".picker-image").forEach((t) => t.classList.toggle("selected", selected.includes(t.dataset.url)));
            onPick(selected.slice(), !multiple && selected.length > 0); // single: pick straight away
          } }, h("img", { src: img.url, loading: "lazy", alt: "" }), h("span", { class: "picker-name" }, img.name));
        tile.dataset.url = img.url;
        return tile;
      }),
    );
    if (!list.folders.length && !list.images.length) grid.append(h("p", { class: "muted picker-empty" }, "No images here yet. Upload some, or go up a folder."));
    onPick(selected.slice(), false);
  }

  // ----- From phone: show a QR code, then watch the folder for photos arriving -----
  const phonePanel = h("div", { class: "phone-panel", hidden: true });
  let phoneTimer = null;
  function stopPhone() { clearInterval(phoneTimer); phoneTimer = null; phonePanel.hidden = true; phoneBtn.classList.remove("on"); }
  async function startPhone() {
    if (phoneTimer) return stopPhone();
    const link = await api.phoneLink(current);
    phoneBtn.classList.add("on");
    phonePanel.hidden = false;
    if (!link.links.length) { fill(phonePanel, h("p", { class: "muted" }, link.error || "No network found.")); return; }
    fill(phonePanel, h("div", { class: "phone-qr", html: link.qr }), h("div", { class: "phone-steps" },
      h("p", {}, "Scan with your phone's camera (same Wi‑Fi as this Mac), choose photos, and they'll appear here."),
      h("p", { class: "muted small" }, "Saving into: " + current),
      h("p", { class: "muted small" }, "Or open: ", h("span", { class: "phone-url" }, link.links[0])),
      h("p", { class: "muted small" }, "If your phone can't connect, macOS may be asking to allow incoming connections for “node”: click Allow.")));
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
      toast(`${fresh.length} photo${fresh.length > 1 ? "s" : ""} from your phone`);
      await show(current);
      if (pickable && !multiple) onPick(selected.slice(), true);
    }, 1500);
  }
  const phoneBtn = h("button", { class: "btn", onclick: () => startPhone() }, icon("phone"), h("span", { class: "label" }, "From phone"));

  async function upload(files) {
    try {
      const urls = await uploadFiles(current, files);
      if (pickable) { if (multiple) selected.push(...urls); else { selected.length = 0; selected.push(urls[urls.length - 1]); } }
      await show(current);
    } catch (e) { toast(e.message, "error"); }
  }

  const el = h("div", { class: "library",
    ondragover: (e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); },
    ondrop: (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); upload([...e.dataTransfer.files]); } } },
    h("div", { class: "picker-head" }, crumbs,
      phoneBtn,
      h("button", { class: "btn", onclick: () => chooseFiles(multiple || !pickable, upload) }, icon("upload"), h("span", { class: "label" }, "Upload")),
      h("button", { class: "icon-btn", title: "Refresh", onclick: () => show(current) }, icon("refresh")),
      onClose ? h("button", { class: "btn ghost", title: "Close", onclick: onClose }, icon("x")) : null),
    phonePanel,
    grid);
  return { el, show: (p) => show(p ?? current), stopPhone, get folder() { return current; } };
}

// the Images panel: browse, upload, phone uploads; click an image to copy its address
export function libraryBrowser({ folder } = {}) {
  const view = libraryView({ folder, pickable: false });
  view.show(folder || ROOT);
  view.el.append(h("p", { class: "muted small picker-tip" }, "Drop images here to upload into this folder. Click one to copy its address."));
  return view;
}

// the picker window. Resolves with an array of /images/... addresses, or null if cancelled.
//   multiple:  pick several
//   folder:    where it opens, and where "Upload" saves (the post's own image folder)
//   phone:     open straight into "From phone" (QR code for uploading from your phone)
export function openPicker({ multiple = false, folder, phone = false } = {}) {
  return new Promise((resolve) => {
    const count = h("span", { class: "muted" });
    const chooseBtn = h("button", { class: "btn primary", onclick: () => finish(current.slice()) }, "Use selected");
    let current = [];
    const finish = (value) => { view.stopPhone(); overlay.remove(); document.removeEventListener("keydown", onKey); resolve(value); };
    const onKey = (e) => { if (e.key === "Escape") finish(null); };
    document.addEventListener("keydown", onKey);
    const view = libraryView({ folder, multiple, onClose: () => finish(null), onPick: (urls, done) => {
      current = urls;
      count.textContent = urls.length ? `${urls.length} selected` : (multiple ? "Pick one or more images" : "Pick an image");
      chooseBtn.disabled = !urls.length;
      if (done) finish(urls);
    } });
    const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) finish(null); } },
      h("div", { class: "dialog picker" }, view.el,
        h("div", { class: "picker-foot" }, count, h("span", { class: "muted small" }, "Tip: drop images onto this window to upload"),
          multiple ? chooseBtn : null)));
    document.body.append(overlay);
    view.show(folder || ROOT).then(() => { if (phone) view.el.querySelector(".picker-head .btn").click(); });
  });
}
